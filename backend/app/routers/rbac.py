from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List
from pathlib import Path
import json

router = APIRouter(tags=["rbac"])

BASE = Path(__file__).resolve().parent.parent
ROLES_FILE = BASE / "rbac_roles.json"
ASSIGN_FILE = BASE / "rbac_assignments.json"  # user/profile -> roleId
ACTIVE_FILE = BASE / "rbac_active.json"       # current active roleId for UI

DEFAULT_ROLES = [
    {"id": "admin", "name": "Admin", "permissions": {"read": True, "write": True, "export": True, "indexes": True, "admin": True}},
    {"id": "analyst", "name": "Analyst", "permissions": {"read": True, "write": False, "export": True, "indexes": True, "admin": False}},
    {"id": "viewer", "name": "Viewer", "permissions": {"read": True, "write": False, "export": False, "indexes": False, "admin": False}},
]


def _read_json(p: Path, default):
    if not p.exists():
        return default
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:
        return default


def _write_json(p: Path, data):
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


@router.get("/rbac/roles")
def get_roles():
    return {"items": _read_json(ROLES_FILE, DEFAULT_ROLES)}


@router.post("/rbac/roles")
def save_roles(payload: Dict[str, Any]):
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")
    _write_json(ROLES_FILE, items)
    return {"ok": True}


@router.get("/rbac/assignments")
def get_assignments():
    return {"items": _read_json(ASSIGN_FILE, [])}


@router.post("/rbac/assignments")
def save_assignments(payload: Dict[str, Any]):
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")
    _write_json(ASSIGN_FILE, items)
    return {"ok": True}


@router.get("/rbac/active")
def get_active():
    data = _read_json(ACTIVE_FILE, {"roleId": "admin"})
    return data


@router.post("/rbac/active")
def set_active(payload: Dict[str, Any]):
    role_id = payload.get("roleId")
    if not role_id:
        raise HTTPException(status_code=400, detail="roleId is required")
    _write_json(ACTIVE_FILE, {"roleId": role_id})
    return {"ok": True}
