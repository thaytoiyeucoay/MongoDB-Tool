# MongoDB Tool Backend (FastAPI)

Python FastAPI backend exposing MongoDB operations for the Next.js frontend.

## Features

- Connection manager: create/close connections by URI
- Databases: list databases
- Collections: list collections
- Documents: query with pagination/sort/projection, CRUD
- Indexes: list/create/drop
- CORS enabled for local Next.js dev

## Endpoints (prefix: `/api`)

- `POST /api/connect` → { connectionId }
- `GET /api/connections`
- `DELETE /api/connections/{connectionId}`
- `GET /api/databases?connectionId=...`
- `GET /api/collections?db=DB&connectionId=...`
- `POST /api/documents/query?connectionId=...`
- `GET /api/documents/{db}/{collection}/{id}?connectionId=...`
- `POST /api/documents?connectionId=...`
- `PUT /api/documents/{db}/{collection}/{id}?connectionId=...`
- `DELETE /api/documents/{db}/{collection}/{id}?connectionId=...`
- `GET /api/indexes/{db}/{collection}?connectionId=...`
- `POST /api/indexes?connectionId=...`
- `DELETE /api/indexes/{db}/{collection}/{name}?connectionId=...`

## Run locally

Prereqs:
- Python 3.10+
- A MongoDB instance

Install deps and run:

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/api/health
```

## Notes

- This backend keeps connections in memory. For production, consider adding authentication, persistent sessions, and stricter CORS.
- JSON serialization converts `ObjectId` to string automatically.
