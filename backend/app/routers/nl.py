import os
from fastapi import APIRouter, HTTPException
from typing import Any, Dict
from datetime import datetime, timedelta

router = APIRouter(tags=["nl"])

try:
    import google.generativeai as genai
except Exception:
    genai = None


def _heuristic_translate(prompt: str) -> Dict[str, Any]:
    p = prompt.lower().strip()
    now = datetime.utcnow()
    pipeline = []
    filter_q: Dict[str, Any] = {}

    # very simple patterns
    if "last 7 days" in p or "last seven days" in p:
        dt = now - timedelta(days=7)
        filter_q["createdAt"] = {"$gte": {"$date": dt.isoformat() + "Z"}}
    if "group" in p and "status" in p:
        pipeline = [
            {"$match": filter_q or {}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        return {"mode": "aggregate", "pipeline": pipeline, "notes": "heuristic"}
    if filter_q:
        return {"mode": "find", "filter": filter_q, "notes": "heuristic"}
    return {"mode": "find", "filter": {}, "notes": "no-match-heuristic"}


@router.post("/nl/translate")
def translate(payload: Dict[str, Any]):
    """
    payload: { prompt: string, mode?: 'auto'|'find'|'aggregate' }
    Returns: { filter? , pipeline?, notes }
    """
    prompt = (payload or {}).get("prompt", "").strip()
    mode = (payload or {}).get("mode", "auto")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or genai is None:
        # fallback heuristic
        return _heuristic_translate(prompt)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        sys = (
            "You generate strict JSON for MongoDB queries. Return either {\"filter\":{...}} for find," \
            " or {\"pipeline\":[{...}]} for aggregation. No commentary. Use only JSON."
        )
        user = f"Prompt: {prompt}. Output strict JSON only."
        resp = model.generate_content([sys, user])
        text = resp.text or "{}"
        # try to parse JSON block
        import json, re
        m = re.search(r"\{[\s\S]*\}$", text.strip())
        raw = m.group(0) if m else text.strip()
        parsed = json.loads(raw)
        out: Dict[str, Any] = {"notes": "gemini"}
        if isinstance(parsed, dict):
            if "pipeline" in parsed:
                out["mode"] = "aggregate"
                out["pipeline"] = parsed["pipeline"]
            if "filter" in parsed:
                out["mode"] = out.get("mode") or "find"
                out["filter"] = parsed["filter"]
        if not out.get("filter") and not out.get("pipeline"):
            # fallback to heuristic
            return _heuristic_translate(prompt)
        return out
    except Exception as e:
        # fallback to heuristic on any failure
        return _heuristic_translate(prompt)
