from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path

from .routers import connections, databases, collections, documents, indexes
from .routers import export as export_router
from .routers import sync as sync_router
from .routers import schema as schema_router
from .routers import agg as agg_router
from .routers import changes as changes_router
from .routers import masking as masking_router
from .routers import backups as backups_router
from .routers import nl as nl_router
from .routers import rbac as rbac_router

# Load env from backend/.env.local if exists
_env_path = Path(__file__).resolve().parent.parent / ".env.local"
if _env_path.exists():
    load_dotenv(_env_path)

app = FastAPI(title="MongoDB Tool Backend", version="0.1.0")

# CORS (allow local Next.js dev server and same-origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
        "http://127.0.0.1",
        "*",  # relax during development; tighten in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(connections.router, prefix="/api")
app.include_router(databases.router, prefix="/api")
app.include_router(collections.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(indexes.router, prefix="/api")
app.include_router(export_router.router, prefix="/api")
app.include_router(sync_router.router, prefix="/api")
app.include_router(schema_router.router, prefix="/api")
app.include_router(agg_router.router, prefix="/api")
app.include_router(changes_router.router, prefix="/api")
app.include_router(masking_router.router, prefix="/api")
app.include_router(backups_router.router, prefix="/api")
app.include_router(nl_router.router, prefix="/api")
app.include_router(rbac_router.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
