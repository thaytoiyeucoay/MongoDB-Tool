from fastapi import APIRouter, HTTPException, Query
from typing import Any, List, Dict
import json
from pathlib import Path
from datetime import datetime

from ..services.mongo import conn_mgr
from ..utils import to_jsonable

router = APIRouter(tags=["aggregation"])


@router.post("/agg/run")
def run_aggregation(payload: dict, connection_id: str = Query(..., alias="connectionId")):
    """
    Run an aggregation pipeline on a collection.
    payload: { db: str, collection: str, pipeline: List[dict] }
    """
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        db = payload.get("db")
        coll = payload.get("collection")
        pipeline: List[dict] = payload.get("pipeline") or []
        if not db or not coll:
            raise ValueError("Missing db or collection")
        col = client[db][coll]
        cursor = col.aggregate(pipeline, allowDiskUse=True)
        items = list(cursor)
        return {"items": [to_jsonable(x) for x in items]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Saved aggregations (simple JSON file persistence)
_SAVE_FILE = Path(__file__).resolve().parent.parent / "saved_aggregations.json"


def _read_saved() -> List[Dict[str, Any]]:
    if not _SAVE_FILE.exists():
        return []
    try:
        return json.loads(_SAVE_FILE.read_text("utf-8"))
    except Exception:
        return []


def _write_saved(items: List[Dict[str, Any]]):
    _SAVE_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), "utf-8")


@router.get("/agg/saved")
def list_saved_aggregations() -> Dict[str, Any]:
    return {"items": _read_saved()}


@router.post("/agg/saved")
def save_aggregation(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepts: { name, db, collection, pipeline, viz }
    Adds: id, createdAt
    """
    try:
        items = _read_saved()
        new_item = {
            "id": f"agg_{int(datetime.utcnow().timestamp()*1000)}",
            "name": item.get("name") or "Untitled",
            "db": item.get("db"),
            "collection": item.get("collection"),
            "pipeline": item.get("pipeline") or [],
            "viz": item.get("viz") or "table",
            "createdAt": datetime.utcnow().isoformat() + "Z",
        }
        items.insert(0, new_item)
        _write_saved(items)
        return {"ok": True, "item": new_item}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
