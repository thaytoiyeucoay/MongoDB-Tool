from fastapi import APIRouter, HTTPException, Query
from typing import List
from ..services.mongo import conn_mgr

router = APIRouter(tags=["collections"])


@router.get("/collections", response_model=List[str])
def list_collections(
    db: str,
    connection_id: str = Query(..., alias="connectionId"),
):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        return client[db].list_collection_names()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
