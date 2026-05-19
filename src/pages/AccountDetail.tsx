import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccountHolds, useAccounts, useCategories, usePayPeriods, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { money, fmtDate, accountLabel } from "@/lib/format";
import { ArrowLeft, Pencil, Trash2, StickyNote } from "lucide-react";
import { MovementDetailsDialog, type MovementRef } from "@/components/MovementDetailsDialog";
import { txLabel, hasNotes } from "@/lib/txNotes";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";

type Movement = {
  id: string; kind: "tx" | "transfer"; date: string; created_at: string;
  label: string; type: string; categoryId: string | null; payPeriodId: string | null;
  signed: number; balanceAfter: number; hasNote: boolean; raw: any;
};

export default function AccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: transfers = [] } = useTransfers();
  const { data: cats = [] } = useCategories();
  const { data: periods = [] } = usePayPeriods();
  const { data: holds = [] } = useAccountHolds();
  const qc2 = qc;
  const accountHolds = holds.filter(h => h.account_id === accountId);
  const activeHolds = accountHolds.filter(h => h.status === "active");
  const activeHoldsTotal = activeHolds.reduce((s, h) => s + Number(h.amount), 0);

  const account = accounts.find(a => a.id === accountId);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState("all");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", bank_name: "", account_type: "" });

  useEffect(() => {
    if (account) setForm({ name: account.name, bank_name: account.bank_name ?? "", account_type: account.account_type ?? "" });
  }, [account?.id]);

  const accName = (id: string) => { const a = accounts.find(x => x.id === id); return a ? accountLabel(a) : "—"; };
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? "Uncategorized";

  const allMovements: Movement[] = useMemo(() => {
    if (!account) return [];
    const aTxs = txs.filter(t => t.account_id === account.id).map(t => {
      const isIn = ["income", "deposit"].includes(t.transaction_type);
      return {
        id: t.id, kind: "tx" as const, date: t.date, created_at: (t as any).created_at ?? t.date,
        label: t.notes || catName(t.category_id), type: t.transaction_type,
        categoryId: t.category_id, payPeriodId: t.pay_period_id,
        signed: isIn ? Number(t.amount) : -Number(t.amount), balanceAfter: 0,
      };
    });
    const aTr = transfers.filter(t => t.from_account_id === account.id || t.to_account_id === account.id).map(t => {
      const isIn = t.to_account_id === account.id;
      return {
        id: t.id, kind: "transfer" as const, date: t.date, created_at: (t as any).created_at ?? t.date,
        label: isIn ? `Transfer from ${accName(t.from_account_id)}` : `Transfer to ${accName(t.to_account_id)}`,
        type: "transfer", categoryId: null, payPeriodId: t.pay_period_id,
        signed: isIn ? Number(t.amount) : -Number(t.amount), balanceAfter: 0,
      };
    });
    const all = [...aTxs, ...aTr].sort((a, b) =>
      a.date === b.date ? (a.created_at < b.created_at ? -1 : 1) : (a.date < b.date ? -1 : 1)
    );
    let running = Number(account.starting_balance);
    for (const m of all) { running += m.signed; m.balanceAfter = running; }
    return all.reverse();
  }, [account, txs, transfers, cats, accounts]);

  const filtered = useMemo(() => allMovements.filter(m => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    if (period !== "all" && m.payPeriodId !== period) return false;
    if (category !== "all" && m.categoryId !== category) return false;
    if (type !== "all" && m.type !== type) return false;
    return true;
  }), [allMovements, from, to, period, category, type]);

  const reset = () => { setFrom(""); setTo(""); setPeriod("all"); setCategory("all"); setType("all"); };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    const { error } = await supabase.from("accounts").update({
      name: form.name, bank_name: form.bank_name || null, account_type: form.account_type || null,
    }).eq("id", account.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("Account updated");
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const delMovement = async (kind: string, id: string) => {
    const table = kind === "tx" ? "transactions" : "transfers";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success("Deleted");
    qc.invalidateQueries();
  };

  if (!account) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        <p className="text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  const change = Number(account.current_balance) - Number(account.starting_balance);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4 mr-1" />Dashboard</Button>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1" />Edit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
            <form onSubmit={saveEdit} className="space-y-3">
              <div><Label>Account Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Bank</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
                <div><Label>Type</Label><Input value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} /></div>
              </div>
              <DialogFooter><Button type="submit">Save</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <div className="p-6 md:p-8 text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
          <div className="text-xs opacity-80">{account.account_type || "Account"}</div>
          <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">{accountLabel(account)}</h1>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white/15 p-3"><div className="text-[11px] opacity-80">Current balance</div><div className="text-xl font-bold tabular-nums">{money(account.current_balance)}</div></div>
            <div className="rounded-xl bg-white/15 p-3"><div className="text-[11px] opacity-80">Active holds</div><div className="text-xl font-bold tabular-nums">{money(activeHoldsTotal)}</div></div>
            <div className="rounded-xl bg-white/15 p-3"><div className="text-[11px] opacity-80">Available</div><div className="text-xl font-bold tabular-nums">{money(Number(account.current_balance) - activeHoldsTotal)}</div></div>
            <div className="rounded-xl bg-white/15 p-3"><div className="text-[11px] opacity-80">Starting balance</div><div className="text-xl font-bold tabular-nums">{money(account.starting_balance)}</div></div>
          </div>
        </div>
      </Card>

      {activeHolds.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Active Holds</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/holds">Manage</Link></Button>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {activeHolds.map(h => (
                <div key={h.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{h.hold_name}</div>
                    {h.notes && <div className="text-xs text-muted-foreground truncate">{h.notes}</div>}
                  </div>
                  <div className="font-semibold tabular-nums shrink-0">{money(h.amount)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="px-4 sm:px-6 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <div className="min-w-0"><Label>From</Label><Input type="date" className="max-w-full" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="min-w-0"><Label>To</Label><Input type="date" className="max-w-full" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="min-w-0"><Label>Pay Period</Label>
            <Select value={period} onValueChange={setPeriod}><SelectTrigger className="max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="min-w-0"><Label>Category</Label>
            <Select value={category} onValueChange={setCategory}><SelectTrigger className="max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="min-w-0"><Label>Type</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger className="max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="withdrawal">Withdrawal</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4"><Button variant="outline" size="sm" onClick={reset}>Reset filters</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{filtered.length} {filtered.length === 1 ? "movement" : "movements"}</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">No movements match your filters.</p>}
          <div className="divide-y">
            {filtered.map(m => (
              <div key={m.kind + m.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{m.label}<span className="text-xs uppercase ml-2 text-muted-foreground">{m.type}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{fmtDate(m.date)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-semibold tabular-nums ${m.kind === "transfer" ? "text-transfer" : m.signed >= 0 ? "text-income" : "text-expense"}`}>
                    {m.signed >= 0 ? "+" : "-"}{money(Math.abs(m.signed))}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">bal {money(m.balanceAfter)}</div>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => delMovement(m.kind, m.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
