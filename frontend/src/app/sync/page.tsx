"use client";

import { useEffect, useRef, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function SyncPage() {
  const [sourceUri, setSourceUri] = useState("mongodb://localhost:27017");
  const [sourceDb, setSourceDb] = useState("");
  const [destUri, setDestUri] = useState("mongodb://localhost:27017");
  const [destDb, setDestDb] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Offline states
  const [expUri, setExpUri] = useState("mongodb://localhost:27017");
  const [expDb, setExpDb] = useState("");
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impDestUri, setImpDestUri] = useState("mongodb://localhost:27017");
  const [impDestDb, setImpDestDb] = useState("");
  const [expProgress, setExpProgress] = useState<number>(0);
  const [impProgress, setImpProgress] = useState<number>(0);
  const [tab, setTab] = useState<"online" | "offline">("online");
  const [logsOpen, setLogsOpen] = useState(false);

  async function start() {
    if (!sourceUri.trim() || !sourceDb.trim() || !destUri.trim() || !destDb.trim()) {
      toast.error("Vui lòng nhập đủ Source/Dest URI & DB");
      return;
    }
    try {
      setLogs([]);
      setStatus("starting");
      const res = await api.startSync({
        source_uri: sourceUri.trim(),
        source_db: sourceDb.trim(),
        dest_uri: destUri.trim(),
        dest_db: destDb.trim(),
      });
      setJobId(res.id);
      setStatus(res.status || "running");
      setProgress(0);
    } catch (e: any) {
      setStatus("error");
      toast.error(e.message || String(e));
    }
  }

  // Poll logs when jobId present
  useEffect(() => {
    if (!jobId) return;
    function stopTimer() {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    async function poll() {
      try {
        const r = await api.getSync(jobId!);
        setStatus(r.status);
        setLogs(r.logs || []);
        setProgress(r.progress ?? 0);
        if (r.status === "success") { stopTimer(); toast.success("Sync thành công"); }
        if (r.status === "error") { stopTimer(); toast.error(r.error || "Sync lỗi"); }
      } catch (e: any) {
        stopTimer();
        toast.error(e.message || String(e));
      }
    }
    timerRef.current = setInterval(poll, 1200);
    // fetch immediately
    void poll();
    return () => { stopTimer(); };
  }, [jobId]);

  async function cancel() {
    if (!jobId) return;
    try {
      await api.cancelSync(jobId);
      toast.message("Đã gửi yêu cầu huỷ");
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  async function retry() {
    setJobId(null);
    await start();
  }

  async function doOfflineExport() {
    if (!expUri.trim() || !expDb.trim()) { toast.error("Nhập URI và DB để export"); return; }
    try {
      setExpProgress(0);
      const form = new FormData();
      form.append("uri", expUri.trim());
      form.append("db", expDb.trim());
      const res = await fetch(`${API_BASE}/sync/offline/export`, { method: "POST", body: form });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const contentLength = Number(res.headers.get("content-length") || 0);
      const reader = res.body?.getReader();
      if (!reader) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        const disposition = res.headers.get("content-disposition") || "";
        const match = disposition.match(/filename=([^;]+)/i);
        const filename = match ? decodeURIComponent(match[1].replace(/"/g, "")) : `dump.zip`;
        a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        toast.success(`Đã tải ${filename}`);
        setExpProgress(100);
        return;
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (contentLength) setExpProgress(Math.round((received / contentLength) * 100));
          else setExpProgress((p) => Math.min(99, p + 1));
        }
      }
      const blob = new Blob(chunks, { type: "application/zip" });
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename=([^;]+)/i);
      const filename = match ? decodeURIComponent(match[1].replace(/"/g, "")) : `dump.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setExpProgress(100);
      toast.success(`Đã tải ${filename}`);
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  async function doOfflineImport() {
    if (!impFile || !impDestUri.trim() || !impDestDb.trim()) { toast.error("Chọn file ZIP và nhập Dest URI/DB"); return; }
    try {
      setImpProgress(0);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/sync/offline/import`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setImpProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        const form = new FormData();
        form.append("file", impFile);
        form.append("dest_uri", impDestUri.trim());
        form.append("dest_db", impDestDb.trim());
        xhr.send(form);
      });
      toast.success("Import ZIP thành công");
    } catch (e: any) {
      toast.error(e.message || String(e));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Hero */}
      <section className="relative bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-600/5 via-slate-500/5 to-slate-600/5" />
        <div className="relative mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-gray-900">Sync Center</h1>
              <p className="text-sm text-gray-600">Đồng bộ Online và quản lý Export/Import (Offline)</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-3 py-1 rounded-full shadow ${status === 'success' ? 'bg-emerald-100 text-emerald-700' : status === 'error' ? 'bg-red-100 text-red-700' : status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{status}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <main className="relative mx-auto max-w-6xl px-8 pb-16">
        <div className="mt-6 rounded-3xl bg-white/30 backdrop-blur-2xl ring-1 ring-white/40 shadow-2xl p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-3 mb-5">
              <TabsList className="grid w-full grid-cols-2 gap-2 p-1 bg-transparent">
                <TabsTrigger value="online" className="px-5 py-2 rounded-2xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:pan-gradient flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Online
                </TabsTrigger>
                <TabsTrigger value="offline" className="px-5 py-2 rounded-2xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:pan-gradient flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3" /></svg>
                  Offline
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="online">
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20">
                  <h2 className="text-lg font-semibold text-gray-800">Sync (Online)</h2>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Source
                    </h3>
                    <label className="text-xs text-gray-500">URI</label>
                    <Input className="h-11 rounded-xl" value={sourceUri} onChange={(e) => setSourceUri(e.target.value)} placeholder="mongodb://user:pass@host:port" />
                    <div className="h-3" />
                    <label className="text-xs text-gray-500">Database</label>
                    <Input className="h-11 rounded-xl" value={sourceDb} onChange={(e) => setSourceDb(e.target.value)} placeholder="source_db" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m4-4H8" /></svg>
                      Destination
                    </h3>
                    <label className="text-xs text-gray-500">URI</label>
                    <Input className="h-11 rounded-xl" value={destUri} onChange={(e) => setDestUri(e.target.value)} placeholder="mongodb://user:pass@host:port" />
                    <div className="h-3" />
                    <label className="text-xs text-gray-500">Database</label>
                    <Input className="h-11 rounded-xl" value={destDb} onChange={(e) => setDestDb(e.target.value)} placeholder="dest_db" />
                  </div>
                  <div className="md:col-span-2 space-y-4">
                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden relative">
                      <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all" style={{ width: `${progress}%` }} />
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-700">
                        {Math.max(0, Math.min(100, Math.round(progress)))}%
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      {status === 'error' && (
                        <Button onClick={retry} variant="outline" className="rounded-xl">Retry</Button>
                      )}
                      {status === 'running' && (
                        <Button onClick={cancel} variant="destructive" className="rounded-xl">Cancel</Button>
                      )}
                      <Button onClick={start} disabled={status === 'starting' || status === 'running'} className="h-11 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">
                        {status === 'running' ? 'Đang sync...' : 'Bắt đầu sync'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logs Dialog */}
              <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Logs</DialogTitle>
                  </DialogHeader>
                  <Textarea className="h-96 font-mono text-xs rounded-xl" readOnly value={(logs || []).join('\n')} />
                  <DialogFooter>
                    <Button onClick={() => setLogsOpen(false)} variant="outline">Close</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="offline">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Export */}
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20">
                    <h2 className="text-lg font-semibold text-gray-800">Offline Export (ZIP)</h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="text-xs text-gray-500">Source URI</label>
                      <Input className="h-11 rounded-xl" value={expUri} onChange={(e) => setExpUri(e.target.value)} placeholder="mongodb://user:pass@host:port" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Database</label>
                      <Input className="h-11 rounded-xl" value={expDb} onChange={(e) => setExpDb(e.target.value)} placeholder="db_name" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <Button onClick={doOfflineExport} className="h-11 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">Export ZIP</Button>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden relative">
                        <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all" style={{ width: `${expProgress}%` }} />
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-700">
                          {Math.max(0, Math.min(100, Math.round(expProgress)))}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Import */}
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-6 border-b border-white/20">
                    <h2 className="text-lg font-semibold text-gray-800">Offline Import (ZIP)</h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="text-xs text-gray-500">ZIP file</label>
                      <input className="h-11" type="file" accept=".zip" onChange={(e) => setImpFile(e.target.files?.[0] || null)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Destination URI</label>
                      <Input className="h-11 rounded-xl" value={impDestUri} onChange={(e) => setImpDestUri(e.target.value)} placeholder="mongodb://user:pass@host:port" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Destination DB</label>
                      <Input className="h-11 rounded-xl" value={impDestDb} onChange={(e) => setImpDestDb(e.target.value)} placeholder="db_name" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <Button onClick={doOfflineImport} className="h-11 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">Import ZIP</Button>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden relative">
                        <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all" style={{ width: `${impProgress}%` }} />
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-700">
                          {Math.max(0, Math.min(100, Math.round(impProgress)))}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
