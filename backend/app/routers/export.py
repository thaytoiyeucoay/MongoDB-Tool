from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from typing import Optional, Dict, Any
import tempfile
import os
import datetime

from ..services.mongo import conn_mgr
from .masking import get_active_profile, apply_masking
from advanced_export import AdvancedExporter

router = APIRouter(tags=["export"])


@router.post("/export")
def export_collection(
    connection_id: str = Query(..., alias="connectionId"),
    db: str = Query(...),
    collection: str = Query(...),
    format: str = Query(..., description="excel|csv|json|pdf"),
    limit: Optional[int] = Query(None),
    pretty: Optional[bool] = Query(True),
    fields: Optional[str] = Query(None, description="CSV only: comma-separated field names"),
    query: Optional[Dict[str, Any]] = None,
):
    """
    Export a collection to a file and return it for download.
    - format: excel|csv|json|pdf
    - query: optional MongoDB filter (JSON body or querystring converted)
    """
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")

    exporter = AdvancedExporter(client, db, collection)

    # Temp file path
    suffix_map = {
        "excel": ".xlsx",
        "csv": ".csv",
        "json": ".json",
        "pdf": ".pdf",
    }
    f = format.lower()
    if f not in suffix_map:
        raise HTTPException(status_code=400, detail="Invalid format. Use excel|csv|json|pdf")

    suffix = suffix_map[f]
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_name = f"{db}_{collection}_{ts}{suffix}"
    tmp_dir = tempfile.mkdtemp(prefix="export_")
    out_path = os.path.join(tmp_dir, safe_name)

    try:
        # Prepare masking hook if profile active
        profile = get_active_profile()
        def mask_hook(docs):
            if not profile:
                return docs
            return [apply_masking(d, profile) for d in docs]
        if f == "excel":
            exporter.export_to_excel(out_path, query or {}, limit, mask=mask_hook if profile else None)
            media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif f == "csv":
            fields_list = None
            if fields:
                fields_list = [s.strip() for s in fields.split(',') if s.strip()]
            exporter.export_to_csv(out_path, query or {}, limit, fields=fields_list, mask=mask_hook if profile else None)
            media = "text/csv"
        elif f == "json":
            exporter.export_to_json(out_path, query or {}, limit, pretty=pretty, mask=mask_hook if profile else None)
            media = "application/json"
        elif f == "pdf":
            exporter.export_to_pdf_report(out_path, query or {}, limit or 100, mask=mask_hook if profile else None)
            media = "application/pdf"
        else:
            raise HTTPException(status_code=400, detail="Unsupported format")

        return FileResponse(
            out_path,
            media_type=media,
            filename=safe_name,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
