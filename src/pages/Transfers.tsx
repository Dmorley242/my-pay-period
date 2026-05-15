import { useEffect, useState } from "react";
import { useAccounts, usePayPeriods, useActivePayPeriod, useTransfers } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { money, fmtDate, accountLabel } from "@/lib/format";
import { ArrowRight, Trash2 } from "lucide-react";

export default function Transfers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: periods = [] } = usePayPeriods();
  const { data: transfers = [] } = useTransfers();
  const active = useActivePayPeriod();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [periodId, setPeriodId] = useState<string>(active?.id || "none");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (active?.id && periodId === "none") setPeriodId(active.id);
  }, [active?.id, periodId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !from || !to || from === to) return toast.error("Pick two different accounts");
    const parsedAmount = parseFloat(amount);
    if (!amount) return toast.error("Amount required");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter an amount greater than 0");
    const { error } = await supabase.from("transfers").insert({
      user_id: user.id, date, from_account_id: from, to_account_id: to,
      pay_period_id: periodId === "none" ? null : periodId,
      amount: parsedAmount, notes: notes || null,
    });
    if (error) return toast.error(friendlyError(error));
    toast.success("Transfer saved");
    setAmount(""); setNotes("");
    qc.invalidateQueries();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("transfers").delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries();
  };

  const accName = (id: string) => { const a = accounts.find(x => x.id === id); return a ? accountLabel(a) : "—"; };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Transfers</h1><p className="text-muted-foreground mt-1">Move money between your accounts.</p></div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New Transfer</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><Label>From *</Label>
                <Select value={from} onValueChange={setFrom}>
                  <SelectTrigger><SelectValue placeholder="Source account" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)} — {money(a.current_balance)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>To *</Label>
                <Select value={to} onValueChange={setTo}>
                  <SelectTrigger><SelectValue placeholder="Destination account" /></SelectTrigger>
                  <SelectContent>{accounts.filter(a => a.id !== from).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Amount *</Label><Input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
              <div><Label>Pay Period</Label>
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div>
              <Button type="submit" className="w-full">Save Transfer</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Transfers</CardTitle></CardHeader>
          <CardContent>
            {transfers.length === 0 && <p className="text-sm text-muted-foreground">No transfers yet.</p>}
            <div className="divide-y">
              {transfers.slice(0, 15).map(t => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium truncate">
                      <span className="truncate">{accName(t.from_account_id)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{accName(t.to_account_id)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(t.date)}{t.notes ? ` · ${t.notes}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-transfer tabular-nums">{money(t.amount)}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => del(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
