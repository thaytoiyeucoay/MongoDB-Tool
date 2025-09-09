from fastapi import APIRouter, HTTPException, Query
from typing import List
from ..services.mongo import conn_mgr

router = APIRouter(tags=["databases"])


@router.get("/databases", response_model=List[str])
def list_databases(connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        return [db for db in client.list_database_names() if db not in ["admin", "config", "local"]]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/databases/{db}/stats")
def database_stats(db: str, connection_id: str = Query(..., alias="connectionId")):
    """Return MongoDB dbStats for the specified database."""
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        stats = client[db].command("dbStats")
        # Ensure all values are JSON serializable
        def to_primitive(v):
            try:
                import datetime
                if isinstance(v, (int, float, str, bool)) or v is None:
                    return v
                if isinstance(v, (list, tuple)):
                    return [to_primitive(x) for x in v]
                if isinstance(v, dict):
                    return {k: to_primitive(x) for k, x in v.items()}
                if isinstance(v, (datetime.datetime, datetime.date)):
                    return v.isoformat()
                return str(v)
            except Exception:
                return str(v)
        return to_primitive(stats)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
