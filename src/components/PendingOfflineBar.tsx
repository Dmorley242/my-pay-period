import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  getPendingMovements,
  subscribeOfflineQueue,
  syncPendingMovements,
  type PendingMovement,
} from "@/lib/offlineQueue";

export function PendingOfflineBar({ className = "" }: { className?: string }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<PendingMovement[]>(() => getPendingMovements());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => setItems(getPendingMovements());
    const unsub = subscribeOfflineQueue(refresh);
    const onOnline = () => { runSync(); };
    window.addEventListener("online", onOnline);
    // Try once on mount in case we're already online with pending items
    if (navigator.onLine && getPendingMovements().length > 0) runSync();
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSync = async () => {
    if (syncing) return;
    if (getPendingMovements().length === 0) return;
    setSyncing(true);
    const res = await syncPendingMovements();
    setSyncing(false);
    setItems(getPendingMovements());
    if (res.synced > 0) {
      toast.success(`Offline movements synced (${res.synced})`);
      qc.invalidateQueries();
    } else if (res.failed > 0) {
      toast.error(`${res.failed} pending movement(s) failed to sync`);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        <CloudOff className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="truncate">
          {items.length} pending offline movement{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={runSync} disabled={syncing}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Sync Now"}
      </Button>
    </div>
  );
}

export default PendingOfflineBar;
