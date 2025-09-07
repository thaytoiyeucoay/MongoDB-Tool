from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from ..services.mongo import conn_mgr
from ..schemas import QueryRequest, QueryResponse, InsertRequest, UpdateRequest
from ..utils import to_jsonable

router = APIRouter(tags=["documents"])


@router.post("/documents/query", response_model=QueryResponse)
def query_documents(payload: QueryRequest, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        db = client[payload.db]
        col = db[payload.collection]

        query = payload.filter or {}
        projection = payload.projection

        # Count first
        total = col.count_documents(query)

        # Build cursor
        cursor = col.find(query, projection)

        # Sort
        if payload.sort:
            sort_spec = []
            for item in payload.sort:
                if isinstance(item, list) and len(item) == 2:
                    field, direction = item
                    sort_spec.append((field, ASCENDING if int(direction) >= 0 else DESCENDING))
            if sort_spec:
                cursor = cursor.sort(sort_spec)

        # Pagination
        page = max(1, payload.page)
        page_size = max(1, payload.page_size)
        skip = (page - 1) * page_size
        items = list(cursor.skip(skip).limit(page_size))

        items_json = [to_jsonable(doc) for doc in items]
        return {
            "total": total,
            "page": page,
            "pageSize": page_size,
            "items": items_json,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/documents/{db}/{collection}/{doc_id}")
def get_document(db: str, collection: str, doc_id: str, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        doc = col.find_one({"_id": ObjectId(doc_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return to_jsonable(doc)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/documents")
def insert_document(payload: InsertRequest, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[payload.db][payload.collection]
        res = col.insert_one(_from_jsonable(payload.document))
        return {"insertedId": str(res.inserted_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/documents/{db}/{collection}/{doc_id}")
def update_document(db: str, collection: str, doc_id: str, payload: UpdateRequest, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        doc = _from_jsonable(payload.document)
        # Ensure _id is not overwritten
        if "_id" in doc:
            doc.pop("_id")
        res = col.update_one({"_id": ObjectId(doc_id)}, {"$set": doc})
        return {"matched": res.matched_count, "modified": res.modified_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/documents/{db}/{collection}/{doc_id}")
def delete_document(db: str, collection: str, doc_id: str, connection_id: str = Query(..., alias="connectionId")):
    client = conn_mgr.get(connection_id)
    if not client:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        col = client[db][collection]
        res = col.delete_one({"_id": ObjectId(doc_id)})
        return {"deleted": res.deleted_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def _from_jsonable(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert _id string to ObjectId if present, leave others as-is."""
    d = dict(doc)
    _id = d.get("_id")
    if isinstance(_id, str):
        try:
            d["_id"] = ObjectId(_id)
        except Exception:
            pass
    return d
