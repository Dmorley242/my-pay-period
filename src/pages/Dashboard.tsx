import { useMemo, useRef, useState } from "react";
import { useAccountHolds, useAccounts, useActivePayPeriod, useCategories, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight, PlusCircle, Plus, CalendarRange, History, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

type Movement = {
  id: string;
  kind: "tx" | "transfer";
  date: string;
  created_at: string;
  label: string;
  type: string;
  signed: number;
  balanceAfter: number;
};

export default function Dashboard() {
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: transfers = [] } = useTransfers();
  const { data: holds = [] } = useAccountHolds();
  const { data: cats = [] } = useCategories();
  const active = useActivePayPeriod();
  const [idx, setIdx] = useState(0);
  const touchStart = useRef<number | null>(null);

  const total = accounts.reduce((s, a) => s + Number(a.current_balance), 0);
  const periodTxs = active ? txs.filter(t => t.pay_period_id === active.id) : [];
  const periodTransfers = active ? transfers.filter(t => t.pay_period_id === active.id) : [];
  const income = periodTxs.filter(t => t.transaction_type === "income" || t.transaction_type === "deposit").reduce((s, t) => s + Number(t.amount), 0);
  const expense = periodTxs.filter(t => t.transaction_type === "expense" || t.transaction_type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
  const netFlow = income - expense;
  const transfersTotal = periodTransfers.reduce((s, t) => s + Number(t.amount), 0);

  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? "Uncategorized";

  const safeIdx = accounts.length === 0 ? 0 : Math.min(idx, accounts.length - 1);
  const current = accounts[safeIdx];

  const movementsForAccount = (accountId: string): Movement[] => {
    const aTxs = txs.filter(t => t.account_id === accountId).map(t => {
      const isIn = ["income", "deposit"].includes(t.transaction_type);
      const signed = isIn ? Number(t.amount) : -Number(t.amount);
      return {
        id: t.id, kind: "tx" as const, date: t.date, created_at: (t as any).created_at ?? t.date,
        label: t.notes || catName(t.category_id), type: t.transaction_type, signed, balanceAfter: 0,
      };
    });
    const aTr = transfers.filter(t => t.from_account_id === accountId || t.to_account_id === accountId).map(t => {
      const isIn = t.to_account_id === accountId;
      const signed = isIn ? Number(t.amount) : -Number(t.amount);
      const label = isIn ? `Transfer from ${accName(t.from_account_id)}` : `Transfer to ${accName(t.to_account_id)}`;
      return { id: t.id, kind: "transfer" as const, date: t.date, created_at: (t as any).created_at ?? t.date, label, type: "transfer", signed, balanceAfter: 0 };
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
      return { id: t.id, kind: "tx" as const, date: t.date, title: t.notes || catName(t.category_id), subtitle: `${accName(t.account_id)} · ${t.transaction_type}`, amount: Number(t.amount), direction: isIn ? "in" as const : "out" as const };
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
                  {current.bank_name && <div className="mt-3 text-base md:text-lg font-semibold tracking-tight truncate">{current.bank_name}</div>}
                  <div className={`${current.bank_name ? "text-sm opacity-90" : "mt-3 text-lg md:text-xl font-semibold"} truncate`}>{current.name}</div>
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
                    <Link to={`/accounts/${current.id}`}>See more <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
                {currentMovements.length === 0 ? (
                  <p className="text-xs opacity-80 text-center py-3">No movements yet.</p>
                ) : (
                  <div className="space-y-1">
                    {currentMovements.map(m => (
                      <div key={m.kind + m.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{m.label}</div>
                          <div className="text-[11px] opacity-80 truncate">{fmtDate(m.date)} · {m.type}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-semibold tabular-nums ${m.signed >= 0 ? "text-income-foreground" : ""}`}>{m.signed >= 0 ? "+" : "-"}{money(Math.abs(m.signed))}</div>
                          <div className="text-[11px] opacity-80 tabular-nums">bal {money(m.balanceAfter)}</div>
                        </div>
                      </div>
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

      <div className="grid grid-cols-2 gap-2">
        <Button asChild size="sm"><Link to="/add"><PlusCircle className="h-4 w-4 mr-1" />Add Transaction</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/accounts"><Plus className="h-4 w-4 mr-1" />Add Account</Link></Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-[var(--shadow-sm)]">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-4 w-4" />This Pay Period</CardTitle></CardHeader>
          <CardContent>
            {active ? (
              <>
                <div className="font-semibold">{active.name}</div>
                <div className="text-sm text-muted-foreground">{fmtDate(active.start_date)} – {fmtDate(active.end_date)}</div>
                <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                  <PeriodRow label="Income" value={money(income)} className="text-income" />
                  <PeriodRow label="Spent" value={money(expense)} className="text-expense" />
                  <PeriodRow label="Transfers" value={money(transfersTotal)} className="text-transfer" />
                  <PeriodRow label="Net" value={money(netFlow)} className={netFlow >= 0 ? "text-income" : "text-expense"} />
                </div>
              </>
            ) : (
              <Empty msg="No active pay period." to="/pay-periods" cta="Create One" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-[var(--shadow-sm)]">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Recent Activity</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Latest movements across all accounts.</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/history">View all</Link></Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 && <div className="text-sm text-muted-foreground">No activity yet.</div>}
            <div className="divide-y">
              {recent.map(r => (
                <div key={r.kind + r.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <TypeIcon direction={r.direction} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                    </div>
                  </div>
                  <div className={`font-semibold tabular-nums shrink-0 ${r.direction === "transfer" ? "text-transfer" : r.direction === "in" ? "text-income" : "text-expense"}`}>
                    {r.direction === "out" ? "-" : "+"}{money(r.amount)}
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

const TypeIcon = ({ direction }: { direction: "in" | "out" | "transfer" }) => {
  const cls = "h-9 w-9 rounded-full flex items-center justify-center shrink-0";
  if (direction === "transfer") return <div className={`${cls} bg-transfer/10 text-transfer`}><ArrowLeftRight className="h-4 w-4" /></div>;
  if (direction === "in") return <div className={`${cls} bg-income/10 text-income`}><TrendingUp className="h-4 w-4" /></div>;
  return <div className={`${cls} bg-expense/10 text-expense`}><TrendingDown className="h-4 w-4" /></div>;
};
