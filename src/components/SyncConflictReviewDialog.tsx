import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/networkSync";
import {
  getSyncAuditRecords,
  subscribeSyncAudit,
  updateAuditByLocalId,
  type SyncAuditRecord,
} from "@/lib/syncAudit";
import {
  getPendingMovements,
  removePendingMovement,
  subscribeOfflineQueue,
} from "@/lib/offlineQueue";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmtAmount = (v: any) => {
  const n = Number(v);
  if (!isFinite(n)) return String(v ?? "—");
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const fmtDate = (v: any) => {
  if (!v) return "—";
  return String(v).slice(0, 10);
};

function pickFields(kind: "transaction" | "transfer", row: Record<string, any> | null | undefined) {
  if (!row) return null;
  if (kind === "transaction") {
    return {
      date: fmtDate(row.date),
      account_id: row.account_id ?? null,
      transaction_type: row.transaction_type ?? "—",
      amount: fmtAmount(row.amount),
      budget_item_id: row.budget_item_id ?? null,
      notes: row.notes ?? "—",
    };
  }
  return {
    date: fmtDate(row.date),
    from_account_id: row.from_account_id ?? null,
    to_account_id: row.to_account_id ?? null,
    amount: fmtAmount(row.amount),
    notes: row.notes ?? "—",
  };
}

export function SyncConflictReviewDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [audits, setAudits] = useState<SyncAuditRecord[]>(() => getSyncAuditRecords());
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const refresh = () => setAudits(getSyncAuditRecords());
    const u1 = subscribeSyncAudit(refresh);
    const u2 = subscribeOfflineQueue(refresh);
    refresh();
    return () => { u1(); u2(); };
  }, []);

  const unresolved = useMemo(
    () => audits.filter(a => a.status === "conflict" || a.status === "failed"),
    [audits]
  );

  useEffect(() => {
    if (selectedIdx >= unresolved.length) setSelectedIdx(0);
  }, [unresolved.length, selectedIdx]);

  const current = unresolved[selectedIdx];

  const { data: accounts } = useQuery({
    queryKey: ["accounts-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name");
      return data ?? [];
    },
    enabled: open,
  });
  const { data: budgetItems } = useQuery({
    queryKey: ["budget-items-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("budget_items").select("id, name");
      return data ?? [];
    },
    enabled: open,
  });

  const accountName = (id: string | null) => {
    if (!id) return "—";
    return accounts?.find((a: any) => a.id === id)?.name ?? id.slice(0, 8);
  };
  const budgetName = (id: string | null) => {
    if (!id) return "—";
    return budgetItems?.find((b: any) => b.id === id)?.name ?? id.slice(0, 8);
  };

  const renderFields = (kind: "transaction" | "transfer", row: Record<string, any> | null | undefined) => {
    const f = pickFields(kind, row);
    if (!f) return <div className="text-muted-foreground text-sm">(none)</div>;
    if (kind === "transaction") {
      return (
        <dl className="text-xs space-y-1">
          <Row k="Date" v={f.date} />
          <Row k="Account" v={accountName(f.account_id as string | null)} />
          <Row k="Type" v={f.transaction_type as string} />
          <Row k="Amount" v={f.amount as string} />
          <Row k="Budget item" v={budgetName(f.budget_item_id as string | null)} />
          <Row k="Notes" v={f.notes as string} />
        </dl>
      );
    }
    return (
      <dl className="text-xs space-y-1">
        <Row k="Date" v={f.date} />
        <Row k="From" v={accountName(f.from_account_id as string | null)} />
        <Row k="To" v={accountName(f.to_account_id as string | null)} />
        <Row k="Amount" v={f.amount as string} />
        <Row k="Notes" v={f.notes as string} />
      </dl>
    );
  };

  const handleKeepServer = async () => {
    if (!current) return;
    // Safety: if no server row exists, "Keep Server" effectively discards the local item.
    const hasServerRow = !!(current.server_payload || current.server_id);
    if (!hasServerRow) {
      const ok = typeof window !== "undefined"
        ? window.confirm("No server version exists for this item. Continuing will discard your local entry. Continue?")
        : true;
      if (!ok) return;
    }
    setWorking(true);
    try {
      // Remove pending item if still present
      const pending = getPendingMovements().find(p => p.local_id === current.local_id);
      if (pending) removePendingMovement(current.local_id);
      updateAuditByLocalId(current.local_id, {
        status: "resolved_server",
        resolved_at: new Date().toISOString(),
        error: null,
      });
      toast.success(hasServerRow ? "Kept server version" : "Local entry discarded");
      qc.invalidateQueries();
    } finally {
      setWorking(false);
    }
  };

  const handleKeepLocal = async () => {
    if (!current) return;
    if (!current.server_id) {
      toast.message("Manual review needed. Local overwrite is not available for this item yet.");
      return;
    }
    setWorking(true);
    try {
      const table = current.kind === "transaction" ? "transactions" : "transfers";
      const payload = { ...current.local_payload };
      // Don't try to overwrite immutable/auto fields
      delete (payload as any).id;
      delete (payload as any).created_at;
      delete (payload as any).updated_at;
      const q = supabase.from(table as any).update(payload as any).eq("id", current.server_id);
      const res: any = await withTimeout(q as unknown as Promise<any>, 8000, `update-${table}`);
      if (res?.error) {
        toast.error(res.error.message || "Failed to update server row");
        return;
      }
      const pending = getPendingMovements().find(p => p.local_id === current.local_id);
      if (pending) removePendingMovement(current.local_id);
      updateAuditByLocalId(current.local_id, {
        status: "resolved_local",
        resolved_at: new Date().toISOString(),
        error: null,
      });
      toast.success("Kept local version");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["budget_items"] });
      qc.invalidateQueries({ queryKey: ["pay_periods"] });
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update server row");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Sync Issue</DialogTitle>
          <DialogDescription>
            Compare your local offline version with the server version.
          </DialogDescription>
        </DialogHeader>

        {!current ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            No sync conflicts to review.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{current.kind}</Badge>
              <Badge variant={current.status === "conflict" ? "destructive" : "secondary"}>
                {current.status}
              </Badge>
              <span className="text-muted-foreground truncate">
                sync id: {current.client_sync_id.slice(0, 12)}…
              </span>
              {unresolved.length > 1 && (
                <span className="ml-auto text-muted-foreground">
                  {selectedIdx + 1} / {unresolved.length}
                </span>
              )}
            </div>

            {current.error && (
              <div className="text-xs rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive">
                {current.error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <section className="rounded border p-3">
                <h4 className="text-sm font-semibold mb-2">Local version</h4>
                {renderFields(current.kind, current.local_payload)}
              </section>
              <section className="rounded border p-3">
                <h4 className="text-sm font-semibold mb-2">Server version</h4>
                {current.server_payload
                  ? renderFields(current.kind, current.server_payload)
                  : <div className="text-xs text-muted-foreground">No server row recorded.</div>}
              </section>
            </div>

            {unresolved.length > 1 && (
              <div className="flex gap-2 text-xs">
                <Button size="sm" variant="ghost" disabled={selectedIdx === 0}
                  onClick={() => setSelectedIdx(i => Math.max(0, i - 1))}>
                  Previous
                </Button>
                <Button size="sm" variant="ghost" disabled={selectedIdx >= unresolved.length - 1}
                  onClick={() => setSelectedIdx(i => Math.min(unresolved.length - 1, i + 1))}>
                  Next
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>
            Cancel
          </Button>
          {current && (
            <>
              <Button
                variant="secondary"
                onClick={handleKeepLocal}
                disabled={working || !current.server_id}
                title={!current.server_id ? "Manual review needed" : undefined}
              >
                Keep Local
              </Button>
              <Button onClick={handleKeepServer} disabled={working}>
                Keep Server
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right truncate max-w-[60%]">{v}</dd>
    </div>
  );
}

export default SyncConflictReviewDialog;
