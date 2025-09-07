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
