"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  // Query perf & index suggestion
  const [execMs, setExecMs] = useState<number | null>(null);
  const [idxSuggestion, setIdxSuggestion] = useState<{ keys: [string, number][], note?: string } | null>(null);
  // Natural language (Visual)
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlNotes, setNlNotes] = useState<string | null>(null);
  const [nlLoading, setNlLoading] = useState(false);
  async function runNL() {
    if (!nlPrompt.trim()) return;
    try {
      setNlLoading(true);
      const res = await api.nlTranslate(nlPrompt.trim(), "auto");
      setNlNotes(res.notes || null);
      if (res.pipeline && Array.isArray(res.pipeline)) {
        const mapped = res.pipeline.map((st: any) => {
          const op = Object.keys(st)[0] as Stage["type"];
          return { type: op as Stage["type"], json: JSON.stringify(st[op], null, 2) };
        });
        setStages(mapped);
      } else if (res.filter) {
        setStages([...stages, { type: "$match", json: JSON.stringify(res.filter, null, 2) }]);
      }
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setNlLoading(false);
    }
  }
  // Tools: Schema Diff modal
  const [toolsOpen, setToolsOpen] = useState(false);
  const [srcDb, setSrcDb] = useState("");
  const [srcColl, setSrcColl] = useState("");
  const [tgtDb, setTgtDb] = useState("");
  const [tgtColl, setTgtColl] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffRes, setDiffRes] = useState<{ diff: any; plan: { pipeline: any[]; note: string } } | null>(null);
  async function doSchemaDiff() {
    if (!connectionId) { toast.error("Chưa kết nối"); return; }
    if (!srcDb || !srcColl || !tgtDb || !tgtColl) { toast.error("Chọn đủ Source và Target"); return; }
    try {
      setDiffLoading(true);
      const res = await api.schemaDiff(connectionId, { db: srcDb, collection: srcColl }, { db: tgtDb, collection: tgtColl }, 200);
      setDiffRes(res as any);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setDiffLoading(false);
    }
  }
  function pastePlanToVisual() {
    if (!diffRes?.plan?.pipeline?.length) return;
    const mapped = diffRes.plan.pipeline.map((step: any) => {
      const suggest = step.suggest || {};
      const op = Object.keys(suggest)[0] as Stage["type"];
      return { type: op as Stage["type"], json: JSON.stringify(suggest[op], null, 2) };
    });
    setStages(mapped);
    setToolsOpen(false);
    setTab("visual" as any);
  }
  // RBAC role & permissions
  const [activeRoleId, setActiveRoleId] = useState<string>("admin");
  const [roles, setRoles] = useState<{ id: string; name: string; permissions: Record<string, boolean> }[]>([]);
  const perms = useMemo(() => {
    const r = roles.find(r => r.id === activeRoleId);
    return r?.permissions || { read: true, write: true, export: true, indexes: true, admin: true };
  }, [roles, activeRoleId]);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.getRoles();
        setRoles(r.items || []);
        const a = await api.getActiveRole();
        if (a?.roleId) setActiveRoleId(a.roleId);
      } catch {}
    })();
  }, []);
  async function changeActiveRole(roleId: string) {
    setActiveRoleId(roleId);
    try { await api.setActiveRole(roleId); } catch {}
  }
  // Live tail (Change Streams)
  const [liveCursor, setLiveCursor] = useState(0);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveTimer, setLiveTimer] = useState<any>(null);
  const [liveFilter, setLiveFilter] = useState<{ insert: boolean; update: boolean; delete: boolean }>({ insert: true, update: true, delete: true });
  const [liveCounts, setLiveCounts] = useState<{ insert: number; update: number; delete: number }>({ insert: 0, update: 0, delete: 0 });
  function resetLive() {
    setLiveCursor(0);
    setLiveEvents([]);
    setLiveCounts({ insert: 0, update: 0, delete: 0 });
  }
  async function pollLiveOnce() {
    if (!connectionId || !db || !collection) return;
    try {
      const res = await api.pollChanges(connectionId, db, collection, liveCursor);
      setLiveCursor(res.cursor);
      if (res.events?.length) {
        setLiveEvents(prev => {
          const next = [...prev, ...res.events];
          return next.slice(-500);
        });
        const c = { ...liveCounts };
        for (const e of res.events) {
          if (e.operationType === 'insert') c.insert++;
          if (e.operationType === 'update' || e.operationType === 'replace') c.update++;
          if (e.operationType === 'delete') c.delete++;
        }
        setLiveCounts(c);
      }
    } catch (e: any) {
      console.error(e);
    }
  }
  async function startLive() {
    if (!connectionId || !db || !collection) { toast.error("Select DB & Collection"); return; }
    setLiveRunning(true);
    await pollLiveOnce();
    const t = setInterval(pollLiveOnce, 1000);
    setLiveTimer(t);
  }
  async function stopLive() {
    setLiveRunning(false);
    if (liveTimer) clearInterval(liveTimer);
    setLiveTimer(null);
    if (connectionId && db && collection) {
      try { await api.stopChanges(connectionId, db, collection); } catch {}
    }
  }

  // Saved aggregations (Dashboards)
  const [savedAggs, setSavedAggs] = useState<any[]>([]);
  const [widgetResults, setWidgetResults] = useState<Record<string, any[]>>({});
  async function refreshSaved() {
    try {
      const res = await api.listSavedAgg();
      setSavedAggs(res.items || []);
    } catch (e: any) {
      console.error(e);
    }
  }
  useEffect(() => { refreshSaved(); }, []);
  async function runWidget(id: string) {
    try {
      const w = savedAggs.find(x => x.id === id);
      if (!w || !connectionId) return;
      const res = await api.runAggregation(connectionId, w.db, w.collection, w.pipeline || []);
      setWidgetResults(prev => ({ ...prev, [w.id]: res.items || [] }));
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }
  async function refreshWidgets() {
    for (const w of savedAggs) {
      await runWidget(w.id);
    }
  }
  function renderWidget(w: any) {
    const items = widgetResults[w.id] || [];
    if (w.viz === 'kpi') {
      // Pick first numeric field from first doc
      let val: number | string = '-';
      if (items[0]) {
        const doc = items[0];
        const entry = Object.entries(doc).find(([,v]) => typeof v === 'number');
        val = entry ? Number(entry[1]) : '-';
      }
      return (
        <div className="rounded-xl bg-white p-5 border border-gray-200">
          <div className="text-sm text-gray-500">KPI</div>
          <div className="text-3xl font-semibold">{typeof val === 'number' ? val : String(val)}</div>
        </div>
      );
    }
    if (w.viz === 'bar') {
      // Find label (string) and value (number) keys from first row
      const rows = items.slice(0, 6);
      let labelKey: string | null = null;
      let valueKey: string | null = null;
      if (rows[0]) {
        for (const [k,v] of Object.entries(rows[0])) {
          if (labelKey === null && typeof v === 'string') labelKey = k;
          if (valueKey === null && typeof v === 'number') valueKey = k;
        }
      }
      const maxVal = Math.max(1, ...rows.map(r => (valueKey && typeof (r as any)[valueKey] === 'number') ? (r as any)[valueKey] : 0));
      return (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="truncate mr-2 max-w-[60%]">{labelKey ? String((r as any)[labelKey]) : `Row ${i+1}`}</span>
                <span className="text-gray-600">{valueKey ? String((r as any)[valueKey]) : '-'}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded">
                <div className="h-2 rounded bg-gradient-to-r from-blue-500 to-purple-600" style={{ width: `${valueKey ? Math.min(100, ((r as any)[valueKey] || 0) / maxVal * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      );
    }
    // table default
    return (
      <div className="overflow-auto rounded-xl border border-white/10 bg-white/60">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-white/50 text-left">
              {Object.keys(items[0] || { value: 'value' }).slice(0, 6).map((k) => (
                <th key={k} className="p-2 font-medium">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 5).map((row, idx) => (
              <tr key={idx} className="border-t">
                {Object.keys(items[0] || { value: 'value' }).slice(0, 6).map((k) => (
                  <td key={k} className="p-2 font-mono">{JSON.stringify((row as any)[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  async function saveCurrentAgg() {
    if (!connectionId || !db || !collection) { toast.error("Select DB & Collection"); return; }
    try {
      const name = prompt("Widget name?", `${db}.${collection} pipeline`);
      if (!name) return;
      const viz = (prompt("Viz type (kpi/table/bar)?", "table") || "table").toLowerCase();
      const pipeline = stages.map(s => ({ [s.type]: JSON.parse(s.json || (s.type === "$limit" ? "10" : "{}")) }));
      await api.saveAgg({ name, db, collection, pipeline, viz: (viz as any) });
      toast.success("Saved widget");
      refreshSaved();
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  // Field stats (Analytics)
  const [statsField, setStatsField] = useState<string>("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<{ top: { _id: any; count: number }[]; numeric: { min: number; max: number; avg: number; count: number } | null } | null>(null);
  async function analyzeField() {
    if (!connectionId || !db || !collection) { toast.error("Select DB & Collection"); return; }
    if (!statsField.trim()) { toast.error("Enter a field name"); return; }
    try {
      setStatsLoading(true);
      const res = await api.fieldStats(connectionId, db, collection, statsField.trim(), 10);
      setStatsData(res);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setStatsLoading(false);
    }
  }

  // JSON validation states
  const [filterErr, setFilterErr] = useState<string | null>(null);
  const [projErr, setProjErr] = useState<string | null>(null);
  const [sortErr, setSortErr] = useState<string | null>(null);
  const [dbStatsOpen, setDbStatsOpen] = useState(false);
  const [dbStatsData, setDbStatsData] = useState<any | null>(null);
  const [collStatsOpen, setCollStatsOpen] = useState(false);
  const [collStatsData, setCollStatsData] = useState<any | null>(null);
  // Collection management states
  const [newCollectionName, setNewCollectionName] = useState<string>("");

  // Indexes & Export states
  const [indexes, setIndexes] = useState<any[] | null>(null);
  const [idxKeys, setIdxKeys] = useState<string>("[[\"field\",1]]");
  const [idxName, setIdxName] = useState<string>("");
  const [idxUnique, setIdxUnique] = useState<boolean>(false);
  const [idxPartial, setIdxPartial] = useState<string>("");
  const [idxCollation, setIdxCollation] = useState<string>("");
  const [expFormat, setExpFormat] = useState<"excel" | "csv" | "json" | "pdf">("excel");
  const [expLimit, setExpLimit] = useState<number | "">("");
  const [expPretty, setExpPretty] = useState<boolean>(true);
  const [expQuery, setExpQuery] = useState<string>("");
  // CSV field chips
  const [expFieldChips, setExpFieldChips] = useState<string[]>([]);
  const [expFieldInput, setExpFieldInput] = useState<string>("");
  const [csvFieldMRU, setCsvFieldMRU] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("csvFieldMRU");
      if (raw) setCsvFieldMRU(JSON.parse(raw));
    } catch {}
  }, []);
  function updateCsvMRU(field: string) {
    try {
      const v = field.trim(); if (!v) return;
      const next = [v, ...csvFieldMRU.filter(x => x !== v)].slice(0, 20);
      setCsvFieldMRU(next);
      localStorage.setItem("csvFieldMRU", JSON.stringify(next));
    } catch {}
  }
  const [idxKeysErr, setIdxKeysErr] = useState<string | null>(null);
  const [expQueryErr, setExpQueryErr] = useState<string | null>(null);
  const [idxPartialErr, setIdxPartialErr] = useState<string | null>(null);
  const [idxCollationErr, setIdxCollationErr] = useState<string | null>(null);
  // Analytics state
  const [dbStat, setDbStat] = useState<any | null>(null);
  const [collStats, setCollStats] = useState<Record<string, any>>({});
  // Analytics maxima for mini-bars
  const maxCount = useMemo(() => {
    const vals = Object.values(collStats).map((s: any) => s?.count ?? 0);
    return Math.max(1, ...vals);
  }, [collStats]);
  const maxSize = useMemo(() => {
    const vals = Object.values(collStats).map((s: any) => s?.size ?? 0);
    return Math.max(1, ...vals);
  }, [collStats]);
  const maxStorage = useMemo(() => {
    const vals = Object.values(collStats).map((s: any) => s?.storageSize ?? 0);
    return Math.max(1, ...vals);
  }, [collStats]);
  const maxIndexSize = useMemo(() => {
    const vals = Object.values(collStats).map((s: any) => s?.totalIndexSize ?? 0);
    return Math.max(1, ...vals);
  }, [collStats]);

  // Schema explorer state
  const [schemaSummary, setSchemaSummary] = useState<Record<string, any> | null>(null);
  const [schemaSamples, setSchemaSamples] = useState<any[] | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  async function loadSchema() {
    if (!connectionId || !db || !collection) { toast.error("Select DB & Collection"); return; }
    try {
      setSchemaLoading(true);
      const sum = await api.schemaSummary(connectionId, db, collection, 200);
      const sam = await api.schemaSample(connectionId, db, collection, 5);
      setSchemaSummary(sum.fields || {});
      setSchemaSamples(sam.items || []);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setSchemaLoading(false);
    }
  }

  // Visual aggregation builder state
  type Stage = { type: "$match"|"$project"|"$group"|"$sort"|"$limit"; json: string };
  const [stages, setStages] = useState<Stage[]>([{ type: "$match", json: "{}" }]);
  const [aggResult, setAggResult] = useState<any[] | null>(null);
  function addStage(t: Stage["type"]) { setStages([...stages, { type: t, json: t === "$limit" ? "10" : "{}" }]); }
  function updateStage(i: number, patch: Partial<Stage>) { const next = [...stages]; next[i] = { ...next[i], ...patch }; setStages(next); }
  function removeStage(i: number) { const next = [...stages]; next.splice(i,1); setStages(next); }
  async function runAgg() {
    if (!connectionId || !db || !collection) { toast.error("Select DB & Collection"); return; }
    try {
      const pipeline = stages.map(s => ({ [s.type]: JSON.parse(s.json || (s.type === "$limit" ? "10" : "{}")) }));
      const res = await api.runAggregation(connectionId, db, collection, pipeline);
      setAggResult(res.items || []);
      toast.success(`Pipeline returned ${res.items?.length ?? 0} docs`);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  // Saved query pins (top 3)
  const [pinnedSaved, setPinnedSaved] = useState<any[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("savedQueryPins");
      if (raw) setPinnedSaved(JSON.parse(raw));
    } catch {}
  }, []);
  function pushPin(pin: any) {
    try {
      const k = `${pin.db}|${pin.collection}|${pin.filter ?? ""}|${pin.projection ?? ""}|${pin.sort ?? ""}`;
      const existing = pinnedSaved.filter(p => `${p.db}|${p.collection}|${p.filter}|${p.projection}|${p.sort}` !== k);
      const next = [{ ...pin, ts: Date.now() }, ...existing].slice(0, 3);
      setPinnedSaved(next);
      localStorage.setItem("savedQueryPins", JSON.stringify(next));
    } catch {}
  }

  // Tabs: browse | visual | saved | indexes | export
  const [tab, setTab] = useState<"browse" | "visual" | "saved" | "indexes" | "export" | "analytics">("browse");

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

  // Inline validations for Indexes and Export
  useEffect(() => {
    // idxKeys JSON array of [field, dir]
    if (!idxKeys.trim()) { setIdxKeysErr("Required"); return; }
    try {
      const k = JSON.parse(idxKeys);
      if (!Array.isArray(k) || k.length === 0) setIdxKeysErr("Expect array of [field, dir]");
      else setIdxKeysErr(null);
    } catch {
      setIdxKeysErr("Invalid JSON");
    }
  }, [idxKeys]);

  useEffect(() => {
    if (!expQuery.trim()) { setExpQueryErr(null); return; }
    try { JSON.parse(expQuery); setExpQueryErr(null); } catch { setExpQueryErr("Invalid JSON"); }
  }, [expQuery]);

  useEffect(() => {
    if (!idxPartial.trim()) { setIdxPartialErr(null); return; }
    try { JSON.parse(idxPartial); setIdxPartialErr(null); } catch { setIdxPartialErr("Invalid JSON"); }
  }, [idxPartial]);

  useEffect(() => {
    if (!idxCollation.trim()) { setIdxCollationErr(null); return; }
    try { JSON.parse(idxCollation); setIdxCollationErr(null); } catch { setIdxCollationErr("Invalid JSON"); }
  }, [idxCollation]);

  // CSV chips: add on Enter/comma, remove on click
  function addFieldChip(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (expFieldChips.includes(v)) return;
    setExpFieldChips([...expFieldChips, v]);
    setExpFieldInput("");
    updateCsvMRU(v);
  }
  function removeFieldChip(v: string) {
    setExpFieldChips(expFieldChips.filter(x => x !== v));
  }

  // Quick load pinned
  function applyPin(p: any) {
    setDb(p.db);
    setCollection(p.collection);
    setFilter(p.filter || "");
    setProjection(p.projection || "");
    setSort(p.sort || "");
    setTab("browse");
    toast.message("Đã load từ Pin");
  }

  // Flatten helper for selecting all fields (dot notation)
  function flattenDoc(obj: any, parent = "", out: string[] = []) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        const path = parent ? `${parent}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          flattenDoc(v as any, path, out);
        } else {
          out.push(path);
        }
      }
    } else {
      if (parent) out.push(parent);
    }
    return out;
  }

  async function selectAllFieldsFromSample() {
    if (!connectionId || !db || !collection) { toast.error("Chọn DB/Collection trước"); return; }
    try {
      const queryJson = tryParseJSON(expQuery) ?? {};
      const res = await api.queryDocuments(connectionId, { db, collection, filter: queryJson, page: 1, pageSize: 1 });
      const doc = res.items?.[0];
      if (!doc) { toast.message("Không có tài liệu mẫu"); return; }
      const fields = Array.from(new Set(flattenDoc(doc)));
      setExpFieldChips(fields);
      // update MRU
      fields.forEach(updateCsvMRU);
      toast.success(`Đã chọn ${fields.length} fields`);
    } catch (e: any) {
      toast.error(e.message || String(e));
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

  // ---- Analytics helpers (component scope) ----
  async function loadAnalytics() {
    if (!connectionId || !db) return;
    try {
      const ds = await api.dbStats(connectionId, db);
      setDbStat(ds);
      if (!collections.length) {
        setCollStats({});
        return;
      }
      const entries: [string, any][] = [];
      for (const c of collections) {
        try {
          const cs = await api.collStats(connectionId, db, c);
          entries.push([c, cs]);
        } catch (_) {
          // skip individual errors
        }
      }
      setCollStats(Object.fromEntries(entries));
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }
  // Auto refresh analytics when tab activated or db/collection list changes
  useEffect(() => {
    if (tab === "analytics") {
      void loadAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, db, collections.join(","), connectionId]);

  // Auto refresh indexes when tab activated or target changes
  useEffect(() => {
    if (tab === "indexes") {
      void refreshIndexes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, connectionId, db, collection]);

  // ---- Dialogs for Create/Edit ----
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState<string>("{}");
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  // View dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewJson, setViewJson] = useState<string>("{}");

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

  function validateJSONInline() {
    // validate and set errors, but do not throw
    function check(label: string, val: string, setErr: (s: string | null) => void, allowEmpty = true) {
      if (!val.trim()) { setErr(allowEmpty ? null : `${label} is required`); return true; }
      try { JSON.parse(val); setErr(null); return true; } catch (e:any) { setErr("Invalid JSON"); return false; }
    }
    const ok1 = check("Filter", filter, setFilterErr, true);
    const ok2 = check("Projection", projection, setProjErr, true);
    const ok3 = check("Sort", sort, setSortErr, true);
    return ok1 && ok2 && ok3;
  }

  useEffect(() => { validateJSONInline(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, projection, sort]);

  async function query() {
    if (!connectionId || !db || !collection) return;
    // block if invalid JSON
    if (!validateJSONInline()) {
      toast.error("Vui lòng sửa lỗi JSON ở Filter/Projection/Sort");
      return;
    }
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
      setExecMs(res.executionMs ?? null);
      setIdxSuggestion(res.indexSuggestion ?? null);
      // record pin
      pushPin({ name: `${db}.${collection}`, db, collection, filter, projection, sort });
    } catch (e: any) {
      setError(e.message || String(e));
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

  async function openDbStats() {
    if (!connectionId || !db) { toast.error("Select a database first"); return; }
    try {
      const stats = await api.dbStats(connectionId, db);
      setDbStatsData(stats);
      setDbStatsOpen(true);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  async function openCollStats() {
    if (!connectionId || !db || !collection) { toast.error("Select a collection first"); return; }
    try {
      const stats = await api.collStats(connectionId, db, collection);
      setCollStatsData(stats);
      setCollStatsOpen(true);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  // ---- Collection management ----
  async function createCollectionUI() {
    if (!connectionId || !db) { toast.error("Chọn database trước"); return; }
    const name = newCollectionName.trim();
    if (!name) { toast.error("Nhập tên collection"); return; }
    try {
      await api.createCollection(connectionId, db, name);
      setNewCollectionName("");
      const cols = await api.listCollections(connectionId, db);
      setCollections(cols);
      toast.success(`Đã tạo collection ${name}`);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  async function dropCurrentCollectionUI() {
    if (!connectionId || !db || !collection) { toast.error("Chọn collection trước"); return; }
    if (!confirm(`Xoá collection "${collection}"? Hành động không thể hoàn tác.`)) return;
    try {
      await api.dropCollection(connectionId, db, collection);
      const cols = await api.listCollections(connectionId, db);
      setCollections(cols);
      setCollection(cols[0] || "");
      toast.success("Đã xoá collection");
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  // ---- Bulk delete by current filter ----
  async function deleteByFilter() {
    if (!connectionId || !db || !collection) return;
    try {
      const f = tryParseJSON(filter) ?? {};
      const preview = await api.queryDocuments(connectionId, { db, collection, filter: f, page: 1, pageSize: 1 });
      const count = preview.total;
      if (count === 0) { toast.message("Không có tài liệu khớp filter"); return; }
      if (!confirm(`Xoá ${count} tài liệu khớp filter hiện tại?`)) return;
      const res = await api.deleteMany(connectionId, { db, collection, filter: f });
      toast.success(`Đã xoá ${res.deleted} tài liệu`);
      await query();
    } catch (e: any) {
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
      const partial = idxPartial.trim() ? JSON.parse(idxPartial) : undefined;
      const coll = idxCollation.trim() ? JSON.parse(idxCollation) : undefined;
      await api.createIndex(connectionId, db, collection, { keys, unique: idxUnique, name: idxName || undefined, partialFilterExpression: partial, collation: coll });
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
      const fieldsArr = expFieldChips;
      const { blob, filename } = await api.exportCollection(
        connectionId,
        db,
        collection,
        expFormat,
        { limit: typeof expLimit === "number" ? expLimit : undefined, pretty: expPretty, query: queryJson, fields: fieldsArr.length ? fieldsArr : undefined }
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
    <div className="min-h-screen bg-gradient-to-br from-slate-200 via-slate-300 to-slate-200">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>
      
      {/* Hero Section */}
      <section className="relative bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-lg pb-4">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-600/5 via-slate-500/5 to-slate-600/5" />
        <div className="relative mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg float-slow">
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
              <Link href="/sync">
                <Button variant="outline" className="rounded-xl">Sync</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main className="relative mx-auto max-w-7xl px-8 pb-16 space-y-10">
        <div className="mt-6 rounded-3xl bg-white/30 backdrop-blur-2xl ring-1 ring-white/40 shadow-2xl p-8 space-y-10">
        {/* Connection Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden hover-glow">
          <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-7 border-b border-white/20">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Database Connection
            </h2>
            <p className="text-sm text-gray-600 mt-1">Connect to your MongoDB instance</p>
          </div>
          <div className="p-7">
            <div className="flex flex-col gap-6 md:flex-row md:items-end">
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
                className="h-12 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 hover-glow" 
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
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-4 mb-6 hover-glow">
            <TabsList className="grid w-full grid-cols-8 bg-transparent gap-3 p-1">
              <TabsTrigger 
                value="browse" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Browse
              </TabsTrigger>
              <TabsTrigger 
                value="visual" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Visual
              </TabsTrigger>
              <TabsTrigger 
                value="saved" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Saved
              </TabsTrigger>
              <TabsTrigger 
                value="indexes" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7H3a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z" />
                </svg>
                Indexes
              </TabsTrigger>
              <TabsTrigger 
                value="export" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </TabsTrigger>
              <TabsTrigger 
                value="analytics" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3v18M6 13v8m10-12v12m5-6v6M1 9v12" />
                </svg>
                Analytics
              </TabsTrigger>
              <TabsTrigger 
                value="schema" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
                Schema
              </TabsTrigger>
              <TabsTrigger 
                value="live" 
                className="relative px-6 py-3 rounded-2xl font-medium transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:pan-gradient hover:bg-gray-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
                Live
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tools button and Role selector */}
          <div className="mb-4 flex items-center justify-end gap-2">
            <select className="rounded-xl border border-white/10 bg-white/10 px-3 py-2" value={activeRoleId} onChange={(e) => changeActiveRole(e.target.value)}>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Button variant="outline" onClick={() => setToolsOpen(true)}>Tools</Button>
          </div>

          <TabsContent value="browse">
          <>
            {/* Selectors */}
            <div className="mt-6 relative z-10 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 overflow-hidden hover-glow">
                <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-5 border-b border-white/20">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
                    </svg>
                    Database
                  </h3>
                </div>
                <div className="p-5">
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
                <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-5 border-b border-white/20">
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
                  <div className="mt-3 flex justify-end">
                    <Button onClick={query} disabled={!perms.read} className="h-10 px-5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                      Execute Query
                    </Button>
                  </div>
                  {(execMs !== null || idxSuggestion) && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      {execMs !== null && (
                        <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">Execution: {execMs} ms</span>
                      )}
                      {idxSuggestion && idxSuggestion.keys?.length > 0 && (
                        <div className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-2">
                          <span>Suggest index:</span>
                          <code className="text-xs">{JSON.stringify(idxSuggestion.keys)}</code>
                          <Button size="sm" className="h-7 disabled:opacity-50" disabled={!perms.indexes} onClick={async () => {
                            if (!connectionId || !db || !collection) return;
                            try {
                              await api.createIndex(connectionId, db, collection, { keys: idxSuggestion.keys });
                              toast.success("Index created");
                              const ix = await api.listIndexes(connectionId, db, collection);
                              setIndexes(ix);
                            } catch (e: any) { toast.error(e.message || String(e)); }
                          }}>Create</Button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      className="md:col-span-2 rounded-xl border border-gray-200 px-3 py-2"
                      placeholder="New collection name"
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                    />
                    <Button onClick={createCollectionUI} className="hover-glow">Create</Button>
                    <div className="md:col-span-3 flex justify-end">
                      <Button variant="destructive" onClick={dropCurrentCollectionUI} disabled={!collection || !perms.write} className="hover-glow disabled:opacity-50">Drop Collection</Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 overflow-hidden hover-glow">
                <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-5 border-b border-white/20">
                  <h3 className="text-sm font-semibold text-gray-800">Size</h3>
                </div>
                <div className="p-5">
                  <Input
                    type="number"
                    className="h-11 border-gray-200 rounded-xl"
                    value={pageSize}
                    onChange={(e) => setPageSize(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              </div>
            </div>
            {/* Query controls */}
            <div className="mt-10 bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden relative z-0 hover-glow">
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-7 border-b border-white/20">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Query Parameters
                </h2>
                <p className="text-sm text-gray-600 mt-1">Define your MongoDB query with filters, projections, and sorting</p>
              </div>
              <div className="p-7 space-y-7">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
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
                    {filterErr && <div className="text-xs text-red-600">{filterErr}</div>}
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
                    {projErr && <div className="text-xs text-red-600">{projErr}</div>}
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
                    {sortErr && <div className="text-xs text-red-600">{sortErr}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  <Button 
                    onClick={query} 
                    disabled={loading} 
                    size="lg" 
                    className="h-12 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 hover-glow"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {loading ? "Searching..." : "Execute Query"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => pushPin({ name: `${db}.${collection}`, db, collection, filter, projection, sort })}
                    className="h-10 rounded-xl"
                    title="Ghim (Pin) truy vấn hiện tại"
                  >
                    Pin
                  </Button>
                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-red-200/50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    onClick={deleteByFilter}
                    className="h-10 hover-glow"
                  >
                    Delete by current filter
                  </Button>
                </div>
              </div>
            </div>

        {/* Results */}
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow- xl border border-white/20 overflow-hidden mt-12 hover-glow">
          <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-8 border-b border-white/20">
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Go to</span>
                  <Input
                    type="number"
                    className="h-10 w-24 border-gray-200 rounded-xl"
                    value={page}
                    onChange={(e) => setPage(Math.max(1, Number(e.target.value)))}
                  />
                </div>
                <Button
                  variant="outline"
                  className="h-10 px-4 rounded-xl border-gray-200 hover:bg-gray-50 transition-all duration-200"
                  onClick={openDbStats}
                >
                  DB Stats
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-4 rounded-xl border-gray-200 hover:bg-gray-50 transition-all duration-200"
                  onClick={openCollStats}
                >
                  Collection Stats
                </Button>
              </div>
            </div>
          </div>
          
          <div className="overflow-auto">
            {loading && (
              <div className="p-8 text-sm text-gray-600">Loading documents...</div>
            )}
            {!loading && (data?.total ?? 0) === 0 && (
              <div className="p-8 text-sm text-gray-600">No documents found. Adjust your filter or change collection.</div>
            )}
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
                      <div className="flex items-center gap-2 max-w-xs">
                        <div className="font-mono text-xs bg-gray-100/80 text-gray-700 px-3 py-2 rounded-lg border overflow-hidden">
                          {String(doc._id)}
                        </div>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => { navigator.clipboard.writeText(String(doc._id)); toast.success("Copied!"); }}>Copy</Button>
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
                          className="h-9 px-4 rounded-lg"
                          onClick={() => { setViewJson(JSON.stringify(doc, null, 2)); setViewOpen(true); }}
                        >
                          View
                        </Button>
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
              className="h-11 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
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
        {/* Tools Modal: Schema Diff */}
        <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schema Diff</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/60 p-3">
                <div className="text-sm font-semibold mb-2">Source</div>
                <input className="w-full rounded-xl border border-white/10 bg-white/40 px-3 py-2 mb-2" placeholder="db" value={srcDb} onChange={(e)=>setSrcDb(e.target.value)} />
                <input className="w-full rounded-xl border border-white/10 bg-white/40 px-3 py-2" placeholder="collection" value={srcColl} onChange={(e)=>setSrcColl(e.target.value)} />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/60 p-3">
                <div className="text-sm font-semibold mb-2">Target</div>
                <input className="w-full rounded-xl border border-white/10 bg-white/40 px-3 py-2 mb-2" placeholder="db" value={tgtDb} onChange={(e)=>setTgtDb(e.target.value)} />
                <input className="w-full rounded-xl border border-white/10 bg-white/40 px-3 py-2" placeholder="collection" value={tgtColl} onChange={(e)=>setTgtColl(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-3">
              <Button variant="outline" onClick={doSchemaDiff} disabled={diffLoading || !connectionId}>Compare</Button>
              {diffRes?.plan?.pipeline?.length ? <Button onClick={pastePlanToVisual}>Paste Plan to Visual</Button> : null}
            </div>
            {diffRes && (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/60 p-3">
                  <div className="text-sm font-semibold">Added</div>
                  <pre className="text-xs overflow-auto">{JSON.stringify(diffRes.diff?.added || [], null, 2)}</pre>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/60 p-3">
                  <div className="text-sm font-semibold">Removed</div>
                  <pre className="text-xs overflow-auto">{JSON.stringify(diffRes.diff?.removed || [], null, 2)}</pre>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/60 p-3">
                  <div className="text-sm font-semibold">Changed</div>
                  <pre className="text-xs overflow-auto">{JSON.stringify(diffRes.diff?.changed || [], null, 2)}</pre>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/60 p-3">
                  <div className="text-sm font-semibold">Plan</div>
                  <pre className="text-xs overflow-auto">{JSON.stringify(diffRes.plan || {}, null, 2)}</pre>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
          <TabsContent value="visual">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            {/* Natural Language to Query */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex-1 flex items-center gap-2">
                <input
                  className="w-full rounded-xl border border-white/10 bg-white/60 px-3 py-2 text-sm"
                  placeholder="Describe your query, e.g. orders in last 7 days grouped by status"
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                />
                <Button onClick={runNL} disabled={nlLoading || !perms.read} className="disabled:opacity-50">Translate</Button>
              </div>
              {nlNotes && (
                <span className="text-xs text-gray-600">{nlNotes === 'heuristic' ? 'Heuristic mode' : nlNotes}</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Visual Query Builder</h2>
              <div className="flex gap-2">
                {(["$match","$project","$group","$sort","$limit"] as const).map(t => (
                  <Button key={t} variant="outline" onClick={() => addStage(t)}>{t}</Button>
                ))}
                <Button onClick={runAgg} disabled={!perms.read} className="brand-gradient disabled:opacity-50">Run</Button>
                <Button variant="outline" onClick={saveCurrentAgg}>Save as Widget</Button>
              </div>
            </div>
            <div className="space-y-3">
              {stages.map((s, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/40 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-white/60 border">{s.type}</span>
                    <Button size="sm" variant="destructive" onClick={() => removeStage(i)}>Remove</Button>
                  </div>
                  <Textarea className="h-24 font-mono text-sm" value={s.json} onChange={(e) => updateStage(i, { json: e.target.value })} />
                </div>
              ))}
            </div>
            {aggResult && (
              <div className="rounded-xl border border-white/10 bg-white/60 p-3">
                <div className="text-sm font-semibold mb-2">Preview ({aggResult.length})</div>
                <pre className="text-xs overflow-auto max-h-80">{JSON.stringify(aggResult, null, 2)}</pre>
              </div>
            )}
          </div>
          </TabsContent>

        <TabsContent value="saved">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Profiles */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-lg font-semibold">Profiles</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input className="md:col-span-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" placeholder="Name" value={newProfile.name} onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })} />
              <input className="md:col-span-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" placeholder="mongodb://..." value={newProfile.uri} onChange={(e) => setNewProfile({ ...newProfile, uri: e.target.value })} />
            </div>
            <div className="flex justify-end">
              <button className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50" onClick={addProfile}>Save Profile</button>
            </div>
            <div className="overflow-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm text-gray-800">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="p-3 text-sm font-semibold text-gray-700">Name</th>
                    <th className="p-3 text-sm font-semibold text-gray-700">URI</th>
                    <th className="p-3 text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(p => (
                    <tr key={p.id} className="border-t border-white/10">
                      <td className="p-3">{p.name}</td>
                      <td className="p-3 font-mono text-xs text-gray-700">{p.uri}</td>
                      <td className="p-3 flex gap-2">
                        <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50" onClick={() => loadProfile(p.id)}>Load</button>
                        <button className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-700 hover:bg-rose-100" onClick={() => deleteProfile(p.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Saved Queries */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-lg font-semibold">Saved Queries</h2>
            {pinnedSaved.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                {pinnedSaved.map((p) => (
                  <button key={`${p.db}.${p.collection}.${p.ts}`} className="px-3 py-1.5 rounded-full text-xs bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200/60" onClick={() => applyPin(p)}>
                    {p.name || `${p.db}.${p.collection}`}
                  </button>
                ))}
                <button className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100" onClick={() => { setPinnedSaved([]); localStorage.removeItem('savedQueryPins'); }}>Clear Pins</button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input className="md:col-span-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" placeholder="Name" value={newSaved.name} onChange={(e) => setNewSaved({ name: e.target.value })} />
              <div className="md:col-span-2 flex justify-end">
                <button className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50" onClick={addSaved}>Save Current</button>
              </div>
            </div>
            <div className="overflow-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm text-gray-800">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="p-3 text-sm font-semibold text-gray-700">Name</th>
                    <th className="p-3 text-sm font-semibold text-gray-700">DB</th>
                    <th className="p-3 text-sm font-semibold text-gray-700">Collection</th>
                    <th className="p-3 text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedQueries.map(s => (
                    <tr key={s.id} className="border-t border-white/10">
                      <td className="p-3">{s.name}</td>
                      <td className="p-3">{s.db}</td>
                      <td className="p-3">{s.collection}</td>
                      <td className="p-3 flex gap-2">
                        <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50" onClick={() => loadSaved(s.id)}>Load</button>
                        <button className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-700 hover:bg-rose-100" onClick={() => deleteSaved(s.id)}>Delete</button>
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
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Indexes</h2>
            <Button variant="outline" onClick={refreshIndexes}>Refresh</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">Keys (JSON)</label>
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                placeholder='[["field",1]]'
                value={idxKeys}
                onChange={(e) => setIdxKeys(e.target.value)}
              />
              {idxKeysErr && <div className="mt-1 text-xs text-red-600">{idxKeysErr}</div>}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Name (optional)</label>
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                placeholder="my_index"
                value={idxName}
                onChange={(e) => setIdxName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input id="unique" type="checkbox" className="size-4" checked={idxUnique} onChange={(e) => setIdxUnique(e.target.checked)} />
              <label htmlFor="unique" className="text-sm text-gray-700">Unique</label>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={createIdx} disabled={!!idxKeysErr}>Create Index</Button>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm text-gray-800">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-3 text-sm font-semibold text-gray-700">Name</th>
                  <th className="p-3 text-sm font-semibold text-gray-700">Key</th>
                  <th className="p-3 text-sm font-semibold text-gray-700">Options</th>
                  <th className="p-3 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(indexes ?? []).map((idx: any, i: number) => (
                  <tr key={idx.name} className={`border-t border-gray-200 align-top ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="p-3 whitespace-nowrap text-gray-900">{idx.name}</td>
                    <td className="p-3 font-mono text-xs text-gray-800">{JSON.stringify(idx.key)}</td>
                    <td className="p-3 font-mono text-xs text-gray-800">{JSON.stringify({ unique: idx.unique, sparse: idx.sparse })}</td>
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
              {expQueryErr && <div className="mt-1 text-xs text-red-300">{expQueryErr}</div>}
            </div>
            <div className="flex items-center gap-2">
              <input id="pretty" type="checkbox" className="size-4" checked={expPretty} onChange={(e) => setExpPretty(e.target.checked)} />
              <label htmlFor="pretty" className="text-sm text-slate-300">Pretty JSON (for .json)</label>
            </div>
            {expFormat === 'csv' && (
              <div className="md:col-span-2 space-y-2">
                <label className="mb-1 block text-sm text-slate-300">CSV Fields</label>
                <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                  {expFieldChips.map((f, idx) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white/10 border border-white/15 cursor-grab"
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={() => {
                        if (dragIndex === null || dragIndex === idx) return;
                        const next = [...expFieldChips];
                        const [moved] = next.splice(dragIndex, 1);
                        next.splice(idx, 0, moved);
                        setExpFieldChips(next);
                        setDragIndex(null);
                      }}
                      title="Kéo để sắp xếp"
                    >
                      {f}
                      <button className="text-slate-300 hover:text-white" onClick={() => removeFieldChip(f)}>×</button>
                    </span>
                  ))}
                  <input
                    className="min-w-[160px] flex-1 bg-transparent outline-none px-2 py-1 text-sm"
                    placeholder="nhập field và Enter..."
                    value={expFieldInput}
                    onChange={(e) => setExpFieldInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFieldChip(expFieldInput); }
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Gợi ý: ví dụ user.name, email, createdAt</p>
                  <div className="flex items-center gap-2">
                    <button className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15" onClick={selectAllFieldsFromSample}>Select all fields</button>
                  </div>
                </div>
                {csvFieldMRU.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {csvFieldMRU.filter(f => !expFieldChips.includes(f)).slice(0, 10).map(f => (
                      <button key={f} className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/15 hover:bg-white/15" onClick={() => addFieldChip(f)}>
                        + {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={doExport} disabled={!!expQueryErr}>Download</Button>
            </div>
          </div>
        </div>
        </TabsContent>
        <TabsContent value="live">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button onClick={liveRunning ? stopLive : startLive} className={liveRunning ? "bg-rose-600 text-white hover:bg-rose-700" : "brand-gradient"}>
                  {liveRunning ? "Pause" : "Start"}
                </Button>
                <Button variant="outline" onClick={resetLive}>Reset</Button>
                <div className="text-sm text-gray-700 flex items-center gap-3">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={liveFilter.insert} onChange={(e)=>setLiveFilter({...liveFilter, insert: e.target.checked})}/> insert</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={liveFilter.update} onChange={(e)=>setLiveFilter({...liveFilter, update: e.target.checked})}/> update</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={liveFilter.delete} onChange={(e)=>setLiveFilter({...liveFilter, delete: e.target.checked})}/> delete</label>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">insert: {liveCounts.insert}</span>
                <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">update: {liveCounts.update}</span>
                <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200">delete: {liveCounts.delete}</span>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/60 p-3 max-h-[420px] overflow-auto">
              {liveEvents.filter(e => (e.operationType === 'insert' && liveFilter.insert) || (['update','replace'].includes(e.operationType) && liveFilter.update) || (e.operationType === 'delete' && liveFilter.delete)).slice(-300).reverse().map((e, idx) => (
                <div key={idx} className="border-b last:border-b-0 border-white/20 py-2">
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                    <span className="font-semibold">{e.operationType}</span>
                    <span>{e.ns?.db}.{e.ns?.coll}</span>
                    <span className="ml-auto">{new Date(e.ts*1000).toLocaleTimeString()}</span>
                  </div>
                  <pre className="text-[11px] leading-snug bg-white/50 p-2 rounded border border-white/20 overflow-auto">{JSON.stringify(e.fullDocument || e.updateDescription || e.documentKey, null, 2)}</pre>
                </div>
              ))}
              {liveEvents.length === 0 && (
                <div className="text-sm text-gray-500">No events yet. Click Start to begin tailing changes.</div>
              )}
            </div>
          </div>
        </TabsContent>
        {/* Analytics Tab Content */}
        <TabsContent value="analytics">
          <div className="space-y-6">
            {/* Dashboards grid */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Dashboards</h3>
                  <p className="text-sm text-gray-600">Saved aggregation widgets</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={refreshSaved}>Reload</Button>
                  <Button onClick={refreshWidgets} className="brand-gradient">Refresh All</Button>
                </div>
              </div>
              {!connectionId && (
                <div className="p-4 text-sm text-amber-700 bg-amber-50 border-t border-amber-200">Connect to a database to evaluate widgets.</div>
              )}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedAggs.length === 0 && (
                  <div className="text-sm text-gray-500">No widgets yet. Build a pipeline in Visual and click "Save as Widget".</div>
                )}
                {savedAggs.map(w => (
                  <div key={w.id} className="rounded-xl border border-white/10 bg-white/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-semibold text-gray-800">{w.name}</div>
                        <div className="text-xs text-gray-500">{w.db}.{w.collection} • {w.viz}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => runWidget(w.id)}>Run</Button>
                    </div>
                    {renderWidget(w)}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Collections Analytics</h3>
                  <p className="text-sm text-gray-600">Mini metrics for quick insights</p>
                </div>
                <Button variant="outline" onClick={loadAnalytics}>Refresh</Button>
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">Collections</div>
                  <div className="text-2xl font-semibold">{dbStat?.collections ?? collections.length}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">Documents</div>
                  <div className="text-2xl font-semibold">{dbStat?.objects ?? "-"}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">Data Size</div>
                  <div className="text-2xl font-semibold">{dbStat?.dataSize ? (dbStat.dataSize/1024/1024).toFixed(2) : "-"} MB</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-500">Index Size</div>
                  <div className="text-2xl font-semibold">{dbStat?.indexSize ? (dbStat.indexSize/1024/1024).toFixed(2) : "-"} MB</div>
                </div>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20">
                <h2 className="text-xl font-semibold text-gray-800">Collections Detail</h2>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50/80 to-blue-50/80 border-b border-gray-200">
                      <th className="p-3 text-left text-sm font-semibold text-gray-700">Collection</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-700">Count</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-700">Size (MB)</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-700">Storage (MB)</th>
                      <th className="p-3 text-left text-sm font-semibold text-gray-700">Total Index (MB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((c, i) => {
                      const s = collStats[c];
                      return (
                        <tr key={c} className={`border-b ${i % 2 === 0 ? 'bg-white/50' : 'bg-gray-50/30'}`}>
                          <td className="p-3 font-medium text-gray-800">{c}</td>
                          <td className="p-3 text-gray-700">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-32 bg-gray-200 rounded" title={`${s?.count ?? '-'}`}>
                                {(() => {
                                  const pct = Math.min(100, Math.round(((s?.count ?? 0)/maxCount)*100));
                                  const warn = pct >= 80;
                                  return <div className={`h-2 ${warn ? 'bg-red-500' : 'bg-blue-500'} rounded`} style={{ width: `${pct}%` }} />;
                                })()}
                              </div>
                              <span className="text-xs">{s?.count ?? '-'}</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-700">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-32 bg-gray-200 rounded" title={`${s?.size ? (s.size/1024/1024).toFixed(2) : '-' } MB`}>
                                {(() => {
                                  const pct = Math.min(100, Math.round(((s?.size ?? 0)/maxSize)*100));
                                  const warn = pct >= 80;
                                  return <div className={`h-2 ${warn ? 'bg-red-500' : 'bg-purple-500'} rounded`} style={{ width: `${pct}%` }} />;
                                })()}
                              </div>
                              <span className="text-xs">{s?.size ? (s.size/1024/1024).toFixed(2) : '-'}</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-700">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-32 bg-gray-200 rounded" title={`${s?.storageSize ? (s.storageSize/1024/1024).toFixed(2) : '-' } MB`}>
                                {(() => {
                                  const pct = Math.min(100, Math.round(((s?.storageSize ?? 0)/maxStorage)*100));
                                  const warn = pct >= 80;
                                  return <div className={`h-2 ${warn ? 'bg-red-500' : 'bg-emerald-500'} rounded`} style={{ width: `${pct}%` }} />;
                                })()}
                              </div>
                              <span className="text-xs">{s?.storageSize ? (s.storageSize/1024/1024).toFixed(2) : '-'}</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-700">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-32 bg-gray-200 rounded" title={`${s?.totalIndexSize ? (s.totalIndexSize/1024/1024).toFixed(2) : '-' } MB`}>
                                {(() => {
                                  const pct = Math.min(100, Math.round(((s?.totalIndexSize ?? 0)/maxIndexSize)*100));
                                  const warn = pct >= 80;
                                  return <div className={`h-2 ${warn ? 'bg-red-500' : 'bg-orange-500'} rounded`} style={{ width: `${pct}%` }} />;
                                })()}
                              </div>
                              <span className="text-xs">{s?.totalIndexSize ? (s.totalIndexSize/1024/1024).toFixed(2) : '-'}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Field Stats Panel */}
            <div className="mt-6 bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Field Stats & Cardinality</h3>
                  <p className="text-sm text-gray-600">Enter a field to view top values and numeric stats</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input className="w-64" placeholder="field e.g. status or price" value={statsField} onChange={(e) => setStatsField(e.target.value)} />
                  <Button onClick={analyzeField} disabled={statsLoading || !statsField.trim()}>Analyze</Button>
                </div>
              </div>
              {statsData && (
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/60 p-4">
                    <div className="text-sm font-semibold mb-2">Top values</div>
                    <div className="space-y-2">
                      {(statsData.top || []).map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <code className="truncate max-w-[60%]">{JSON.stringify(t._id)}</code>
                          <span className="text-gray-700">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/60 p-4">
                    <div className="text-sm font-semibold mb-2">Numeric</div>
                    {statsData.numeric ? (
                      <ul className="text-sm text-gray-700 space-y-1">
                        <li>min: {statsData.numeric.min}</li>
                        <li>max: {statsData.numeric.max}</li>
                        <li>avg: {Number(statsData.numeric.avg).toFixed(2)}</li>
                        <li>count: {statsData.numeric.count}</li>
                      </ul>
                    ) : (
                      <div className="text-sm text-gray-500">No numeric stats</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
        </Tabs>

        </div>
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

        {/* View JSON Dialog */}
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>View Document</DialogTitle>
            </DialogHeader>
            <Textarea readOnly className="h-96 font-mono text-xs" value={viewJson} />
            <DialogFooter>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(viewJson); toast.success("Copied JSON"); }}>Copy JSON</Button>
              <Button onClick={() => setViewOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stats Dialogs */}
        <Dialog open={dbStatsOpen} onOpenChange={setDbStatsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Database Statistics {db ? `- ${db}` : ""}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto bg-gray-50 rounded-lg border p-3">
              <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap">{dbStatsData ? JSON.stringify(dbStatsData, null, 2) : ""}</pre>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDbStatsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={collStatsOpen} onOpenChange={setCollStatsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Collection Statistics {collection ? `- ${collection}` : ""}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto bg-gray-50 rounded-lg border p-3">
              <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap">{collStatsData ? JSON.stringify(collStatsData, null, 2) : ""}</pre>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCollStatsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
