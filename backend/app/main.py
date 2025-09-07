from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import connections, databases, collections, documents, indexes
from .routers import export as export_router

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
