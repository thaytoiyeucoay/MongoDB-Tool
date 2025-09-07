from typing import Dict, Optional
from pymongo import MongoClient
import threading
import uuid


class ConnectionManager:
    """
    Manages MongoClient instances in-memory.
    For production, consider persistence and auth.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._clients: Dict[str, MongoClient] = {}

    def create(self, uri: str, server_selection_timeout_ms: int = 5000) -> str:
        client = MongoClient(uri, serverSelectionTimeoutMS=server_selection_timeout_ms)
        # Trigger server selection to validate connection
        client.admin.command("ping")
        conn_id = str(uuid.uuid4())
        with self._lock:
            self._clients[conn_id] = client
        return conn_id

    def get(self, conn_id: str) -> Optional[MongoClient]:
        with self._lock:
            return self._clients.get(conn_id)

    def close(self, conn_id: str) -> bool:
        with self._lock:
            client = self._clients.pop(conn_id, None)
        if client:
            client.close()
            return True
        return False

    def list_ids(self):
        with self._lock:
            return list(self._clients.keys())


conn_mgr = ConnectionManager()
