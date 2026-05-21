import { useMemo, useState } from "react";
import { RefreshCw, ChevronDown, Trash2, ScrollText } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { format } from "date-fns";
import { useAppLogs, useBulkDeleteAppLogs, type AppLog } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_COLORS: Record<string, string> = {
  auth:      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ai:        "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  order:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  cart:      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  scrape:    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  admin:     "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  whatsapp:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  failed:  "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  info:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function LogDetailsDialog({ log, onClose }: { log: AppLog | null; onClose: () => void }) {
  if (!log) return null;
  return (
    <Dialog open={!!log} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-mono">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${CATEGORY_COLORS[log.category] ?? "bg-muted text-muted-foreground"}`}>
              {log.category}
            </span>
            <span>{log.operation}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
              <p className="font-mono">{format(new Date(log.createdAt), "dd MMM yyyy HH:mm:ss")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[log.status] ?? ""}`}>
                {log.status}
              </span>
            </div>
            {log.userEmail && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">User</p>
                <p className="truncate">{log.userEmail}</p>
              </div>
            )}
            {log.durationMs != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Duration</p>
                <p>{log.durationMs} ms</p>
              </div>
            )}
          </div>
          {log.errorMessage && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Error</p>
              <p className="text-red-600 dark:text-red-400 font-mono text-xs bg-red-50 dark:bg-red-950/30 rounded p-2 whitespace-pre-wrap break-all">{log.errorMessage}</p>
            </div>
          )}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Metadata</p>
              <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminLogs() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(sevenDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AppLog | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkDel = useBulkDeleteAppLogs();

  const { data: logs = [], isLoading, refetch, isFetching } = useAppLogs(dateFrom, dateTo);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (category !== "all" && log.category !== category) return false;
      if (status !== "all" && log.status !== status) return false;
      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase();
        if (!(log.userEmail ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [logs, category, status, userSearch]);

  const clearFilters = () => {
    setCategory("all");
    setStatus("all");
    setUserSearch("");
    setDateFrom(sevenDaysAgo);
    setDateTo(today);
  };

  const allChecked = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach((l) => next.delete(l.id));
      else filtered.forEach((l) => next.add(l.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const bulkRemove = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} log entr${ids.length === 1 ? "y" : "ies"}?`)) return;
    bulkDel.mutate(ids, {
      onSuccess: () => {
        toast.success(`Deleted ${ids.length}`);
        setSelected(new Set());
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Logs"
        eyebrowIcon={ScrollText}
        title="Operation Logs"
        subtitle="Track all app operations, AI calls, orders, auth events, and errors"
        gradient="indigo-violet-purple"
        actions={
          <>
            {selected.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={bulkRemove}
                disabled={bulkDel.isPending}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />


      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="order">Order</SelectItem>
                <SelectItem value="cart">Cart</SelectItem>
                <SelectItem value="scrape">Scrape</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">User email</label>
            <Input placeholder="Filter by user email..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="text-sm" />
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{filtered.length}</span> of <span className="font-semibold text-foreground">{logs.length}</span> logs
        {logs.length === 1000 && <span className="text-amber-500 ml-1">(limit reached — narrow date range)</span>}
      </p>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
              </TableHead>
              <TableHead className="text-xs w-44">Timestamp</TableHead>
              <TableHead className="text-xs w-28">Category</TableHead>
              <TableHead className="text-xs">Operation</TableHead>
              <TableHead className="text-xs w-24">Status</TableHead>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs w-20">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-muted-foreground text-sm">
                  No logs found for the selected filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(log.id)}
                      onCheckedChange={() => toggleOne(log.id)}
                      aria-label="Select row"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.createdAt), "dd MMM yy HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${CATEGORY_COLORS[log.category] ?? "bg-muted text-muted-foreground"}`}>
                      {log.category}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.operation}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[log.status] ?? ""}`}>
                      {log.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                    {log.userEmail ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => setSelectedLog(log)}
                    >
                      View <ChevronDown className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LogDetailsDialog log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
