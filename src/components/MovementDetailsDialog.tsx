import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { money, fmtDate, accountLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { useAccounts, useCategories, usePayPeriods, type Transaction, type Transfer } from "@/hooks/useFinanceData";
import { parseTxNotes, buildTxNotes } from "@/lib/txNotes";

export type MovementRef =
  | { kind: "tx"; record: Transaction }
  | { kind: "transfer"; record: Transfer };

export function MovementDetailsDialog({
  open,
  onOpenChange,
  movement,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  movement: MovementRef | null;
}) {
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const { data: periods = [] } = usePayPeriods();

  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!movement) return;
    if (movement.kind === "tx") {
      setNotes(parseTxNotes(movement.record.notes).notes || "");
    } else {
      setNotes(movement.record.notes || "");
    }
  }, [movement?.kind, movement?.record?.id]);

  if (!movement) return null;

  const accName = (id: string) => {
    const a = accounts.find(x => x.id === id);
    return a ? accountLabel(a) : "—";
  };
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? null;
  const periodName = (id: string | null) => periods.find(p => p.id === id)?.name ?? null;

  const isTx = movement.kind === "tx";
  const rec: any = movement.record;
  const label = isTx
    ? (parseTxNotes(rec.notes).label || catName(rec.category_id) || rec.transaction_type)
    : `Transfer ${accName(rec.from_account_id)} → ${accName(rec.to_account_id)}`;

  const amount = Number(rec.amount);
  const type = isTx ? rec.transaction_type : "transfer";
  const isIn = isTx ? (type === "income" || type === "deposit") : false;
  const signClass = !isTx ? "text-transfer" : isIn ? "text-income" : "text-expense";

  const save = async () => {
    setSaving(true);
    try {
      if (isTx) {
        const parsed = parseTxNotes(rec.notes);
        const newNotes = buildTxNotes(parsed.label, notes.trim() || null);
        const { error } = await supabase.from("transactions").update({ notes: newNotes }).eq("id", rec.id);
        if (error) throw error;
      } else {
        const newNotes = notes.trim() || null;
        const { error } = await supabase.from("transfers").update({ notes: newNotes }).eq("id", rec.id);
        if (error) throw error;
      }
      toast.success("Notes saved");
      qc.invalidateQueries({ queryKey: [isTx ? "transactions" : "transfers"] });
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">{label}</DialogTitle>
          <DialogDescription>{isTx ? "Transaction details" : "Transfer details"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className={`text-2xl font-bold tabular-nums ${signClass}`}>
            {isTx ? (isIn ? "+" : "-") : ""}{money(amount)}
          </div>

          <DetailRow label="Type" value={<span className="capitalize">{type}</span>} />
          <DetailRow label="Date" value={fmtDate(rec.date)} />

          {isTx ? (
            <>
              <DetailRow label="Account" value={accName(rec.account_id)} />
              {catName(rec.category_id) && <DetailRow label="Category" value={catName(rec.category_id)!} />}
            </>
          ) : (
            <>
              <DetailRow label="From" value={accName(rec.from_account_id)} />
              <DetailRow label="To" value={accName(rec.to_account_id)} />
            </>
          )}

          {periodName(rec.pay_period_id) && (
            <DetailRow label="Pay Period" value={periodName(rec.pay_period_id)!} />
          )}

          <DetailRow label="ID" value={<span className="font-mono text-xs break-all">{rec.id}</span>} />

          <div className="pt-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="No notes added."
              rows={4}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Notes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right min-w-0 truncate">{value}</span>
    </div>
  );
}
