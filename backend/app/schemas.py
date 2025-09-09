from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ConnectRequest(BaseModel):
    uri: str


class ConnectResponse(BaseModel):
    connection_id: str = Field(..., alias="connectionId")


class QueryRequest(BaseModel):
    db: str
    collection: str
    filter: Dict[str, Any] = Field(default_factory=dict)
    projection: Optional[Dict[str, Any]] = None
    sort: Optional[List[List[Any]]] = None  # e.g., [["field", 1], ["age", -1]]
    page: int = 1
    page_size: int = Field(50, alias="pageSize")


class QueryResponse(BaseModel):
    total: int
    page: int
    page_size: int = Field(..., alias="pageSize")
    items: List[Dict[str, Any]]


class InsertRequest(BaseModel):
    db: str
    collection: str
    document: Dict[str, Any]


class UpdateRequest(BaseModel):
    db: str
    collection: str
    document: Dict[str, Any]


class IndexCreateRequest(BaseModel):
    db: str
    collection: str
    keys: List[List[Any]]  # [["field", 1], ["other", -1]]
    unique: bool = False
    name: Optional[str] = None
    partialFilterExpression: Optional[Dict[str, Any]] = None
    collation: Optional[Dict[str, Any]] = None
