from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import tempfile
import subprocess
import shutil
import io
import zipfile
from pathlib import Path

from ..services.sync_jobs import sync_mgr

router = APIRouter(tags=["sync"])


class StartSyncRequest(BaseModel):
    sourceUri: str = Field(..., alias="source_uri")
    sourceDb: str = Field(..., alias="source_db")
    destUri: str = Field(..., alias="dest_uri")
    destDb: str = Field(..., alias="dest_db")


@router.post("/sync/start")
def start_sync(payload: StartSyncRequest):
    try:
        job = sync_mgr.create(payload.sourceUri, payload.sourceDb, payload.destUri, payload.destDb)
        return {"id": job.id, "status": job.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/sync/{job_id}")
def get_sync(job_id: str):
    job = sync_mgr.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "status": job.status,
        "error": job.error,
        "logs": job.logs,
        "progress": getattr(job, "progress", 0),
    }


@router.get("/sync")
def list_sync():
    return {"jobs": sync_mgr.list()}


@router.post("/sync/{job_id}/cancel")
def cancel_sync(job_id: str):
    ok = sync_mgr.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


def _run_cmd(args: list):
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out = []
    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, ''):
        out.append(line)
    proc.wait()
    if proc.returncode != 0:
        raise HTTPException(status_code=400, detail="Command failed: {}\n{}".format(' '.join(args), ''.join(out)))
    return ''.join(out)


@router.post("/sync/offline/export")
def offline_export(uri: str = Form(...), db: str = Form(...)):
    """Dump 1 database ra ZIP (thư mục output mongodump được nén)"""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            out_dir = Path(temp_dir) / "dump"
            _run_cmd([
                'mongodump', f'--uri={uri}', f'--db={db}', f'--out={out_dir}'
            ])
            # Zip the dump directory
            mem = io.BytesIO()
            with zipfile.ZipFile(mem, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
                for p in out_dir.rglob('*'):
                    zf.write(p, p.relative_to(out_dir.parent))
            mem.seek(0)
            filename = f"{db}_dump.zip"
            headers = {"Content-Disposition": f"attachment; filename=\"{filename}\""}
            return StreamingResponse(mem, media_type='application/zip', headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync/offline/import")
def offline_import(file: UploadFile = File(...), dest_uri: str = Form(...), dest_db: str = Form(...)):
    """Nhận ZIP dump và restore vào DB đích."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = Path(temp_dir) / file.filename
            with open(zip_path, 'wb') as f:
                shutil.copyfileobj(file.file, f)
            extract_dir = Path(temp_dir) / "extract"
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(extract_dir)
            # mongorestore: nếu dump chứa tên DB gốc, map sang dest_db
            # dump structure: dump/<db>/*.bson
            _run_cmd([
                'mongorestore', f'--uri={dest_uri}', f'--nsTo={dest_db}.*', str(extract_dir)
            ])
            return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
