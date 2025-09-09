from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict, List
from collections import defaultdict
from ..services.mongo import conn_mgr
from ..utils import to_jsonable

router = APIRouter(tags=["schema"])


def _type_name(v: Any) -> str:
    if v is None:
        return "null"
    t = type(v).__name__
    return t


@router.get("/schema/summary")
def schema_summary(db: str, collection: str, connection_id: str = Query(..., alias="connectionId"), limit: int = 200):
    """Scan first N docs to infer field types, nullability, and example values.
    Returns a dict of field -> { types: {type: count}, examples: [values], count, nulls }.
    """
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        cursor = col.find({}, {}).limit(max(1, min(1000, limit)))
        summary: Dict[str, Dict[str, Any]] = {}
        counts: Dict[str, int] = defaultdict(int)
        nulls: Dict[str, int] = defaultdict(int)
        types: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        examples: Dict[str, List[Any]] = defaultdict(list)

        def walk(prefix: str, obj: Any):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    path = f"{prefix}.{k}" if prefix else k
                    counts[path] += 1
                    if v is None:
                        nulls[path] += 1
                    types[path][_type_name(v)] += 1
                    if len(examples[path]) < 3:
                        examples[path].append(to_jsonable(v))
                    walk(path, v)
            # Do not recurse into arrays deeply for now; count array at the field

        for doc in cursor:
            walk("", doc)
        out: Dict[str, Any] = {}
        for field in counts.keys():
            out[field] = {
                "count": counts[field],
                "nulls": nulls[field],
                "types": types[field],
                "examples": examples[field],
            }
        return {"fields": out}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _infer_fields_from_samples(col, limit: int = 200) -> Dict[str, Dict[str, Any]]:
    counts: Dict[str, int] = defaultdict(int)
    nulls: Dict[str, int] = defaultdict(int)
    types: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def walk(prefix: str, obj: Any):
        if isinstance(obj, dict):
            for k, v in obj.items():
                path = f"{prefix}.{k}" if prefix else k
                counts[path] += 1
                if v is None:
                    nulls[path] += 1
                types[path][_type_name(v)] += 1
                walk(path, v)

    for doc in col.find({}, {}).limit(max(1, min(1000, limit))):
        walk("", doc)
    out: Dict[str, Any] = {}
    for f in counts.keys():
        out[f] = {"count": counts[f], "nulls": nulls[f], "types": dict(types[f])}
    return out


@router.post("/schema/diff")
def schema_diff(payload: Dict[str, Any]):
    """
    Compare schema between two collections (source vs target) on samples.
    payload: { connectionId, source: { db, collection }, target: { db, collection }, limit? }
    """
    try:
        connection_id = payload.get("connectionId")
        src = payload.get("source") or {}
        tgt = payload.get("target") or {}
        limit = int(payload.get("limit") or 200)
        client = conn_mgr.get(connection_id)
        if not client:
            raise HTTPException(status_code=404, detail="Connection not found")
        col_src = client[src.get("db")][src.get("collection")]
        col_tgt = client[tgt.get("db")][tgt.get("collection")]
        s1 = _infer_fields_from_samples(col_src, limit)
        s2 = _infer_fields_from_samples(col_tgt, limit)

        f1 = set(s1.keys())
        f2 = set(s2.keys())
        added = sorted(list(f2 - f1))
        removed = sorted(list(f1 - f2))
        common = f1 & f2
        changed: List[Dict[str, Any]] = []
        for f in sorted(common):
            t1 = set((s1[f]["types"] or {}).keys())
            t2 = set((s2[f]["types"] or {}).keys())
            n1 = s1[f]["nulls"]
            n2 = s2[f]["nulls"]
            if t1 != t2 or (n1 == 0) != (n2 == 0):
                changed.append({
                    "field": f,
                    "from": {"types": list(t1), "nullable": n1 > 0},
                    "to": {"types": list(t2), "nullable": n2 > 0},
                })

        # naive migration plan suggestions
        steps: List[Dict[str, Any]] = []
        for f in added:
            steps.append({"action": "addField", "field": f, "suggest": {"$set": {f: None}}})
        for f in removed:
            steps.append({"action": "removeField", "field": f, "suggest": {"$unset": {f: ""}}})
        for ch in changed:
            # if target expects number but source not, suggest $convert
            if "number" in ch["to"]["types"] and "number" not in ch["from"]["types"]:
                steps.append({
                    "action": "convertType",
                    "field": ch["field"],
                    "suggest": {"$addFields": {ch["field"]: {"$convert": {"input": f"${ch['field']}", "to": "double", "onError": None}}}},
                })

        plan = {
            "pipeline": steps,  # human-friendly suggestions; user can adapt
            "note": "Suggestions are heuristic. Review before applying. Use $merge to write into target if needed.",
        }
        return {"diff": {"added": added, "removed": removed, "changed": changed}, "plan": plan}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/schema/sample")
def schema_sample(db: str, collection: str, connection_id: str = Query(..., alias="connectionId"), limit: int = 5):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        docs = list(col.find({}, {}).limit(max(1, min(50, limit))))
        return {"items": [to_jsonable(d) for d in docs]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stats/field")
def field_stats(db: str, collection: str, field: str, connection_id: str = Query(..., alias="connectionId"), top: int = 10):
    """Return distinct counts and top values for a field; when numeric, also min/max and bucket histogram."""
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        # Top values (works for strings and discrete)
        pipeline = [
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": max(1, min(50, top))},
        ]
        top_vals = list(col.aggregate(pipeline))
        # Numeric stats
        numeric_stats = None
        try:
            num_pipeline = [
                {"$match": {field: {"$type": "number"}}},
                {"$group": {
                    "_id": None,
                    "min": {"$min": f"${field}"},
                    "max": {"$max": f"${field}"},
                    "avg": {"$avg": f"${field}"},
                    "count": {"$sum": 1},
                }},
            ]
            numeric_stats = next(col.aggregate(num_pipeline), None)
        except Exception:
            pass
        return {"top": to_jsonable(top_vals), "numeric": to_jsonable(numeric_stats)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
