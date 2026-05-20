import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAccountHolds, useAccounts, useCategories, usePayPeriods, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { money, fmtDate, accountLabel } from "@/lib/format";
import { Pencil, Trash2, SlidersHorizontal, StickyNote, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { MovementDetailsDialog, type MovementRef } from "@/components/MovementDetailsDialog";
import { txLabel, hasNotes } from "@/lib/txNotes";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";

type Movement = {
  id: string; kind: "tx" | "transfer"; date: string; created_at: string;
  label: string; type: string; categoryId: string | null; payPeriodId: string | null;
  signed: number; balanceBefore: number; balanceAfter: number; hasNote: boolean; raw: any;
};

export default function History() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: transfers = [] } = useTransfers();
  const { data: cats = [] } = useCategories();
  const { data: periods = [] } = usePayPeriods();
  const { data: holds = [] } = useAccountHolds();

  const [accountId, setAccountId] = useState<string>("");

  useEffect(() => {
    const fromUrl = searchParams.get("account");
    if (fromUrl && accounts.some(a => a.id === fromUrl)) {
      setAccountId(fromUrl);
    } else if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [searchParams, accounts]);

  const account = accounts.find(a => a.id === accountId);
  const accountHolds = holds.filter(h => h.account_id === accountId);
  const activeHolds = accountHolds.filter(h => h.status === "active");
  const activeHoldsTotal = activeHolds.reduce((s, h) => s + Number(h.amount), 0);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState("all");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", bank_name: "", account_type: "" });
  const [detail, setDetail] = useState<MovementRef | null>(null);

  const [reorderMode, setReorderMode] = useState(false);
  const [draftKeys, setDraftKeys] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const { data: orderRows = [] } = useQuery({
    queryKey: ["movement_orders", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await (supabase as any).from("movement_orders").select("*").eq("account_id", accountId);
      if (error) throw error;
      return data as { movement_kind: string; movement_id: string; position: number }[];
    },
    enabled: !!accountId,
  });

  // Exit reorder mode when account changes
  useEffect(() => { setReorderMode(false); setDraftKeys(null); }, [accountId]);

  useEffect(() => {
    if (account) setForm({ name: account.name, bank_name: account.bank_name ?? "", account_type: account.account_type ?? "" });
  }, [account?.id]);

  const accName = (id: string) => { const a = accounts.find(x => x.id === id); return a ? accountLabel(a) : "—"; };

  const orderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of orderRows) m.set(`${r.movement_kind}:${r.movement_id}`, r.position);
    return m;
  }, [orderRows]);

  // Chronological (oldest first) base list with running balance
  const chronoMovements: Movement[] = useMemo(() => {
    if (!account) return [];
    const aTxs = txs.filter(t => t.account_id === account.id).map(t => {
      const isIn = ["income", "deposit"].includes(t.transaction_type);
      return {
        id: t.id, kind: "tx" as const, date: t.date, created_at: (t as any).created_at ?? t.date,
        label: txLabel(t.notes, cats.find(c => c.id === t.category_id)?.name || t.transaction_type), type: t.transaction_type,
        categoryId: t.category_id, payPeriodId: t.pay_period_id,
        signed: isIn ? Number(t.amount) : -Number(t.amount), balanceBefore: 0, balanceAfter: 0,
        hasNote: hasNotes(t.notes), raw: t,
      };
    });
    const aTr = transfers.filter(t => t.from_account_id === account.id || t.to_account_id === account.id).map(t => {
      const isIn = t.to_account_id === account.id;
      return {
        id: t.id, kind: "transfer" as const, date: t.date, created_at: (t as any).created_at ?? t.date,
        label: isIn ? `Transfer from ${accName(t.from_account_id)}` : `Transfer to ${accName(t.to_account_id)}`,
        type: "transfer", categoryId: null, payPeriodId: t.pay_period_id,
        signed: isIn ? Number(t.amount) : -Number(t.amount), balanceBefore: 0, balanceAfter: 0,
        hasNote: !!t.notes, raw: t,
      };
    });
    const all = [...aTxs, ...aTr];
    const posOf = (m: Movement) => orderMap.get(`${m.kind}:${m.id}`) ?? Number.MAX_SAFE_INTEGER;
    all.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const pa = posOf(a), pb = posOf(b);
      if (pa !== pb) return pa - pb;
      return a.created_at < b.created_at ? -1 : 1;
    });
    let ordered = all;
    if (reorderMode && draftKeys) {
      const byKey = new Map(all.map(m => [`${m.kind}:${m.id}`, m]));
      const seen = new Set<string>();
      ordered = [];
      for (const k of draftKeys) {
        const m = byKey.get(k);
        if (m) { ordered.push(m); seen.add(k); }
      }
      for (const m of all) {
        const k = `${m.kind}:${m.id}`;
        if (!seen.has(k)) ordered.push(m);
      }
    }
    let running = Number(account.starting_balance);
    for (const m of ordered) { m.balanceBefore = running; running += m.signed; m.balanceAfter = running; }
    return ordered;
  }, [account, txs, transfers, cats, accounts, orderMap, reorderMode, draftKeys]);

  // Display list (newest first)
  const allMovements: Movement[] = useMemo(() => [...chronoMovements].reverse(), [chronoMovements]);

  const filtered = useMemo(() => allMovements.filter(m => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    if (period !== "all" && m.payPeriodId !== period) return false;
    if (category !== "all" && m.categoryId !== category) return false;
    if (type !== "all" && m.type !== type) return false;
    return true;
  }), [allMovements, from, to, period, category, type]);

  const reset = () => { setFrom(""); setTo(""); setPeriod("all"); setCategory("all"); setType("all"); };
  const hasActiveFilters = !!(from || to || period !== "all" || category !== "all" || type !== "all");

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

  const enterReorder = () => {
    setDraftKeys(chronoMovements.map(m => `${m.kind}:${m.id}`));
    setReorderMode(true);
  };
  const cancelReorder = () => { setDraftKeys(null); setReorderMode(false); };

  const moveAt = (displayIndex: number, dir: -1 | 1) => {
    if (!draftKeys) return;
    const n = draftKeys.length;
    const chronoIdx = n - 1 - displayIndex;
    const swapWith = chronoIdx + (dir === -1 ? 1 : -1);
    if (swapWith < 0 || swapWith >= n) return;
    const cur = chronoMovements[chronoIdx];
    const nbr = chronoMovements[swapWith];
    if (!cur || !nbr || cur.date !== nbr.date) {
      toast.info("Same-date only. Edit the transaction date to move it to another day.");
      return;
    }
    const next = [...draftKeys];
    [next[chronoIdx], next[swapWith]] = [next[swapWith], next[chronoIdx]];
    setDraftKeys(next);
  };

  const saveOrder = async () => {
    if (!account || !draftKeys) return;
    setSavingOrder(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const rows = draftKeys.map((k, i) => {
        const [movement_kind, movement_id] = k.split(":");
        return { user_id: uid, account_id: account.id, movement_kind, movement_id, position: i };
      });
      const { error } = await (supabase as any).from("movement_orders")
        .upsert(rows, { onConflict: "account_id,movement_kind,movement_id" });
      if (error) throw error;
      toast.success("Order saved");
      setReorderMode(false);
      setDraftKeys(null);
      qc.invalidateQueries({ queryKey: ["movement_orders", account.id] });
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSavingOrder(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Account History</h1>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">No accounts yet.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Account</CardTitle>
          {account && (
            <div className="flex items-center gap-2 flex-wrap">
              {reorderMode ? (
                <>
                  <Button size="sm" variant="outline" onClick={cancelReorder} disabled={savingOrder}>Cancel</Button>
                  <Button size="sm" onClick={saveOrder} disabled={savingOrder}>{savingOrder ? "Saving..." : "Save Order"}</Button>
                </>
              ) : (
                <>
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
                  <Button variant="outline" size="sm" onClick={enterReorder} disabled={allMovements.length < 2}>
                    <ArrowUpDown className="h-4 w-4 mr-1" />Reorder
                  </Button>
                </>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Select
            value={accountId}
            onValueChange={(v) => { setAccountId(v); setSearchParams({ account: v }); }}
            disabled={reorderMode}
          >
            <SelectTrigger className="max-w-full"><SelectValue placeholder="Select an account" /></SelectTrigger>
            <SelectContent>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {account && (
        <>
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

          {!reorderMode && (
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => setFiltersOpen(o => !o)}>
                  <SlidersHorizontal className="h-4 w-4 mr-1" />
                  {filtersOpen ? "Hide Filters" : "Filter"}
                </Button>
                {hasActiveFilters && <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>}
              </div>
              <CollapsibleContent>
                <Card className="mt-3">
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
              </CollapsibleContent>
            </Collapsible>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {reorderMode ? `Reorder · ${allMovements.length}` : `${filtered.length} ${filtered.length === 1 ? "movement" : "movements"}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reorderMode && <p className="text-xs text-muted-foreground mb-2">Reorder same-date items to match your statement. To move to a different day, edit the transaction date.</p>}
              {!reorderMode && filtered.length === 0 && <p className="text-sm text-muted-foreground">No movements match your filters.</p>}
              <div className="divide-y">
                {(reorderMode ? allMovements : filtered).map((m, idx, arr) => (
                  <div
                    key={m.kind + m.id}
                    role={reorderMode ? undefined : "button"}
                    tabIndex={reorderMode ? -1 : 0}
                    onClick={reorderMode ? undefined : () => setDetail({ kind: m.kind, record: m.raw, balanceBefore: m.balanceBefore, balanceAfter: m.balanceAfter } as MovementRef)}
                    onKeyDown={reorderMode ? undefined : (e) => { if (e.key === "Enter") setDetail({ kind: m.kind, record: m.raw, balanceBefore: m.balanceBefore, balanceAfter: m.balanceAfter } as MovementRef); }}
                    className={`py-3 flex items-center justify-between gap-3 rounded-md px-2 -mx-2 ${reorderMode ? "" : "cursor-pointer hover:bg-accent/40"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{m.label}</span>
                        {m.hasNote && <StickyNote className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className="text-xs uppercase ml-1 text-muted-foreground">{m.type}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{fmtDate(m.date)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums flex flex-wrap gap-x-2">
                        <span>Before: {money(m.balanceBefore)}</span>
                        <span>After: {money(m.balanceAfter)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-semibold tabular-nums ${m.kind === "transfer" ? "text-transfer" : m.signed >= 0 ? "text-income" : "text-expense"}`}>
                        {m.signed >= 0 ? "+" : "-"}{money(Math.abs(m.signed))}
                      </div>
                    </div>
                    {reorderMode ? (
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button size="icon" variant="outline" className="h-7 w-7" disabled={idx === 0 || arr[idx - 1]?.date !== m.date} onClick={(e) => { e.stopPropagation(); moveAt(idx, -1); }}><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="outline" className="h-7 w-7" disabled={idx === arr.length - 1 || arr[idx + 1]?.date !== m.date} onClick={(e) => { e.stopPropagation(); moveAt(idx, 1); }}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); delMovement(m.kind, m.id); }}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <MovementDetailsDialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)} movement={detail} />
    </div>
  );
}
