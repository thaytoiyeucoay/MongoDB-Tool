# Frontend Setup (Next.js + Tailwind)

## Prerequisites
- Node.js 18+
- Backend FastAPI running at http://localhost:8000 (see backend/README.md)

## Configure environment
Create `.env.local` in `frontend/`:

```
NEXT_PUBLIC_API_BASE=http://localhost:8000/api
```

## Develop

```bash
npm run dev
# or: pnpm dev / yarn dev
```

Open http://localhost:3000/management

## Features (MVP)
- Connect to MongoDB with URI → receive `connectionId` (stored in localStorage)
- List databases and collections
- Query documents with filter/projection/sort (JSON), pagination
- Create / Edit / Delete document via JSON

## Next steps
- Integrate shadcn/ui components (Button, Input, Dialog, Select, Table, Toast)
- Build Analytics, Sync, Performance pages and wire to backend APIs
- Add Export UI (Excel/CSV/JSON/PDF)
