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
  dbStats: async (connectionId: string, db: string) => {
    const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(db)}/stats?connectionId=${encodeURIComponent(connectionId)}`);
    return handle<any>(res);
  },
  listCollections: async (connectionId: string, db: string) => {
    const res = await fetch(
      `${API_BASE}/collections?db=${encodeURIComponent(db)}&connectionId=${encodeURIComponent(connectionId)}`
    );
    return handle<string[]>(res);
  },
  createCollection: async (connectionId: string, db: string, name: string) => {
    const res = await fetch(
      `${API_BASE}/collections/${encodeURIComponent(db)}?connectionId=${encodeURIComponent(connectionId)}&name=${encodeURIComponent(name)}`,
      { method: "POST" }
    );
    return handle<{ created: string }>(res);
  },
  dropCollection: async (connectionId: string, db: string, name: string) => {
    const res = await fetch(
      `${API_BASE}/collections/${encodeURIComponent(db)}/${encodeURIComponent(name)}?connectionId=${encodeURIComponent(connectionId)}`,
      { method: "DELETE" }
    );
    return handle<{ dropped: string }>(res);
  },
  collStats: async (connectionId: string, db: string, collection: string) => {
    const res = await fetch(
      `${API_BASE}/collections/${encodeURIComponent(db)}/${encodeURIComponent(collection)}/stats?connectionId=${encodeURIComponent(connectionId)}`
    );
    return handle<any>(res);
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
    return handle<{ total: number; page: number; pageSize: number; items: any[]; executionMs?: number; indexSuggestion?: { keys: [string, number][]; note?: string } | null }>(res);
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
  deleteMany: async (connectionId: string, payload: { db: string; collection: string; filter?: any }) => {
    const res = await fetch(`${API_BASE}/documents/delete-many?connectionId=${encodeURIComponent(connectionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ db: payload.db, collection: payload.collection, filter: payload.filter ?? {} }),
    });
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
    payload: { keys: [string, number][]; unique?: boolean; name?: string; partialFilterExpression?: any; collation?: any }
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
    options: { limit?: number; pretty?: boolean; query?: any; fields?: string[] } = {}
  ) => {
    const params = new URLSearchParams({
      connectionId,
      db,
      collection,
      format,
    } as Record<string, string>);
    if (typeof options.limit === "number") params.set("limit", String(options.limit));
    if (typeof options.pretty === "boolean") params.set("pretty", String(options.pretty));
    if (format === "csv" && options.fields && options.fields.length) {
      params.set("fields", options.fields.join(","));
    }

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
  startSync: async (payload: { source_uri: string; source_db: string; dest_uri: string; dest_db: string }) => {
    const res = await fetch(`${API_BASE}/sync/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return handle<{ id: string; status: string }>(res);
  },
  getSync: async (id: string) => {
    const res = await fetch(`${API_BASE}/sync/${encodeURIComponent(id)}`);
    return handle<{ id: string; status: string; error?: string | null; logs: string[]; progress?: number }>(res);
  },
  cancelSync: async (id: string) => {
    const res = await fetch(`${API_BASE}/sync/${encodeURIComponent(id)}/cancel`, { method: "POST" });
    return handle<{ ok: boolean }>(res);
  },
  listSync: async () => {
    const res = await fetch(`${API_BASE}/sync`);
    return handle<{ jobs: { id: string; status: string; error?: string | null }[] }>(res);
  },
  offlineExport: async (uri: string, db: string) => {
    const form = new FormData();
    form.append("uri", uri);
    form.append("db", db);
    const res = await fetch(`${API_BASE}/sync/offline/export`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename=([^;]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, "")) : `dump.zip`;
    return { blob, filename };
  },
  offlineImport: async (file: File, dest_uri: string, dest_db: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("dest_uri", dest_uri);
    form.append("dest_db", dest_db);
    const res = await fetch(`${API_BASE}/sync/offline/import`, {
      method: "POST",
      body: form,
    });
    return handle<{ ok: boolean }>(res);
  },
  // Schema & Samples
  schemaSummary: async (connectionId: string, db: string, collection: string, limit = 200) => {
    const url = `${API_BASE}/schema/summary?db=${encodeURIComponent(db)}&collection=${encodeURIComponent(collection)}&limit=${limit}&connectionId=${encodeURIComponent(connectionId)}`;
    const res = await fetch(url);
    return handle<{ fields: Record<string, { count: number; nulls: number; types: Record<string, number>; examples: any[] }> }>(res);
  },
  schemaSample: async (connectionId: string, db: string, collection: string, limit = 5) => {
    const url = `${API_BASE}/schema/sample?db=${encodeURIComponent(db)}&collection=${encodeURIComponent(collection)}&limit=${limit}&connectionId=${encodeURIComponent(connectionId)}`;
    const res = await fetch(url);
    return handle<{ items: any[] }>(res);
  },
  // Aggregation
  runAggregation: async (connectionId: string, db: string, collection: string, pipeline: any[]) => {
    const res = await fetch(`${API_BASE}/agg/run?connectionId=${encodeURIComponent(connectionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ db, collection, pipeline }),
    });
    return handle<{ items: any[] }>(res);
  },
  // Field stats
  fieldStats: async (connectionId: string, db: string, collection: string, field: string, top = 10) => {
    const url = `${API_BASE}/stats/field?db=${encodeURIComponent(db)}&collection=${encodeURIComponent(collection)}&field=${encodeURIComponent(field)}&top=${top}&connectionId=${encodeURIComponent(connectionId)}`;
    const res = await fetch(url);
    return handle<{ top: { _id: any; count: number }[]; numeric: { min: number; max: number; avg: number; count: number } | null }>(res);
  },
  // Saved aggregations / dashboards
  listSavedAgg: async () => {
    const res = await fetch(`${API_BASE}/agg/saved`);
    return handle<{ items: { id: string; name: string; db: string; collection: string; pipeline: any[]; viz: string; createdAt: string }[] }>(res);
  },
  saveAgg: async (item: { name: string; db: string; collection: string; pipeline: any[]; viz: "kpi"|"table"|"bar" }) => {
    const res = await fetch(`${API_BASE}/agg/saved`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    return handle<{ ok: boolean; item: any }>(res);
  },
  // Change streams
  pollChanges: async (connectionId: string, db: string, collection: string, cursor: number) => {
    const url = `${API_BASE}/changes/poll?connectionId=${encodeURIComponent(connectionId)}&db=${encodeURIComponent(db)}&collection=${encodeURIComponent(collection)}&cursor=${cursor}`;
    const res = await fetch(url);
    return handle<{ events: any[]; cursor: number }>(res);
  },
  stopChanges: async (connectionId: string, db: string, collection: string) => {
    const url = `${API_BASE}/changes/stop?connectionId=${encodeURIComponent(connectionId)}&db=${encodeURIComponent(db)}&collection=${encodeURIComponent(collection)}`;
    const res = await fetch(url, { method: "POST" });
    return handle<{ ok: boolean }>(res);
  },
  // Masking profile
  getMaskingProfile: async () => {
    const res = await fetch(`${API_BASE}/masking/profile`);
    return handle<{ profile: { active: boolean; fields: string[]; strategy: "redact"|"hash" } }>(res);
  },
  setMaskingProfile: async (profile: { active: boolean; fields: string[]; strategy: "redact"|"hash" }) => {
    const res = await fetch(`${API_BASE}/masking/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    return handle<{ ok: boolean; profile: any }>(res);
  },
  // Natural language translate
  nlTranslate: async (prompt: string, mode: "auto"|"find"|"aggregate" = "auto") => {
    const res = await fetch(`${API_BASE}/nl/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode }),
    });
    return handle<{ mode: string; filter?: any; pipeline?: any[]; notes?: string }>(res);
  },
  // Schema diff
  schemaDiff: async (connectionId: string, source: { db: string; collection: string }, target: { db: string; collection: string }, limit = 200) => {
    const res = await fetch(`${API_BASE}/schema/diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, source, target, limit }),
    });
    return handle<{ diff: { added: string[]; removed: string[]; changed: any[] }; plan: { pipeline: any[]; note: string } }>(res);
  },
  // RBAC
  getRoles: async () => {
    const res = await fetch(`${API_BASE}/rbac/roles`);
    return handle<{ items: { id: string; name: string; permissions: Record<string, boolean> }[] }>(res);
  },
  saveRoles: async (items: { id: string; name: string; permissions: Record<string, boolean> }[]) => {
    const res = await fetch(`${API_BASE}/rbac/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    return handle<{ ok: boolean }>(res);
  },
  getAssignments: async () => {
    const res = await fetch(`${API_BASE}/rbac/assignments`);
    return handle<{ items: any[] }>(res);
  },
  saveAssignments: async (items: any[]) => {
    const res = await fetch(`${API_BASE}/rbac/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    return handle<{ ok: boolean }>(res);
  },
  getActiveRole: async () => {
    const res = await fetch(`${API_BASE}/rbac/active`);
    return handle<{ roleId: string }>(res);
  },
  setActiveRole: async (roleId: string) => {
    const res = await fetch(`${API_BASE}/rbac/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    });
    return handle<{ ok: boolean }>(res);
  },
};
