import { useMemo, useState } from "react";
import { useAccounts, useActivePayPeriod, useBudgetItems, useTransactions } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { money, fmtDate } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, Wallet } from "lucide-react";

const accLabel = (a: { bank_name: string | null; name: string }) => a.bank_name ? `${a.bank_name} - ${a.name}` : a.name;

export default function Budget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const active = useActivePayPeriod();
  const { data: accounts = [] } = useAccounts();
  const { data: items = [] } = useBudgetItems();
  const { data: txs = [] } = useTransactions();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const periodItems = useMemo(() => active ? items.filter(i => i.pay_period_id === active.id) : [], [items, active]);

  const spentByItem = useMemo(() => {
    const map = new Map<string, number>();
    txs.forEach(t => {
      const bid = (t as any).budget_item_id as string | null | undefined;
      if (bid && t.transaction_type === "expense") {
        map.set(bid, (map.get(bid) || 0) + Number(t.amount));
      }
    });
    return map;
  }, [txs]);

  const totalBudgeted = periodItems.reduce((s, i) => s + Number(i.budget_amount), 0);
  const totalSpent = periodItems.reduce((s, i) => s + (spentByItem.get(i.id) || 0), 0);
  const payAmount = Number(active?.net_pay_amount || 0);
  const remainingUnassigned = payAmount - totalBudgeted;
  const overBudget = totalBudgeted > payAmount && payAmount > 0;

  const depositAccount = accounts.find(a => a.id === active?.paycheck_account_id);

  const reset = () => { setName(""); setAccountId(""); setAmount(""); setNotes(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !active) return toast.error("No active pay period");
    if (!name || !accountId || !amount) return toast.error("Name, account, amount required");
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be > 0");
    const { error } = await (supabase as any).from("budget_items").insert({
      user_id: user.id, pay_period_id: active.id, account_id: accountId,
      name, budget_amount: amt, notes: notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Budget item added");
    qc.invalidateQueries({ queryKey: ["budget_items"] });
    reset(); setOpen(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this budget item?")) return;
    const { error } = await (supabase as any).from("budget_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["budget_items"] });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Budget</h1>
          <p className="text-muted-foreground mt-1">Plan how the active pay period money is spent.</p>
        </div>
        {active && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Item</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Budget Item</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Budget Item Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Groceries" /></div>
                <div>
                  <Label>Account *</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Budget Amount *</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
                <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
                  <Button type="submit">Add</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!active ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No active pay period. Set one in Pay Periods to start budgeting.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" />Active Pay Period</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
              <Row label="From Date" value={fmtDate(active.start_date)} />
              <Row label="Until Date" value={fmtDate(active.end_date)} />
              <Row label="Income Source" value={active.income_source || "—"} />
              <Row label="Deposit Account" value={depositAccount ? accLabel(depositAccount) : "—"} />
              <Row label="Pay Amount" value={active.net_pay_amount != null ? money(active.net_pay_amount) : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Budget Summary</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
              <Row label="Pay Amount" value={money(payAmount)} />
              <Row label="Total Budgeted" value={money(totalBudgeted)} />
              <Row label="Total Spent From Budget" value={money(totalSpent)} />
              <Row label="Remaining Unassigned" value={money(remainingUnassigned)} className={remainingUnassigned < 0 ? "text-destructive" : ""} />
              {overBudget && (
                <div className="sm:col-span-2 flex items-center gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs">
                  <AlertTriangle className="h-4 w-4" />Total Budgeted exceeds Pay Amount.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Budget Items</h2>
            {periodItems.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No budget items yet.</CardContent></Card>
            ) : periodItems.map(i => {
              const acc = accounts.find(a => a.id === i.account_id);
              const spent = spentByItem.get(i.id) || 0;
              const remaining = Number(i.budget_amount) - spent;
              const pct = i.budget_amount > 0 ? Math.min(100, (spent / Number(i.budget_amount)) * 100) : 0;
              return (
                <Card key={i.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{i.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{acc ? accLabel(acc) : "—"}</div>
                        {i.notes && <div className="text-xs text-muted-foreground mt-1">{i.notes}</div>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <Cell label="Budget" value={money(i.budget_amount)} />
                      <Cell label="Spent" value={money(spent)} />
                      <Cell label="Remaining" value={money(remaining)} cls={remaining < 0 ? "text-destructive" : "text-income"} />
                    </div>
                    <div className="h-1.5 rounded bg-accent overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const Row = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className="flex items-center justify-between rounded-md bg-accent/40 px-3 py-2">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-semibold tabular-nums ${className || ""}`}>{value}</span>
  </div>
);

const Cell = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
  <div className="rounded-md bg-accent/40 px-2 py-1.5 text-center">
    <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    <div className={`font-semibold tabular-nums ${cls || ""}`}>{value}</div>
  </div>
);
