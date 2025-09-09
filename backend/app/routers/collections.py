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


@router.get("/collections/{db}/{collection}/stats")
def collection_stats(db: str, collection: str, connection_id: str = Query(..., alias="connectionId")):
    """Return MongoDB collStats for the specified collection."""
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        stats = client[db].command("collStats", collection)
        # Ensure serializable
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


@router.post("/collections/{db}")
def create_collection(db: str, name: str, connection_id: str = Query(..., alias="connectionId")):
    """Create a new collection in the given database."""
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        client[db].create_collection(name)
        return {"created": name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/collections/{db}/{collection}")
def drop_collection(db: str, collection: str, connection_id: str = Query(..., alias="connectionId")):
    """Drop a collection in the given database."""
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        client[db].drop_collection(collection)
        return {"dropped": collection}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
