import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  getPendingMovements,
  subscribeOfflineQueue,
  syncPendingMovements,
  type PendingMovement,
} from "@/lib/offlineQueue";
import { checkSupabaseConnection } from "@/lib/networkSync";
import { getSyncAuditRecords, subscribeSyncAudit } from "@/lib/syncAudit";
import { SyncConflictReviewDialog } from "@/components/SyncConflictReviewDialog";

function computeCounts(items: PendingMovement[]) {
  let pending = 0;
  let failed = 0;
  let syncing = 0;
  for (const item of items) {
    if (item.status === "pending") pending++;
    else if (item.status === "failed") failed++;
    else if (item.status === "syncing") syncing++;
  }
  return { pending, failed, syncing };
}

function statusText(items: PendingMovement[]) {
  const { pending, failed } = computeCounts(items);
  const pendingLabel = `${pending} pending offline movement${pending === 1 ? "" : "s"}`;
  const failedLabel = `${failed} failed offline movement${failed === 1 ? "" : "s"}`;

  if (pending > 0 && failed > 0) {
    return `${pendingLabel}, ${failedLabel}`;
  }
  if (failed > 0) {
    return failedLabel;
  }
  return pendingLabel;
}

export function PendingOfflineBar({ className = "" }: { className?: string }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<PendingMovement[]>(() => getPendingMovements());
  const [syncing, setSyncing] = useState(false);

  const counts = useMemo(() => computeCounts(items), [items]);

  useEffect(() => {
    const refresh = () => setItems(getPendingMovements());
    const unsub = subscribeOfflineQueue(refresh);
    const trySync = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (getPendingMovements().filter(i => i.status === "pending").length === 0) return;
      runSync();
    };
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") trySync();
    };
    window.addEventListener("online", trySync);
    window.addEventListener("focus", trySync);
    document.addEventListener("visibilitychange", onVisibility);
    // Initial check on mount
    trySync();
    return () => {
      unsub();
      window.removeEventListener("online", trySync);
      window.removeEventListener("focus", trySync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSync = async (opts: { manual?: boolean } = {}) => {
    if (syncing) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (getPendingMovements().filter(i => i.status === "pending").length === 0) return;
    setSyncing(true);
    const ok = await checkSupabaseConnection();
    if (!ok) {
      setSyncing(false);
      if (opts.manual) toast.message("Internet not stable yet. Try again shortly.");
      return;
    }
    const res = await syncPendingMovements();
    setSyncing(false);
    setItems(getPendingMovements());
    if (res.synced > 0) {
      toast.success(`Offline movements synced (${res.synced})`);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["budget_items"] });
      qc.invalidateQueries({ queryKey: ["pay_periods"] });
      qc.invalidateQueries();
    }
    if (res.skipped && res.skipped > 0) {
      toast.message(`${res.skipped} pending item(s) already existed online`);
    }
    if (res.failed > 0) {
      toast.error(`${res.failed} pending movement(s) failed to sync`);
    }
  };

  if (items.length === 0) return null;

  const canSync = counts.pending > 0;

  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        <CloudOff className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="truncate">{statusText(items)}</span>
      </div>
      <Button size="sm" variant="outline" onClick={() => runSync({ manual: true })} disabled={syncing || !canSync}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Sync Now"}
      </Button>
    </div>
  );
}

export default PendingOfflineBar;
