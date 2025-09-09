from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict
from pymongo import ASCENDING, DESCENDING

from ..services.mongo import conn_mgr
from ..schemas import IndexCreateRequest

router = APIRouter(tags=["indexes"])


@router.get("/indexes/{db}/{collection}")
def list_indexes(db: str, collection: str, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        idx = []
        for it in col.list_indexes():
            # it is dict-like
            idx.append({k: v for k, v in it.items()})
        return idx
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/indexes")
def create_index(payload: IndexCreateRequest, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[payload.db][payload.collection]
        keys = [(field, ASCENDING if int(direction) >= 0 else DESCENDING) for field, direction in payload.keys]
        kwargs: Dict[str, Any] = {"name": payload.name, "unique": payload.unique}
        if payload.partialFilterExpression:
            kwargs["partialFilterExpression"] = payload.partialFilterExpression
        if payload.collation:
            kwargs["collation"] = payload.collation
        name = col.create_index(keys, **kwargs)
        return {"name": name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/indexes/{db}/{collection}/{name}")
def drop_index(db: str, collection: str, name: str, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        col.drop_index(name)
        return {"dropped": name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
