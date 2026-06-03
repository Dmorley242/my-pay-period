import { useMemo, useRef, useState } from "react";
import { useAccountHolds, useAccounts, useActivePayPeriod, useBudgetItems, useCategories, usePayPeriods, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, fmtDate, accountLabel, accountParts } from "@/lib/format";
import { Link } from "react-router-dom";
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight, PlusCircle, Plus, CalendarRange, History, ChevronLeft, ChevronRight, ArrowRight, PieChart, ChevronDown, StickyNote, CreditCard } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MovementDetailsDialog, type MovementRef } from "@/components/MovementDetailsDialog";
import { txLabel, hasNotes } from "@/lib/txNotes";
import { QuickBudgetSpendDialog } from "@/components/QuickBudgetSpendDialog";
import { LoadCreditCardDialog } from "@/components/LoadCreditCardDialog";
import type { BudgetItem } from "@/hooks/useFinanceData";

type Movement = {
  id: string;
  kind: "tx" | "transfer";
  date: string;
  created_at: string;
  label: string;
  type: string;
  signed: number;
  balanceAfter: number;
  hasNote: boolean;
  raw: any;
};

export default function Dashboard() {
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: transfers = [] } = useTransfers();
  const { data: holds = [] } = useAccountHolds();
  const { data: cats = [] } = useCategories();
  const { data: periods = [] } = usePayPeriods();
  const active = useActivePayPeriod();
  const { data: budgetItems = [] } = useBudgetItems();
  const [idx, setIdx] = useState(0);
  const [detail, setDetail] = useState<MovementRef | null>(null);
  const [quickItem, setQuickItem] = useState<BudgetItem | null>(null);
  const [loadCCOpen, setLoadCCOpen] = useState(false);
  const [showAllBudget, setShowAllBudget] = useState(false);
  const touchStart = useRef<number | null>(null);

  const total = accounts.reduce((s, a) => s + Number(a.current_balance), 0);
  const periodTxs = active ? txs.filter(t => t.pay_period_id === active.id) : [];
  const periodTransfers = active ? transfers.filter(t => t.pay_period_id === active.id) : [];
  const income = periodTxs.filter(t => t.transaction_type === "income" || t.transaction_type === "deposit").reduce((s, t) => s + Number(t.amount), 0);
  const expense = periodTxs.filter(t => t.transaction_type === "expense" || t.transaction_type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
  const netFlow = income - expense;
  const transfersTotal = periodTransfers.reduce((s, t) => s + Number(t.amount), 0);

  const accName = (id: string) => { const a = accounts.find(x => x.id === id); return a ? accountLabel(a) : "—"; };
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? "Uncategorized";

  const safeIdx = accounts.length === 0 ? 0 : Math.min(idx, accounts.length - 1);
  const current = accounts[safeIdx];

  const movementsForAccount = (accountId: string): Movement[] => {
    const aTxs = txs.filter(t => t.account_id === accountId).map(t => {
      const isIn = ["income", "deposit"].includes(t.transaction_type);
      const signed = isIn ? Number(t.amount) : -Number(t.amount);
      return {
        id: t.id, kind: "tx" as const, date: t.date, created_at: (t as any).created_at ?? t.date,
        label: txLabel(t.notes, cats.find(c => c.id === t.category_id)?.name || t.transaction_type),
        type: t.transaction_type, signed, balanceAfter: 0,
        hasNote: hasNotes(t.notes), raw: t,
      };
    });
    const aTr = transfers.filter(t => t.from_account_id === accountId || t.to_account_id === accountId).map(t => {
      const isIn = t.to_account_id === accountId;
      const signed = isIn ? Number(t.amount) : -Number(t.amount);
      const label = isIn ? `Transfer from ${accName(t.from_account_id)}` : `Transfer to ${accName(t.to_account_id)}`;
      return { id: t.id, kind: "transfer" as const, date: t.date, created_at: (t as any).created_at ?? t.date, label, type: "transfer", signed, balanceAfter: 0, hasNote: !!t.notes, raw: t };
    });
    const all = [...aTxs, ...aTr].sort((a, b) =>
      a.date === b.date ? (a.created_at < b.created_at ? -1 : 1) : (a.date < b.date ? -1 : 1)
    );
    const acc = accounts.find(a => a.id === accountId);
    let running = Number(acc?.starting_balance ?? 0);
    for (const m of all) { running += m.signed; m.balanceAfter = running; }
    return all.reverse();
  };

  const currentMovements = useMemo(() => current ? movementsForAccount(current.id).slice(0, 3) : [], [current, txs, transfers, accounts, cats]);

  const recent = useMemo(() => [
    ...txs.slice(0, 10).map(t => {
      const isIn = ["income", "deposit"].includes(t.transaction_type);
      return { id: t.id, kind: "tx" as const, date: t.date, title: txLabel(t.notes, cats.find(c => c.id === t.category_id)?.name || t.transaction_type), subtitle: `${accName(t.account_id)} · ${t.transaction_type}`, amount: Number(t.amount), direction: isIn ? "in" as const : "out" as const };
    }),
    ...transfers.slice(0, 10).map(t => ({
      id: t.id, kind: "transfer" as const, date: t.date, title: `${accName(t.from_account_id)} → ${accName(t.to_account_id)}`, subtitle: "Transfer between accounts", amount: Number(t.amount), direction: "transfer" as const,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5), [txs, transfers, accounts, cats]);

  const prev = () => setIdx(i => (accounts.length ? (i - 1 + accounts.length) % accounts.length : 0));
  const next = () => setIdx(i => (accounts.length ? (i + 1) % accounts.length : 0));

  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
    touchStart.current = null;
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-lg)]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="relative p-6 md:p-8 text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute right-20 bottom-0 h-28 w-28 rounded-full bg-white/10" />

          {!current ? (
            <div className="relative text-center py-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur"><Wallet className="h-3.5 w-3.5" /> Get started</div>
              <h1 className="mt-4 text-2xl font-bold">No accounts yet</h1>
              <p className="mt-2 opacity-85 text-sm">Add your first account to begin tracking.</p>
              <Button asChild className="mt-4 bg-white text-primary hover:bg-white/90"><Link to="/accounts"><PlusCircle className="h-4 w-4 mr-1" />Add Account</Link></Button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <Button onClick={prev} disabled={accounts.length < 2} variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-primary-foreground shrink-0"><ChevronLeft className="h-5 w-5" /></Button>
                <div className="min-w-0 flex-1 text-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur"><Wallet className="h-3.5 w-3.5" /> Account {safeIdx + 1} of {accounts.length}</div>
                  {(() => { const { bank, alias } = accountParts(current); return (<>
                    {bank && <div className="mt-3 text-base md:text-lg font-semibold tracking-tight truncate">{bank}</div>}
                    <div className={`${bank ? "text-sm opacity-90" : "mt-3 text-lg md:text-xl font-semibold"} truncate`}>{alias || (!bank ? accountLabel(current) : "")}</div>
                  </>); })()}
                </div>
                <Button onClick={next} disabled={accounts.length < 2} variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 text-primary-foreground shrink-0"><ChevronRight className="h-5 w-5" /></Button>
              </div>

              {(() => {
                const activeHolds = holds.filter(h => h.account_id === current.id && h.status === "active").reduce((s, h) => s + Number(h.amount), 0);
                const available = Number(current.current_balance) - activeHolds;
                return (
                  <>
                    <div className="mt-6 text-center">
                      <div className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">{money(current.current_balance)}</div>
                      <div className="mt-1 text-xs opacity-80">Current balance · started at {money(current.starting_balance)}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white/10 backdrop-blur p-3 text-center">
                        <div className="text-[11px] opacity-80">Active Holds</div>
                        <div className="text-base font-semibold tabular-nums">{money(activeHolds)}</div>
                      </div>
                      <div className="rounded-xl bg-white/10 backdrop-blur p-3 text-center">
                        <div className="text-[11px] opacity-80">Available</div>
                        <div className="text-base font-semibold tabular-nums">{money(available)}</div>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="mt-6 rounded-2xl bg-white/10 backdrop-blur p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-medium opacity-90">Last 3 movements</span>
                  <Button asChild size="sm" variant="ghost" className="h-7 text-primary-foreground hover:bg-white/15">
                    <Link to={`/history?account=${current.id}`}>See more <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
                {currentMovements.length === 0 ? (
                  <p className="text-xs opacity-80 text-center py-3">No movements yet.</p>
                ) : (
                  <div className="space-y-1">
                    {currentMovements.map(m => (
                      <button
                        type="button"
                        key={m.kind + m.id}
                        onClick={() => setDetail({ kind: m.kind, record: m.raw } as MovementRef)}
                        className="w-full text-left flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 hover:bg-white/20 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            <span className="truncate">{m.label}</span>
                            {m.hasNote && <StickyNote className="h-3 w-3 opacity-80 shrink-0" />}
                          </div>
                          <div className="text-[11px] opacity-80 truncate">{fmtDate(m.date)} · {m.type}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-semibold tabular-nums ${m.signed >= 0 ? "text-income-foreground" : ""}`}>{m.signed >= 0 ? "+" : "-"}{money(Math.abs(m.signed))}</div>
                          <div className="text-[11px] opacity-80 tabular-nums">bal {money(m.balanceAfter)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {accounts.length > 1 && (
                <div className="mt-4 flex justify-center gap-1.5">
                  {accounts.map((a, i) => (
                    <button key={a.id} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all ${i === safeIdx ? "w-6 bg-white" : "w-1.5 bg-white/40"}`} aria-label={`Show ${a.name}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Button asChild size="sm"><Link to="/add"><PlusCircle className="h-4 w-4 mr-1" />Add Transaction</Link></Button>
        <Button size="sm" variant="secondary" onClick={() => setLoadCCOpen(true)}>
          <CreditCard className="h-4 w-4 mr-1" />Load Credit Card
        </Button>
        <Button asChild variant="outline" size="sm" className="col-span-2 sm:col-span-1"><Link to="/accounts"><Plus className="h-4 w-4 mr-1" />Add Account</Link></Button>
      </div>

      {active && (() => {
        const items = budgetItems.filter(b => b.pay_period_id === active.id);
        const spentMap = new Map<string, number>();
        txs.forEach(t => {
          const bid = (t as any).budget_item_id as string | null | undefined;
          if (bid && t.transaction_type === "expense") spentMap.set(bid, (spentMap.get(bid) || 0) + Number(t.amount));
        });
        const payAmount = Number(active.net_pay_amount ?? 0);
        const budgeted = items.reduce((s, b) => s + Number(b.budget_amount), 0);
        const spent = items.reduce((s, b) => s + (spentMap.get(b.id) || 0), 0);
        const remaining = budgeted - spent;
        const toAssign = payAmount - budgeted;
        const visible = showAllBudget ? items : items.slice(0, 5);
        const accLbl = (id: string) => { const a = accounts.find(x => x.id === id); return a ? accountLabel(a) : "—"; };
        return (
          <Card className="shadow-[var(--shadow-lg)] border-primary/30 ring-1 ring-primary/20 overflow-hidden">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><PieChart className="h-4 w-4 text-primary" />Active Budget</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link to="/budget">See More</Link></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`relative overflow-hidden rounded-xl px-4 py-3 flex items-center justify-between border ${toAssign < 0 ? "border-destructive/50" : "border-primary/40"}`}
                style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />
                <div className="relative text-primary-foreground">
                  <div className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Remaining to Budget</div>
                  <div className="text-[11px] opacity-75">Pay Amount − Total Budgeted</div>
                </div>
                <div className={`relative text-2xl md:text-3xl font-bold tabular-nums text-primary-foreground ${toAssign < 0 ? "text-destructive-foreground" : ""}`}>{money(toAssign)}</div>
              </div>
              {toAssign < 0 && (
                <div className="text-xs text-destructive font-medium text-center">Over budget by {money(Math.abs(toAssign))}</div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <DashCell label="Pay Amount" value={money(payAmount)} />
                <DashCell label="Total Budgeted" value={money(budgeted)} />
                <DashCell label="Total Budget Spent" value={money(spent)} cls="text-expense" />
                <DashCell label="Total Budget Remaining" value={money(remaining)} cls={remaining < 0 ? "text-destructive" : "text-income"} />
              </div>
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No budget items yet. <Link to="/budget" className="underline">Create one</Link>.</p>
              ) : (
                <div className="space-y-1.5">
                  {visible.map(b => {
                    const s = spentMap.get(b.id) || 0;
                    const r = Number(b.budget_amount) - s;
                    return (
                      <div key={b.id} className="rounded-md border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{b.name}</span>
                            <span className="text-xs text-muted-foreground truncate">{accLbl(b.account_id)}</span>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={() => setQuickItem(b)}>
                            <Plus className="h-3.5 w-3.5 mr-1" />Add
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-1 text-xs">
                          <DashCell label="Budget" value={money(b.budget_amount)} />
                          <DashCell label="Spent" value={money(s)} cls="text-expense" />
                          <DashCell label="Remaining" value={money(r)} cls={r < 0 ? "text-destructive" : "text-income"} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {items.length > 5 && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => setShowAllBudget(v => !v)}>
                    {showAllBudget ? "Show less" : `Show all (${items.length})`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Card className="shadow-[var(--shadow-lg)] border-primary/20 ring-1 ring-primary/10">
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-4 w-4 text-primary" />Pay Periods</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/pay-periods">See more</Link></Button>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <Empty msg="No pay periods yet." to="/pay-periods" cta="Create One" />
          ) : (() => {
            const activeIdx = periods.findIndex(p => p.is_active);
            const list = activeIdx >= 0
              ? [periods[activeIdx], ...periods.filter((_, i) => i !== activeIdx)].slice(0, 5)
              : periods.slice(0, 5);
            return (
              <div className="space-y-2">
                {list.map(p => {
                  const acc = accounts.find(a => a.id === p.paycheck_account_id);
                  const incomes = txs.filter(t => t.transaction_type === "income" && t.pay_period_id === p.id);
                  return (
                    <div key={p.id} className={`rounded-xl px-3 py-2 border ${p.is_active ? "border-primary/50 bg-primary/10 shadow-[var(--shadow-glow)]" : "border-border bg-accent/40"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</div>
                        {p.is_active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-primary-foreground shrink-0" style={{ background: "var(--gradient-primary)" }}>ACTIVE</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="text-xs text-muted-foreground truncate">{p.income_source || "—"}{acc ? ` · ${accountLabel(acc)}` : ""}</div>
                        <div className="text-xs font-semibold tabular-nums shrink-0">{p.net_pay_amount != null ? money(p.net_pay_amount) : "—"}</div>
                      </div>
                      <Collapsible className="mt-2">
                        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
                          <ChevronDown className="h-3 w-3 transition-transform" />
                          Income ({incomes.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-1">
                          {incomes.length === 0 ? (
                            <p className="text-xs text-muted-foreground pl-4">No additional income recorded.</p>
                          ) : incomes.map(t => {
                            const ia = accounts.find(a => a.id === t.account_id);
                            const iaLbl = ia ? accountLabel(ia) : "—";
                            return (
                              <button
                                type="button"
                                key={t.id}
                                onClick={() => setDetail({ kind: "tx", record: t as any })}
                                className="w-full text-left flex items-center justify-between text-xs pl-4 py-1 border-l-2 border-income/40 hover:bg-accent/40 rounded-r"
                              >
                                <div className="min-w-0 truncate">
                                  <span className="text-muted-foreground">{fmtDate(t.date)}</span>
                                  <span className="mx-1">·</span>
                                  <span className="font-medium">{txLabel(t.notes, "Income")}</span>
                                  {ia && <><span className="mx-1">·</span><span className="text-muted-foreground">{iaLbl}</span></>}
                                  {hasNotes(t.notes) && <StickyNote className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                                </div>
                                <div className="text-income font-medium tabular-nums shrink-0">+{money(t.amount)}</div>
                              </button>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      <MovementDetailsDialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)} movement={detail} />
      <QuickBudgetSpendDialog
        open={!!quickItem}
        onOpenChange={(o) => !o && setQuickItem(null)}
        budgetItem={quickItem}
        accounts={accounts}
        budgetItems={budgetItems}
        activePeriod={active}
      />
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <Card className="shadow-[var(--shadow-sm)]">
    <CardHeader className="pb-2 flex-row items-center justify-between">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <Icon className={`h-4 w-4 ${color}`} />
    </CardHeader>
    <CardContent><div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div></CardContent>
  </Card>
);

const PeriodRow = ({ label, value, className }: { label: string; value: string; className: string }) => (
  <div className="flex items-center justify-between rounded-xl bg-accent/70 px-3 py-2">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-semibold tabular-nums ${className}`}>{value}</span>
  </div>
);

const Empty = ({ msg, to, cta }: { msg: string; to: string; cta: string }) => (
  <div className="text-center py-6">
    <p className="text-sm text-muted-foreground mb-3">{msg}</p>
    <Button asChild size="sm"><Link to={to}>{cta}</Link></Button>
  </div>
);

const DashCell = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
  <div className="rounded-md bg-accent/40 px-2 py-1.5 text-center">
    <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    <div className={`font-semibold tabular-nums ${cls || ""}`}>{value}</div>
  </div>
);

const TypeIcon = ({ direction }: { direction: "in" | "out" | "transfer" }) => {
  const cls = "h-9 w-9 rounded-full flex items-center justify-center shrink-0";
  if (direction === "transfer") return <div className={`${cls} bg-transfer/10 text-transfer`}><ArrowLeftRight className="h-4 w-4" /></div>;
  if (direction === "in") return <div className={`${cls} bg-income/10 text-income`}><TrendingUp className="h-4 w-4" /></div>;
  return <div className={`${cls} bg-expense/10 text-expense`}><TrendingDown className="h-4 w-4" /></div>;
};
