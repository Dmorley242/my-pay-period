import { useMemo, useState } from "react";
import { useAccounts, useCategories, usePayPeriods, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, fmtDate } from "@/lib/format";
import { Trash2, ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";

type Row = { id: string; date: string; kind: "tx" | "transfer"; type: string; account: string; category: string; amount: number; notes: string; signed: number; };

export default function History() {
  const qc = useQueryClient();
  const { data: txs = [] } = useTransactions();
  const { data: transfers = [] } = useTransfers();
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const { data: periods = [] } = usePayPeriods();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState("all");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");

  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? "—";

  const rows: Row[] = useMemo(() => {
    const txRows: Row[] = txs.map(t => ({
      id: t.id, date: t.date, kind: "tx", type: t.transaction_type,
      account: accName(t.account_id), category: catName(t.category_id),
      amount: Number(t.amount), notes: t.notes ?? "",
      signed: ["income","deposit"].includes(t.transaction_type) ? Number(t.amount) : -Number(t.amount),
    }));
    const trRows: Row[] = transfers.map(t => ({
      id: t.id, date: t.date, kind: "transfer", type: "transfer",
      account: `${accName(t.from_account_id)} → ${accName(t.to_account_id)}`,
      category: "—", amount: Number(t.amount), notes: t.notes ?? "", signed: Number(t.amount),
    }));
    let all = [...txRows, ...trRows];
    if (from) all = all.filter(r => r.date >= from);
    if (to) all = all.filter(r => r.date <= to);
    if (period !== "all") {
      const ids = new Set([
        ...txs.filter(t => t.pay_period_id === period).map(t => t.id),
        ...transfers.filter(t => t.pay_period_id === period).map(t => t.id),
      ]);
      all = all.filter(r => ids.has(r.id));
    }
    if (account !== "all") {
      const txIds = new Set(txs.filter(t => t.account_id === account).map(t => t.id));
      const trIds = new Set(transfers.filter(t => t.from_account_id === account || t.to_account_id === account).map(t => t.id));
      all = all.filter(r => (r.kind === "tx" && txIds.has(r.id)) || (r.kind === "transfer" && trIds.has(r.id)));
    }
    if (category !== "all") {
      const ids = new Set(txs.filter(t => t.category_id === category).map(t => t.id));
      all = all.filter(r => r.kind === "tx" && ids.has(r.id));
    }
    if (type !== "all") all = all.filter(r => r.type === type);
    if (search) all = all.filter(r => r.notes.toLowerCase().includes(search.toLowerCase()));
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [txs, transfers, accounts, cats, from, to, period, account, category, type, search]);

  const del = async (kind: string, id: string) => {
    const table = kind === "tx" ? "transactions" : "transfers";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries();
  };

  const reset = () => { setFrom(""); setTo(""); setPeriod("all"); setAccount("all"); setCategory("all"); setType("all"); setSearch(""); };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Transaction History</h1><p className="text-muted-foreground mt-1">All transactions and transfers.</p></div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div><Label>Pay Period</Label>
            <Select value={period} onValueChange={setPeriod}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Account</Label>
            <Select value={account} onValueChange={setAccount}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Category</Label>
            <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem>{cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Type</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
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
          <div className="md:col-span-2"><Label>Search notes</Label>
            <div className="relative"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." /></div>
          </div>
          <div className="md:col-span-4"><Button variant="outline" size="sm" onClick={reset}>Reset filters</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{rows.length} {rows.length === 1 ? "result" : "results"}</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No transactions match your filters.</p>}
          <div className="divide-y">
            {rows.map(r => (
              <div key={r.kind + r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.notes || r.category} <span className="text-xs uppercase ml-2 text-muted-foreground">{r.type}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{fmtDate(r.date)} · {r.account}</div>
                </div>
                <div className={`font-semibold tabular-nums ${r.kind === "transfer" ? "text-transfer" : r.signed >= 0 ? "text-income" : "text-expense"}`}>
                  {r.signed >= 0 ? "+" : "-"}{money(Math.abs(r.amount))}
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => del(r.kind, r.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
