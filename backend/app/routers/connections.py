from fastapi import APIRouter, HTTPException
from ..services.mongo import conn_mgr
from ..schemas import ConnectRequest, ConnectResponse

router = APIRouter(tags=["connections"])


@router.post("/connect", response_model=ConnectResponse)
def connect(req: ConnectRequest):
    try:
        conn_id = conn_mgr.create(req.uri)
        return {"connectionId": conn_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {e}")


@router.get("/connections")
def list_connections():
    return {"connections": conn_mgr.list_ids()}


@router.delete("/connections/{connection_id}")
def close_connection(connection_id: str):
    ok = conn_mgr.close(connection_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"closed": True}
