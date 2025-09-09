from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Tuple
import threading
import time
from pymongo.errors import PyMongoError

from ..services.mongo import conn_mgr

router = APIRouter(tags=["changes"])

# In-memory change stream registry
# key: (connectionId, db, collection) -> { thread, stop, events: List[Dict], cursor: int }
_registry: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
_lock = threading.Lock()


def _ensure_stream(connection_id: str, db: str, collection: str):
    key = (connection_id, db, collection)
    with _lock:
        if key in _registry and _registry[key].get("thread") and _registry[key]["thread"].is_alive():
            return
        client = conn_mgr.get(connection_id)
        if not client:
            raise HTTPException(status_code=404, detail="Connection not found")
        col = client[db][collection]
        stop = threading.Event()
        buf: List[Dict[str, Any]] = []
        cursor_idx = 0

        def run():
            nonlocal cursor_idx
            try:
                with col.watch(full_document='updateLookup') as stream:
                    while not stop.is_set():
                        try:
                            change = stream.try_next()
                            if change is None:
                                time.sleep(0.1)
                                continue
                            evt = {
                                "operationType": change.get("operationType"),
                                "ns": change.get("ns"),
                                "documentKey": change.get("documentKey"),
                                "fullDocument": change.get("fullDocument"),
                                "updateDescription": change.get("updateDescription"),
                                "clusterTime": str(change.get("clusterTime")),
                                "ts": time.time(),
                            }
                            buf.append(evt)
                            if len(buf) > 1000:
                                # keep last 1000
                                drop = len(buf) - 1000
                                buf[:drop] = []
                                cursor_idx -= drop
                                if cursor_idx < 0:
                                    cursor_idx = 0
                        except PyMongoError:
                            time.sleep(0.5)
                            continue
            except Exception:
                # stream failed; exit thread
                pass

        th = threading.Thread(target=run, daemon=True)
        th.start()
        _registry[key] = {"thread": th, "stop": stop, "events": buf, "cursor": cursor_idx}


@router.get("/changes/poll")
def poll_changes(connection_id: str = Query(..., alias="connectionId"), db: str = Query(...), collection: str = Query(...), cursor: int = 0):
    """
    Long-pollish endpoint: returns new events since given cursor and latest cursor.
    Starts a watcher for the (connectionId, db, collection) tuple if not already running.
    """
    _ensure_stream(connection_id, db, collection)
    key = (connection_id, db, collection)
    with _lock:
        reg = _registry.get(key)
        if not reg:
            return {"events": [], "cursor": cursor}
        buf: List[Dict[str, Any]] = reg["events"]
        latest = len(buf)
        if cursor < 0 or cursor > latest:
            cursor = max(0, latest - 100)
        out = buf[cursor:latest]
        return {"events": out, "cursor": latest}


@router.post("/changes/stop")
def stop_changes(connection_id: str = Query(..., alias="connectionId"), db: str = Query(...), collection: str = Query(...)):
    key = (connection_id, db, collection)
    with _lock:
        reg = _registry.get(key)
        if not reg:
            return {"ok": True}
        stop = reg.get("stop")
        if stop:
            stop.set()
        _registry.pop(key, None)
        return {"ok": True}
