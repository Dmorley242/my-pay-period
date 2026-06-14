import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { money, accountLabel } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { addPendingMovement } from "@/lib/offlineQueue";
import { withTimeout, isLikelyNetworkOrTimeoutError } from "@/lib/networkSync";

type Row = {
  id: string;
  from: string;
  to: string;
  amount: string;
  label: string;
};

const newRow = (): Row => ({
  id: (typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as any).randomUUID() : `r_${Date.now()}_${Math.random()}`),
  from: "", to: "", amount: "", label: "",
});

const cents = (s: string) => {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

const composeNote = (batchName: string, batchNote: string, rowLabel: string): string | null => {
  const rl = rowLabel.trim();
  const bn = batchName.trim();
  const bnote = batchNote.trim();
  if (rl && bn) return `${bn} — ${rl}`;
  if (rl) return rl;
  if (bnote && bn) return `${bn} — ${bnote}`;
  if (bnote) return bnote;
  if (bn) return bn;
  return null;
};

export default function BatchMovement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: accounts = [] } = useAccounts();

  const [batchName, setBatchName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedTotal, setExpectedTotal] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [saving, setSaving] = useState(false);

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows(rs => (rs.length <= 1 ? rs : rs.filter(r => r.id !== id)));
  const addRow = () => setRows(rs => [...rs, newRow()]);

  const rowsTotalCents = useMemo(() => rows.reduce((s, r) => s + cents(r.amount), 0), [rows]);
  const expectedCents = useMemo(() => (expectedTotal ? cents(expectedTotal) : 0), [expectedTotal]);
  const differenceCents = expectedCents - rowsTotalCents;

  const rowValidity = (r: Row): string | null => {
    if (!r.from) return "From account required";
    if (!r.to) return "To account required";
    if (r.from === r.to) return "From and To must differ";
    if (cents(r.amount) <= 0) return "Amount must be greater than 0";
    return null;
  };

  const allRowsValid = rows.every(r => rowValidity(r) === null);
  const hasAtLeastOne = rows.length >= 1 && allRowsValid;
  const totalMatches = !expectedTotal || differenceCents === 0;
  const canSave = !saving && hasAtLeastOne && totalMatches && !!user;

  const save = async () => {
    if (!user) return;
    if (!hasAtLeastOne) { toast.error("Fix row errors before saving"); return; }
    if (!totalMatches) { toast.error("Rows must match expected total"); return; }
    setSaving(true);

    const payloads = rows.map(r => ({
      user_id: user.id,
      date,
      from_account_id: r.from,
      to_account_id: r.to,
      amount: cents(r.amount) / 100,
      pay_period_id: null as string | null,
      notes: composeNote(batchName, batchNote, r.label),
    }));

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      for (const p of payloads) addPendingMovement("transfer", p);
      toast.success("Batch movements saved offline. They will sync when you're back online.");
      qc.invalidateQueries();
      nav("/");
      return;
    }

    let insertedCount = 0;
    let queuedCount = 0;
    let stoppedError: string | null = null;

    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i];
      try {
        const insertP = supabase.from("transfers").insert(p as any).select().single();
        const res: any = await withTimeout(insertP as unknown as Promise<any>, 8000, "insert-transfer");
        if (res?.error) {
          if (isLikelyNetworkOrTimeoutError(res.error)) {
            // queue this and remaining
            for (let j = i; j < payloads.length; j++) { addPendingMovement("transfer", payloads[j]); queuedCount++; }
            break;
          } else {
            stoppedError = friendlyError(res.error);
            break;
          }
        } else {
          insertedCount++;
        }
      } catch (e: any) {
        if (isLikelyNetworkOrTimeoutError(e)) {
          for (let j = i; j < payloads.length; j++) { addPendingMovement("transfer", payloads[j]); queuedCount++; }
          break;
        } else {
          stoppedError = e?.message || "Save failed";
          break;
        }
      }
    }

    setSaving(false);
    qc.invalidateQueries();

    if (stoppedError) {
      toast.error(stoppedError);
      return;
    }
    if (queuedCount > 0 && insertedCount > 0) {
      toast.success("Connection issue. Remaining batch movements saved offline for sync.");
    } else if (queuedCount > 0) {
      toast.success("Batch movements saved offline. They will sync when you're back online.");
    } else {
      toast.success(`Saved ${insertedCount} transfer${insertedCount === 1 ? "" : "s"}`);
    }
    nav("/");
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Batch Movement</h1>
        <p className="text-muted-foreground mt-1 text-sm">Enter multiple transfers in one session.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Batch Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Batch Name</Label>
            <Input value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="Payday Split" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Expected Total (optional)</Label>
              <MoneyInput value={expectedTotal} onChange={setExpectedTotal} />
            </div>
          </div>
          <div>
            <Label>Batch Note</Label>
            <Textarea value={batchNote} onChange={e => setBatchNote(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Transfer Rows</CardTitle>
          <Button size="sm" variant="outline" onClick={addRow}><Plus className="h-4 w-4 mr-1" />Add Row</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map((r, idx) => {
            const err = rowValidity(r);
            return (
              <div key={r.id} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Row {idx + 1}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(r.id)} disabled={rows.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>From *</Label>
                    <Select value={r.from} onValueChange={v => updateRow(r.id, { from: v })}>
                      <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)} — {money(a.current_balance)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To *</Label>
                    <Select value={r.to} onValueChange={v => updateRow(r.id, { to: v })}>
                      <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                      <SelectContent>
                        {accounts.filter(a => a.id !== r.from).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Amount *</Label>
                    <MoneyInput value={r.amount} onChange={v => updateRow(r.id, { amount: v })} />
                  </div>
                  <div>
                    <Label>Label / Note</Label>
                    <Input value={r.label} onChange={e => updateRow(r.id, { label: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
                {err && <p className="text-xs text-destructive">{err}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Summary</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Rows</span><span className="font-medium tabular-nums">{rows.length}</span></div>
          {expectedTotal && (
            <div className="flex justify-between"><span className="text-muted-foreground">Expected Total</span><span className="font-medium tabular-nums">{money(expectedCents / 100)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">Rows Total</span><span className="font-semibold tabular-nums">{money(rowsTotalCents / 100)}</span></div>
          {expectedTotal && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Difference</span>
              <span className={`font-semibold tabular-nums ${differenceCents === 0 ? "text-income-foreground" : "text-destructive"}`}>
                {money(differenceCents / 100)}
              </span>
            </div>
          )}
          {expectedTotal && differenceCents !== 0 && (
            <p className="text-xs text-destructive pt-1">Rows must match expected total before saving.</p>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-4 px-4 py-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => nav("/")}>Cancel</Button>
        <Button className="flex-1" disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : "Save Batch"}
        </Button>
      </div>
    </div>
  );
}
