from typing import Any, Dict
from bson import ObjectId
from bson.decimal128 import Decimal128
from datetime import datetime


def to_jsonable(obj: Any) -> Any:
    """Recursively convert Mongo objects (e.g., ObjectId) to JSON-serializable types."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, Decimal128):
        # Convert Decimal128 to string to preserve precision in JSON
        try:
            return str(obj.to_decimal())
        except Exception:
            return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_jsonable(i) for i in obj]
    return obj
