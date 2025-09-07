export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  connect: async (uri: string) => {
    const res = await fetch(`${API_BASE}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri }),
    });
    return handle<{ connectionId: string }>(res);
  },
  listDatabases: async (connectionId: string) => {
    const res = await fetch(`${API_BASE}/databases?connectionId=${encodeURIComponent(connectionId)}`);
    return handle<string[]>(res);
  },
  listCollections: async (connectionId: string, db: string) => {
    const res = await fetch(
      `${API_BASE}/collections?db=${encodeURIComponent(db)}&connectionId=${encodeURIComponent(connectionId)}`
    );
    return handle<string[]>(res);
  },
  queryDocuments: async (
    connectionId: string,
    payload: {
      db: string;
      collection: string;
      filter?: any;
      projection?: any;
      sort?: [string, number][];
      page?: number;
      pageSize?: number;
    }
  ) => {
    const res = await fetch(`${API_BASE}/documents/query?connectionId=${encodeURIComponent(connectionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        db: payload.db,
        collection: payload.collection,
        filter: payload.filter ?? {},
        projection: payload.projection,
        sort: payload.sort,
        page: payload.page ?? 1,
        pageSize: payload.pageSize ?? 50,
      }),
    });
    return handle<{ total: number; page: number; pageSize: number; items: any[] }>(res);
  },
  insertDocument: async (connectionId: string, db: string, collection: string, document: any) => {
    const res = await fetch(`${API_BASE}/documents?connectionId=${encodeURIComponent(connectionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ db, collection, document }),
    });
    return handle<{ insertedId: string }>(res);
  },
  updateDocument: async (connectionId: string, db: string, collection: string, id: string, document: any) => {
    const res = await fetch(
      `${API_BASE}/documents/${encodeURIComponent(db)}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?connectionId=${encodeURIComponent(connectionId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ db, collection, document }),
      }
    );
    return handle<{ matched: number; modified: number }>(res);
  },
  deleteDocument: async (connectionId: string, db: string, collection: string, id: string) => {
    const res = await fetch(
      `${API_BASE}/documents/${encodeURIComponent(db)}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?connectionId=${encodeURIComponent(connectionId)}`,
      { method: "DELETE" }
    );
    return handle<{ deleted: number }>(res);
  },
  listIndexes: async (connectionId: string, db: string, collection: string) => {
    const res = await fetch(
      `${API_BASE}/indexes/${encodeURIComponent(db)}/${encodeURIComponent(collection)}?connectionId=${encodeURIComponent(connectionId)}`
    );
    return handle<any[]>(res);
  },
  createIndex: async (
    connectionId: string,
    db: string,
    collection: string,
    payload: { keys: [string, number][]; unique?: boolean; name?: string }
  ) => {
    const res = await fetch(`${API_BASE}/indexes?connectionId=${encodeURIComponent(connectionId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ db, collection, ...payload })
      }
    );
    return handle<{ name: string }>(res);
  },
  dropIndex: async (connectionId: string, db: string, collection: string, name: string) => {
    const res = await fetch(
      `${API_BASE}/indexes/${encodeURIComponent(db)}/${encodeURIComponent(collection)}/${encodeURIComponent(name)}?connectionId=${encodeURIComponent(connectionId)}`,
      { method: "DELETE" }
    );
    return handle<{ dropped: string }>(res);
  },
  exportCollection: async (
    connectionId: string,
    db: string,
    collection: string,
    format: "excel" | "csv" | "json" | "pdf",
    options: { limit?: number; pretty?: boolean; query?: any } = {}
  ) => {
    const params = new URLSearchParams({
      connectionId,
      db,
      collection,
      format,
    } as Record<string, string>);
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    if (typeof options.pretty === "boolean") params.set("pretty", String(options.pretty));

    const res = await fetch(`${API_BASE}/export?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.query ?? {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename=([^;]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, "")) : `export.${format}`;
    return { blob, filename };
  },
};
