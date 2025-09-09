from fastapi import APIRouter
from typing import Any, Dict, List
import json
from pathlib import Path
import re

router = APIRouter(tags=["masking"])

_STORE = Path(__file__).resolve().parent.parent / "masking_profile.json"

_DEFAULT: Dict[str, Any] = {
    "active": False,
    "fields": ["email", "phone", "cardNumber"],
    "strategy": "redact",  # redact | hash
}


def _read() -> Dict[str, Any]:
    if not _STORE.exists():
        return dict(_DEFAULT)
    try:
        return json.loads(_STORE.read_text("utf-8"))
    except Exception:
        return dict(_DEFAULT)


def _write(p: Dict[str, Any]):
    _STORE.write_text(json.dumps(p, ensure_ascii=False, indent=2), "utf-8")


@router.get("/masking/profile")
def get_profile() -> Dict[str, Any]:
    return {"profile": _read()}


@router.post("/masking/profile")
def set_profile(payload: Dict[str, Any]) -> Dict[str, Any]:
    prof = _read()
    prof.update({
        "active": bool(payload.get("active", prof.get("active"))),
        "fields": payload.get("fields", prof.get("fields")),
        "strategy": payload.get("strategy", prof.get("strategy")),
    })
    _write(prof)
    return {"ok": True, "profile": prof}


# Helpers exposed to other routers

def get_active_profile() -> Dict[str, Any] | None:
    p = _read()
    return p if p.get("active") else None


def _mask_value(val: Any, strategy: str) -> Any:
    if val is None:
        return None
    s = str(val)
    if strategy == "hash":
        # simple hash-like placeholder
        return f"***{abs(hash(s)) % 100000:05d}"
    # redact (default)
    if "@" in s:
        # email redact
        name, _, domain = s.partition("@")
        return (name[:1] + "***@" + domain) if domain else "***"
    if re.fullmatch(r"\+?\d[\d\s\-]{6,}", s):
        return s[:2] + "***" + s[-2:]
    if re.fullmatch(r"\d{12,19}", s):
        return "**** **** **** " + s[-4:]
    # default: partially redact
    return s[:2] + "***"


def apply_masking(doc: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    fields: List[str] = profile.get("fields", [])
    strategy: str = profile.get("strategy", "redact")
    def walk(obj: Any):
        if isinstance(obj, dict):
            out = {}
            for k, v in obj.items():
                if k in fields and not isinstance(v, (int, float, bool)):
                    out[k] = _mask_value(v, strategy)
                else:
                    out[k] = walk(v)
            return out
        if isinstance(obj, list):
            return [walk(i) for i in obj]
        return obj
    return walk(doc)
