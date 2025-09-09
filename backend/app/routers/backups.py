from fastapi import APIRouter, HTTPException
from fastapi import Query
from typing import Any, Dict, List
from pathlib import Path
import shutil
import tempfile
import json
import datetime
import subprocess
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..services.mongo import conn_mgr

router = APIRouter(tags=["backups"])

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"
BACKUP_DIR.mkdir(exist_ok=True)
SCHEDULE_FILE = Path(__file__).resolve().parent.parent / "backup_schedule.json"

scheduler = BackgroundScheduler()
if not scheduler.running:
    scheduler.start()


def _read_schedule() -> Dict[str, Any]:
    if not SCHEDULE_FILE.exists():
        return {"active": False, "cron": "0 2 * * *", "retention": 7, "items": []}
    try:
        return json.loads(SCHEDULE_FILE.read_text("utf-8"))
    except Exception:
        return {"active": False, "cron": "0 2 * * *", "retention": 7, "items": []}


def _write_schedule(data: Dict[str, Any]):
    SCHEDULE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def _job_id(connection_id: str, db: str) -> str:
    return f"backup_{connection_id}_{db}"


def _prune_retention(retention: int):
    # Keep latest 'retention' zip files per (connection, db) pair
    for group in BACKUP_DIR.glob("*/*/"):
        zips = sorted(group.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
        for z in zips[retention:]:
            try:
                z.unlink()
            except Exception:
                pass


def _run_backup(connection_id: str, db: str):
    client = conn_mgr.get(connection_id)
    if not client:
        return
    BACKUP_DIR.mkdir(exist_ok=True)
    subdir = BACKUP_DIR / connection_id / db
    subdir.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_zip = subdir / f"dump_{ts}.zip"
    # Use mongodump then zip
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            dump_dir = Path(temp_dir) / "dump"
            uri = client.address  # may be tuple, so not directly useful
            # Better: reconstruct URI is not available. We cannot from client.
            # Require schedule to store URI; so we read from schedule items.
            sched = _read_schedule()
            item = next((i for i in sched.get("items", []) if i.get("connectionId") == connection_id and i.get("db") == db), None)
            if not item:
                return
            uri_value = item.get("uri")
            cmd = [
                "mongodump",
                f"--uri={uri_value}",
                f"--db={db}",
                f"--out={str(dump_dir)}",
            ]
            subprocess.run(cmd, check=True)
            # Zip
            shutil.make_archive(str(out_zip.with_suffix("")), 'zip', dump_dir)
    except Exception:
        # ignore failure to keep scheduler robust
        return


@router.post("/backups/schedule")
def schedule_backup(
    connection_id: str = Query(..., alias="connectionId"),
    uri: str = Query(...),
    db: str = Query(...),
    cron: str = Query("0 2 * * *"),
    retention: int = Query(7),
    active: bool = Query(True),
):
    """Create/replace a scheduled backup for a (connectionId, db) pair."""
    try:
        data = _read_schedule()
        items: List[Dict[str, Any]] = data.get("items", [])
        # remove existing entry
        items = [i for i in items if not (i.get("connectionId") == connection_id and i.get("db") == db)]
        items.append({
            "connectionId": connection_id,
            "uri": uri,
            "db": db,
            "cron": cron,
            "retention": max(1, int(retention)),
            "active": bool(active),
        })
        data["items"] = items
        _write_schedule(data)
        # update scheduler
        job_id = _job_id(connection_id, db)
        try:
            scheduler.remove_job(job_id)
        except Exception:
            pass
        if active:
            scheduler.add_job(_run_backup, CronTrigger.from_crontab(cron), id=job_id, args=[connection_id, db], replace_existing=True)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/backups")
def list_backups(connection_id: str = Query(..., alias="connectionId"), db: str = Query(...)):
    data = _read_schedule()
    item = next((i for i in data.get("items", []) if i.get("connectionId") == connection_id and i.get("db") == db), None)
    # list files
    subdir = BACKUP_DIR / connection_id / db
    files = []
    if subdir.exists():
        for p in sorted(subdir.glob("*.zip"), key=lambda x: x.stat().st_mtime, reverse=True):
            files.append({
                "filename": p.name,
                "size": p.stat().st_size,
                "mtime": datetime.datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
            })
    return {"schedule": item, "files": files}
