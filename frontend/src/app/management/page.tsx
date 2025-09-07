"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

function tryParseJSON<T = any>(s: string): T | undefined {
  if (!s.trim()) return undefined as any;
  try {
    return JSON.parse(s);
  } catch {
    return undefined as any;
  }
}

export default function ManagementPage() {
  const [uri, setUri] = useState("mongodb://localhost:27017");
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const [databases, setDatabases] = useState<string[]>([]);
  const [db, setDb] = useState<string>("");

  const [collections, setCollections] = useState<string[]>([]);
  const [collection, setCollection] = useState<string>("");

  const [filter, setFilter] = useState<string>("");
  const [projection, setProjection] = useState<string>("");
  const [sort, setSort] = useState<string>(""); // e.g. [["field",1]]
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [data, setData] = useState<{ total: number; items: any[]; page: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Indexes & Export states
  const [indexes, setIndexes] = useState<any[] | null>(null);
  const [idxKeys, setIdxKeys] = useState<string>("[[\"field\",1]]");
  const [idxName, setIdxName] = useState<string>("");
  const [idxUnique, setIdxUnique] = useState<boolean>(false);
  const [expFormat, setExpFormat] = useState<"excel" | "csv" | "json" | "pdf">("excel");
  const [expLimit, setExpLimit] = useState<number | "">("");
  const [expPretty, setExpPretty] = useState<boolean>(true);
  const [expQuery, setExpQuery] = useState<string>("");

  // Tabs: browse | visual | saved | indexes | export
  const [tab, setTab] = useState<"browse" | "visual" | "saved" | "indexes" | "export">("browse");

  // Visual Query Builder (nested)
  type VisualOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "regex" | "in" | "nin" | "exists" | "type";
  type ValType = "string" | "number" | "boolean" | "array" | "object";
  type VNode = VGroup | VRule;
  interface VGroup { id: string; type: "group"; join: "AND" | "OR"; children: VNode[] }
  interface VRule { id: string; type: "rule"; field: string; op: VisualOp; val: string; valType: ValType }
  const [visualRoot, setVisualRoot] = useState<VGroup>({ id: crypto.randomUUID(), type: "group", join: "AND", children: [
    { id: crypto.randomUUID(), type: "rule", field: "", op: "eq", val: "", valType: "string" }
  ]});
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);

  function parseValueByType(v: string, t: ValType): any {
    if (t === "number") return Number(v);
    if (t === "boolean") return v === "true";
    if (t === "array" || t === "object") {
      try { return JSON.parse(v || (t === "array" ? "[]" : "{}")); } catch { return t === "array" ? [] : {}; }
    }
    return v;
  }

  function ruleToClause(r: VRule): any {
    if (!r.field.trim()) return {};
    const value = parseValueByType(r.val, r.valType);
    switch (r.op) {
      case "eq": return { [r.field]: value };
      case "ne": return { [r.field]: { $ne: value } };
      case "gt": return { [r.field]: { $gt: value } };
      case "gte": return { [r.field]: { $gte: value } };
      case "lt": return { [r.field]: { $lt: value } };
      case "lte": return { [r.field]: { $lte: value } };
      case "regex": return { [r.field]: { $regex: String(value), $options: "i" } };
      case "in": return { [r.field]: { $in: Array.isArray(value) ? value : [value] } };
      case "nin": return { [r.field]: { $nin: Array.isArray(value) ? value : [value] } };
      case "exists": return { [r.field]: { $exists: Boolean(value) } };
      case "type": return { [r.field]: { $type: value } };
      default: return {};
    }
  }

  function buildFilterFromTree(node: VNode): any {
    if ((node as VGroup).type === "group") {
      const g = node as VGroup;
      const clauses = g.children.map(ch => buildFilterFromTree(ch)).filter(Boolean);
      if (clauses.length === 0) return {};
      return g.join === "AND" ? { $and: clauses } : { $or: clauses };
    } else {
      return ruleToClause(node as VRule);
    }
  }

  function applyVisualToFilter() {
    const f = buildFilterFromTree(visualRoot);
    setFilter(JSON.stringify(f, null, 2));
  }

  async function runVisual() {
    applyVisualToFilter();
    await query();
  }

  // Manipulate tree
  function updateNode(node: VNode, id: string, mut: (n: VNode) => void): boolean {
    if ((node as any).id === id) { mut(node); return true; }
    if ((node as VGroup).type === "group") {
      for (const ch of (node as VGroup).children) {
        if (updateNode(ch, id, mut)) return true;
      }
    }
    return false;
  }
  function replaceNode(node: VNode, id: string, make: () => VNode): boolean {
    if ((node as VGroup).type !== "group") return false;
    const g = node as VGroup;
    const idx = g.children.findIndex(c => (c as any).id === id);
    if (idx >= 0) { g.children[idx] = make(); return true; }
    for (const ch of g.children) if ((ch as VGroup).type === "group" && replaceNode(ch, id, make)) return true;
    return false;
  }
  function deleteNode(node: VNode, id: string): boolean {
    if ((node as VGroup).type !== "group") return false;
    const g = node as VGroup;
    const before = g.children.length;
    g.children = g.children.filter(c => (c as any).id !== id);
    if (g.children.length !== before) return true;
    for (const ch of g.children) if ((ch as VGroup).type === "group" && deleteNode(ch, id)) return true;
    return false;
  }
  function addRuleTo(id: string) {
    setVisualRoot(root => {
      const draft: VGroup = JSON.parse(JSON.stringify(root));
      updateNode(draft, id, (n) => {
        if ((n as VGroup).type === "group") {
          (n as VGroup).children.push({ id: crypto.randomUUID(), type: "rule", field: "", op: "eq", val: "", valType: "string" });
        }
      });
      return draft;
    });
  }
  function addGroupTo(id: string) {
    setVisualRoot(root => {
      const draft: VGroup = JSON.parse(JSON.stringify(root));
      updateNode(draft, id, (n) => {
        if ((n as VGroup).type === "group") {
          (n as VGroup).children.push({ id: crypto.randomUUID(), type: "group", join: "AND", children: [] });
        }
      });
      return draft;
    });
  }
  function removeNodeById(id: string) {
    if (visualRoot.id === id) return; // don't delete root
    setVisualRoot(root => {
      const draft: VGroup = JSON.parse(JSON.stringify(root));
      deleteNode(draft, id);
      return draft;
    });
  }
  function patchRule(id: string, patch: Partial<VRule>) {
    setVisualRoot(root => {
      const draft: VGroup = JSON.parse(JSON.stringify(root));
      updateNode(draft, id, (n) => {
        if ((n as VRule).type === "rule") Object.assign(n as VRule, patch);
      });
      return draft;
    });
  }
  function setGroupJoin(id: string, join: "AND" | "OR") {
    setVisualRoot(root => {
      const draft: VGroup = JSON.parse(JSON.stringify(root));
      updateNode(draft, id, (n) => { if ((n as VGroup).type === "group") (n as VGroup).join = join; });
      return draft;
    });
  }

  // Validation helpers
  function validateRule(r: VRule): string | null {
    if (!r.field.trim()) return "Field required";
    if (r.op === "regex" && r.valType !== "string") return "Regex needs string";
    if ((r.op === "in" || r.op === "nin") && r.valType !== "array") return "Use array for in/nin";
    if (r.op === "exists" && r.valType !== "boolean") return "exists needs boolean";
    try {
      parseValueByType(r.val, r.valType);
    } catch { return "Invalid value"; }
    return null;
  }

  async function previewCount() {
    try {
      const f = buildFilterFromTree(visualRoot);
      const res = await api.queryDocuments(connectionId!, { db, collection, filter: f, page: 1, pageSize: 1 });
      setPreviewTotal(res.total);
    } catch (e: any) {
      setPreviewTotal(null);
      toast.error(e.message || String(e));
    }
  }

  // Saved: Profiles + Saved Queries (localStorage)
  type Profile = { id: string; name: string; uri: string };
  type SavedQuery = { id: string; name: string; db: string; collection: string; filter?: string; projection?: string; sort?: string };
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [newProfile, setNewProfile] = useState<{ name: string; uri: string }>({ name: "", uri: "" });
  const [newSaved, setNewSaved] = useState<{ name: string }>({ name: "" });

  function loadStorage() {
    try {
      const ps = JSON.parse(localStorage.getItem("profiles") || "[]");
      const sq = JSON.parse(localStorage.getItem("savedQueries") || "[]");
      setProfiles(ps);
      setSavedQueries(sq);
    } catch {}
  }
  useEffect(() => { loadStorage(); }, []);
  function saveProfiles(ps: Profile[]) { setProfiles(ps); localStorage.setItem("profiles", JSON.stringify(ps)); }
  function saveSavedQueries(sq: SavedQuery[]) { setSavedQueries(sq); localStorage.setItem("savedQueries", JSON.stringify(sq)); }
  function addProfile() {
    if (!newProfile.name.trim() || !newProfile.uri.trim()) return;
    const ps = [...profiles, { id: crypto.randomUUID(), name: newProfile.name.trim(), uri: newProfile.uri.trim() }];
    saveProfiles(ps); setNewProfile({ name: "", uri: "" });
  }
  function deleteProfile(id: string) { saveProfiles(profiles.filter(p => p.id !== id)); }
  async function loadProfile(id: string) {
    const p = profiles.find(x => x.id === id); if (!p) return;
    setUri(p.uri); await connect();
  }
  function addSaved() {
    if (!newSaved.name.trim()) return;
    const item: SavedQuery = {
      id: crypto.randomUUID(), name: newSaved.name.trim(), db, collection,
      filter, projection, sort,
    };
    const sq = [...savedQueries, item];
    saveSavedQueries(sq); setNewSaved({ name: "" });
  }
  function deleteSaved(id: string) { saveSavedQueries(savedQueries.filter(s => s.id !== id)); }
  function loadSaved(id: string) {
    const s = savedQueries.find(x => x.id === id); if (!s) return;
    if (s.db) setDb(s.db);
    if (s.collection) setCollection(s.collection);
    setFilter(s.filter || ""); setProjection(s.projection || ""); setSort(s.sort || "");
    setTab("browse");
  }

  // Load connectionId from localStorage
  useEffect(() => {
    const id = localStorage.getItem("connectionId");
    if (id) setConnectionId(id);
  }, []);

  // When connected, fetch databases
  useEffect(() => {
    if (!connectionId) return;
    (async () => {
      try {
        const dbs = await api.listDatabases(connectionId);
        setDatabases(dbs);
        if (dbs.length > 0) setDb((prev) => prev || dbs[0]);
      } catch (e: any) {
        setError(e.message || String(e));
      }
    })();
  }, [connectionId]);

  // Fetch collections on db change
  useEffect(() => {
    if (!connectionId || !db) return;
    (async () => {
      try {
        const cols = await api.listCollections(connectionId, db);
        setCollections(cols);
        if (cols.length > 0) setCollection((prev) => prev || cols[0]);
      } catch (e: any) {
        setError(e.message || String(e));
      }
    })();
  }, [connectionId, db]);

  // Query documents when collection or pagination changes
  useEffect(() => {
    if (!connectionId || !db || !collection) return;
    void query();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, db, collection, page, pageSize]);

  // ---- Dialogs for Create/Edit ----
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState<string>("{}");
  const [editTargetId, setEditTargetId] = useState<string | null>(null);

  async function connect() {
    setError(null);
    try {
      const res = await api.connect(uri);
      setConnectionId(res.connectionId);
      localStorage.setItem("connectionId", res.connectionId);
      toast.success("Kết nối thành công");
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error(e.message || String(e));
    }
  }

  async function query() {
    if (!connectionId || !db || !collection) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.queryDocuments(connectionId, {
        db,
        collection,
        filter: tryParseJSON(filter) ?? {},
        projection: tryParseJSON(projection),
        sort: tryParseJSON(sort),
        page,
        pageSize,
      });
      setData(res);
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteDoc(id: string) {
    if (!connectionId) return;
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteDocument(connectionId, db, collection, id);
      await query();
      toast.success("Đã xoá tài liệu");
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error(e.message || String(e));
    }
  }

  // ---- Indexes & Export helpers (component scope) ----
  async function refreshIndexes() {
    if (!connectionId || !db || !collection) return;
    try {
      const res = await api.listIndexes(connectionId, db, collection);
      setIndexes(res);
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error(e.message || String(e));
    }
  }

  async function createIdx() {
    if (!connectionId || !db || !collection) return;
    try {
      const keys = tryParseJSON<[string, number][]>(idxKeys);
      if (!Array.isArray(keys) || !keys.length) throw new Error("Invalid keys JSON");
      await api.createIndex(connectionId, db, collection, { keys, unique: idxUnique, name: idxName || undefined });
      setIdxName("");
      await refreshIndexes();
      toast.success("Đã tạo index");
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error(e.message || String(e));
    }
  }

  async function dropIdx(name: string) {
    if (!connectionId || !db || !collection) return;
    if (!confirm(`Drop index "${name}"?`)) return;
    try {
      await api.dropIndex(connectionId, db, collection, name);
      await refreshIndexes();
      toast.success("Đã xoá index");
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error(e.message || String(e));
    }
  }

  async function doExport() {
    if (!connectionId || !db || !collection) return;
    try {
      const queryJson = tryParseJSON(expQuery) ?? {};
      const { blob, filename } = await api.exportCollection(
        connectionId,
        db,
        collection,
        expFormat,
        { limit: typeof expLimit === "number" ? expLimit : undefined, pretty: expPretty, query: queryJson }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải ${filename}`);
    } catch (e: any) {
      setError(e.message || String(e));
      toast.error(e.message || String(e));
    }
  }

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>
      
      {/* Hero Section */}
      <section className="relative bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5" />
        <div className="relative mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
                    MongoDB Studio
                  </h1>
                  <p className="text-lg text-gray-600 font-medium">Professional database management made simple</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-sm transition-all duration-300 ${
                connectionId 
                  ? "bg-emerald-50/80 text-emerald-700 ring-2 ring-emerald-200/50 shadow-lg" 
                  : "bg-gray-50/80 text-gray-600 ring-2 ring-gray-200/50"
              }`}>
                <div className={`relative w-3 h-3 rounded-full ${
                  connectionId ? "bg-emerald-500" : "bg-gray-400"
                }`}>
                  {connectionId && (
                    <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75" />
                  )}
                </div>
                <span className="font-semibold text-sm">
                  {connectionId ? `Connected • ${connectionId.slice(0, 8)}` : "Disconnected"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="relative mx-auto max-w-7xl px-6 pb-12 space-y-8">
        {/* Connection Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Database Connection
            </h2>
            <p className="text-sm text-gray-600 mt-1">Connect to your MongoDB instance</p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-gray-700">MongoDB URI</label>
                <div className="relative">
                  <Input
                    className="w-full h-12 pl-4 pr-40 text-base border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                    placeholder="mongodb://localhost:27017"
                    value={uri}
                    onChange={(e) => setUri(e.target.value)}
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 pointer-events-none">
                    <span className="bg-gray-50 px-2 py-1 rounded-md">localhost:27017</span>
                  </div>
                </div>
              </div>
              <Button 
                size="lg" 
                className="h-12 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105" 
                onClick={connect}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {connectionId ? "Reconnect" : "Connect Now"}
              </Button>
            </div>
          </div>
        </div>
        {/* Navigation Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-2">
            <TabsList className="grid w-full grid-cols-5 bg-transparent gap-1">
              <TabsTrigger 
                value="browse" 
                className="relative px-6 py-3 rounded-xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Browse
              </TabsTrigger>
              <TabsTrigger 
                value="visual" 
                className="relative px-6 py-3 rounded-xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Visual
              </TabsTrigger>
              <TabsTrigger 
                value="saved" 
                className="relative px-6 py-3 rounded-xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Saved
              </TabsTrigger>
              <TabsTrigger 
                value="indexes" 
                className="relative px-6 py-3 rounded-xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7H3a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z" />
                </svg>
                Indexes
              </TabsTrigger>
              <TabsTrigger 
                value="export" 
                className="relative px-6 py-3 rounded-xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="browse">
          <>
            {/* Selectors */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-4 border-b border-white/20">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
                    </svg>
                    Database
                  </h3>
                </div>
                <div className="p-4">
                  <Select value={db} onValueChange={setDb}>
                    <SelectTrigger className="w-full h-11 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20">
                      <SelectValue placeholder="Select database" />
                    </SelectTrigger>
                    <SelectContent>
                      {databases.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-4 border-b border-white/20">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7H3a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z" />
                    </svg>
                    Collection
                  </h3>
                </div>
                <div className="p-4">
                  <Select value={collection} onValueChange={setCollection}>
                    <SelectTrigger className="w-full h-11 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20">
                      <SelectValue placeholder="Select collection" />
                    </SelectTrigger>
                    <SelectContent>
                      {collections.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-4 border-b border-white/20">
                    <h3 className="text-sm font-semibold text-gray-800">Page</h3>
                  </div>
                  <div className="p-4">
                    <Input
                      type="number"
                      className="h-11 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                      value={page}
                      onChange={(e) => setPage(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-4 border-b border-white/20">
                    <h3 className="text-sm font-semibold text-gray-800">Size</h3>
                  </div>
                  <div className="p-4">
                    <Input
                      type="number"
                      className="h-11 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20"
                      value={pageSize}
                      onChange={(e) => setPageSize(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* Query controls */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Query Parameters
                </h2>
                <p className="text-sm text-gray-600 mt-1">Define your MongoDB query with filters, projections, and sorting</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      Filter (JSON)
                    </label>
                    <Textarea
                      className="h-32 font-mono text-sm resize-none border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-gray-50/50"
                      placeholder='{"age": {"$gt": 25}}'
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Projection (JSON)
                    </label>
                    <Textarea
                      className="h-32 font-mono text-sm resize-none border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-gray-50/50"
                      placeholder='{"name": 1, "age": 1}'
                      value={projection}
                      onChange={(e) => setProjection(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      Sort (JSON)
                    </label>
                    <Textarea
                      className="h-32 font-mono text-sm resize-none border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-gray-50/50"
                      placeholder='[["field", 1], ["age", -1]]'
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Button 
                    onClick={query} 
                    disabled={loading} 
                    size="lg" 
                    className="h-12 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {loading ? "Searching..." : "Execute Query"}
                  </Button>
                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-red-200/50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </div>

        {/* Results */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Documents
                </h2>
                <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Total: <span className="font-semibold text-gray-800">{data?.total ?? 0}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Page {data?.page ?? page} of {totalPages}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="h-10 px-4 rounded-xl border-gray-200 hover:bg-gray-50 transition-all duration-200"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-4 rounded-xl border-gray-200 hover:bg-gray-50 transition-all duration-200"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
          
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-gray-50/80 to-blue-50/80 border-b border-gray-200">
                  <th className="p-4 text-left font-semibold text-gray-700 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a.997.997 0 01-1.414 0l-7-7A1.997 1.997 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      Document ID
                    </div>
                  </th>
                  <th className="p-4 text-left font-semibold text-gray-700 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Content
                    </div>
                  </th>
                  <th className="p-4 text-left font-semibold text-gray-700 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                      </svg>
                      Actions
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((doc: any, index: number) => (
                  <tr key={doc._id} className={`border-b border-gray-100 hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-purple-50/30 transition-all duration-200 ${index % 2 === 0 ? 'bg-white/50' : 'bg-gray-50/30'}`}>
                    <td className="p-4 align-top">
                      <div className="font-mono text-xs bg-gray-100/80 text-gray-700 px-3 py-2 rounded-lg border max-w-xs overflow-hidden">
                        {String(doc._id)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="bg-gradient-to-br from-gray-50/80 to-blue-50/50 rounded-xl border border-gray-200/50 p-4 max-w-2xl">
                        <pre className="whitespace-pre-wrap text-xs text-gray-700 font-mono overflow-x-auto">
                          {JSON.stringify(doc, null, 2)}
                        </pre>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 px-4 bg-blue-50/80 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 rounded-lg transition-all duration-200"
                          onClick={() => {
                            setEditTargetId(String(doc._id));
                            setJsonInput(JSON.stringify(doc, null, 2));
                            setEditOpen(true);
                          }}
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-9 px-4 bg-red-50/80 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 rounded-lg transition-all duration-200"
                          onClick={() => deleteDoc(String(doc._id))}
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 border-t border-white/20 px-6 py-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
              </svg>
              Managing documents in <span className="font-semibold text-gray-800">{db || "?"}</span> / <span className="font-semibold text-gray-800">{collection || "?"}</span>
            </div>
            <Button
              className="h-11 px-6 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
              onClick={() => { setJsonInput("{}"); setCreateOpen(true); }}
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Document
            </Button>
          </div>
        </div>
          </>
          </TabsContent>

          <TabsContent value="visual">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Visual Query Builder</h2>
            </div>
            {/* Recursive Group/Rule UI */}
            {(() => {
              function RuleRow({ rule }: { rule: VRule }) {
                const err = validateRule(rule);
                return (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-start">
                    <Input className="md:col-span-2" placeholder="field" value={rule.field} onChange={(e) => patchRule(rule.id, { field: e.target.value })} />
                    <select className="rounded-xl border border-white/10 bg-white/10 px-3 py-2" value={rule.op} onChange={(e) => patchRule(rule.id, { op: e.target.value as any })}>
                      <option className="bg-slate-900" value="eq">=</option>
                      <option className="bg-slate-900" value="ne">!=</option>
                      <option className="bg-slate-900" value="gt">&gt;</option>
                      <option className="bg-slate-900" value="gte">&gt;=</option>
                      <option className="bg-slate-900" value="lt">&lt;</option>
                      <option className="bg-slate-900" value="lte">&lt;=</option>
                      <option className="bg-slate-900" value="regex">regex</option>
                      <option className="bg-slate-900" value="in">in</option>
                      <option className="bg-slate-900" value="nin">not in</option>
                      <option className="bg-slate-900" value="exists">exists</option>
                      <option className="bg-slate-900" value="type">type</option>
                    </select>
                    <Input placeholder="value (string/number/true/[...])" value={rule.val} onChange={(e) => patchRule(rule.id, { val: e.target.value })} />
                    <select className="rounded-xl border border-white/10 bg-white/10 px-3 py-2" value={rule.valType} onChange={(e) => patchRule(rule.id, { valType: e.target.value as any })}>
                      <option className="bg-slate-900" value="string">string</option>
                      <option className="bg-slate-900" value="number">number</option>
                      <option className="bg-slate-900" value="boolean">boolean</option>
                      <option className="bg-slate-900" value="array">array</option>
                      <option className="bg-slate-900" value="object">object</option>
                    </select>
                    <div className="md:col-span-5 flex justify-between items-center">
                      {err && <span className="text-xs text-red-300">{err}</span>}
                      <Button variant="destructive" onClick={() => removeNodeById(rule.id)}>Remove</Button>
                    </div>
                  </div>
                );
              }
              function GroupBox({ group }: { group: VGroup }) {
                return (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-300">Group</span>
                        <select className="rounded-xl border border-white/10 bg-white/10 px-3 py-2" value={group.join} onChange={(e) => setGroupJoin(group.id, e.target.value as any)}>
                          <option className="bg-slate-900" value="AND">AND</option>
                          <option className="bg-slate-900" value="OR">OR</option>
                        </select>
                      </div>
                      {group.id !== visualRoot.id && (
                        <Button variant="destructive" onClick={() => removeNodeById(group.id)}>Remove Group</Button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {group.children.map((ch) => (
                        <div key={(ch as any).id}>
                          {(ch as any).type === "group" ? (
                            <GroupBox group={ch as VGroup} />
                          ) : (
                            <RuleRow rule={ch as VRule} />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => addRuleTo(group.id)}>Add Rule</Button>
                      <Button variant="outline" onClick={() => addGroupTo(group.id)}>Add Group</Button>
                    </div>
                  </div>
                );
              }
              return <GroupBox group={visualRoot} />;
            })()}
            <div className="flex items-center gap-2">
              <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10" onClick={applyVisualToFilter}>Apply to JSON</button>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 font-medium text-white hover:bg-slate-700" onClick={runVisual}>Run Search</button>
              <Button variant="outline" onClick={previewCount}>Preview count</Button>
              {previewTotal !== null && <span className="text-sm text-slate-300">Count: <span className="text-white/90">{previewTotal}</span></span>}
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Generated Filter (preview)</label>
              <pre className="whitespace-pre-wrap text-xs bg-black/40 text-slate-200 p-3 rounded-lg border border-white/10 overflow-x-auto">{JSON.stringify(buildFilterFromTree(visualRoot), null, 2)}</pre>
            </div>
          </div>
          </TabsContent>

          <TabsContent value="saved">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Profiles */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="text-lg font-semibold">Profiles</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input className="md:col-span-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2" placeholder="Name" value={newProfile.name} onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })} />
                <input className="md:col-span-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2" placeholder="mongodb://..." value={newProfile.uri} onChange={(e) => setNewProfile({ ...newProfile, uri: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10" onClick={addProfile}>Save Profile</button>
              </div>
              <div className="overflow-auto rounded-xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 text-left text-slate-300">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">URI</th>
                      <th className="p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(p => (
                      <tr key={p.id} className="border-t border-white/10">
                        <td className="p-3">{p.name}</td>
                        <td className="p-3 font-mono text-xs">{p.uri}</td>
                        <td className="p-3 flex gap-2">
                          <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 hover:bg-white/10" onClick={() => loadProfile(p.id)}>Load</button>
                          <button className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-200 hover:bg-red-500/20" onClick={() => deleteProfile(p.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Saved Queries */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="text-lg font-semibold">Saved Queries</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input className="md:col-span-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2" placeholder="Name" value={newSaved.name} onChange={(e) => setNewSaved({ name: e.target.value })} />
                <div className="md:col-span-2 flex justify-end">
                  <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10" onClick={addSaved}>Save Current</button>
                </div>
              </div>
              <div className="overflow-auto rounded-xl border border-white/10">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 text-left text-slate-300">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">DB</th>
                      <th className="p-3 font-medium">Collection</th>
                      <th className="p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedQueries.map(s => (
                      <tr key={s.id} className="border-t border-white/10">
                        <td className="p-3">{s.name}</td>
                        <td className="p-3">{s.db}</td>
                        <td className="p-3">{s.collection}</td>
                        <td className="p-3 flex gap-2">
                          <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 hover:bg-white/10" onClick={() => loadSaved(s.id)}>Load</button>
                          <button className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-200 hover:bg-red-500/20" onClick={() => deleteSaved(s.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </TabsContent>

          <TabsContent value="indexes">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Indexes</h2>
              <Button variant="outline" onClick={refreshIndexes}>Refresh</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Keys (JSON)</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder='[["field",1]]'
                  value={idxKeys}
                  onChange={(e) => setIdxKeys(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Name (optional)</label>
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="my_index"
                  value={idxName}
                  onChange={(e) => setIdxName(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input id="unique" type="checkbox" className="size-4" checked={idxUnique} onChange={(e) => setIdxUnique(e.target.checked)} />
                <label htmlFor="unique" className="text-sm text-slate-300">Unique</label>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={createIdx}>Create Index</Button>
              </div>
            </div>

            <div className="overflow-auto rounded-xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-slate-300">
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Key</th>
                    <th className="p-3 font-medium">Options</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(indexes ?? []).map((idx: any) => (
                    <tr key={idx.name} className="border-t border-white/10 align-top hover:bg-white/5">
                      <td className="p-3 whitespace-nowrap">{idx.name}</td>
                      <td className="p-3 font-mono text-xs">{JSON.stringify(idx.key)}</td>
                      <td className="p-3 font-mono text-xs">{JSON.stringify({ unique: idx.unique, sparse: idx.sparse })}</td>
                      <td className="p-3">
                        {idx.name !== "_id_" && (
                          <Button variant="destructive" onClick={() => dropIdx(idx.name)}>Drop</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </TabsContent>

          <TabsContent value="export">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-semibold">Export</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Format</label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-slate-100"
                  value={expFormat}
                  onChange={(e) => setExpFormat(e.target.value as any)}
                >
                  <option className="bg-slate-900" value="excel">Excel (.xlsx)</option>
                  <option className="bg-slate-900" value="csv">CSV (.csv)</option>
                  <option className="bg-slate-900" value="json">JSON (.json)</option>
                  <option className="bg-slate-900" value="pdf">PDF Report (.pdf)</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Limit (optional)</label>
                <Input
                  type="number"
                  className="w-full"
                  value={expLimit}
                  onChange={(e) => setExpLimit(e.target.value ? Number(e.target.value) : "")}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-300">Query (JSON)</label>
                <Textarea
                  className="h-28 font-mono text-sm"
                  placeholder="{}"
                  value={expQuery}
                  onChange={(e) => setExpQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input id="pretty" type="checkbox" className="size-4" checked={expPretty} onChange={(e) => setExpPretty(e.target.checked)} />
                <label htmlFor="pretty" className="text-sm text-slate-300">Pretty JSON (for .json)</label>
              </div>
              <div className="flex justify-end">
                <Button onClick={doExport}>Download</Button>
              </div>
            </div>
          </div>
          </TabsContent>
        </Tabs>

        {/* Create/Edit Dialogs */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Document</DialogTitle>
            </DialogHeader>
            <Textarea className="h-64 font-mono text-sm" value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                try {
                  const parsed = JSON.parse(jsonInput);
                  await api.insertDocument(connectionId!, db, collection, parsed);
                  toast.success("Đã tạo tài liệu");
                  setCreateOpen(false);
                  await query();
                } catch (e: any) {
                  toast.error(e.message || "Invalid JSON");
                }
              }}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Document</DialogTitle>
            </DialogHeader>
            <Textarea className="h-64 font-mono text-sm" value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                if (!editTargetId) return;
                try {
                  const parsed = JSON.parse(jsonInput);
                  delete (parsed as any)._id;
                  await api.updateDocument(connectionId!, db, collection, editTargetId, parsed);
                  toast.success("Đã cập nhật tài liệu");
                  setEditOpen(false);
                  await query();
                } catch (e: any) {
                  toast.error(e.message || "Invalid JSON");
                }
              }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
