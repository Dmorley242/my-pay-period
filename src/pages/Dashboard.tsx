import { useAccounts, useActivePayPeriod, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight, PlusCircle, Plus, CalendarRange, History, Landmark } from "lucide-react";

export default function Dashboard() {
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: transfers = [] } = useTransfers();
  const active = useActivePayPeriod();

  const total = accounts.reduce((s, a) => s + Number(a.current_balance), 0);
  const periodTxs = active ? txs.filter(t => t.pay_period_id === active.id) : [];
  const periodTransfers = active ? transfers.filter(t => t.pay_period_id === active.id) : [];
  const income = periodTxs.filter(t => t.transaction_type === "income" || t.transaction_type === "deposit").reduce((s, t) => s + Number(t.amount), 0);
  const expense = periodTxs.filter(t => t.transaction_type === "expense" || t.transaction_type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
  const netFlow = income - expense;
  const transfersTotal = periodTransfers.reduce((s, t) => s + Number(t.amount), 0);
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";

  const recent = [
    ...txs.slice(0, 8).map(t => ({ kind: "tx" as const, ...t })),
    ...transfers.slice(0, 8).map(t => ({ kind: "transfer" as const, ...t })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-lg)]">
        <div className="relative p-6 md:p-8 text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute right-20 bottom-0 h-28 w-28 rounded-full bg-white/10" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                <Wallet className="h-3.5 w-3.5" /> Pay Period Money Tracker
              </div>
              <h1 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">{money(total)}</h1>
              <p className="mt-2 text-sm md:text-base opacity-85">Total balance across {accounts.length} {accounts.length === 1 ? "account" : "accounts"}</p>
              {active && <p className="mt-1 text-xs opacity-75">Active period: {fmtDate(active.start_date)} – {fmtDate(active.end_date)}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button asChild variant="secondary" size="sm"><Link to="/add?type=income"><Plus className="h-4 w-4 mr-1" />Income</Link></Button>
              <Button asChild variant="secondary" size="sm"><Link to="/add?type=expense"><TrendingDown className="h-4 w-4 mr-1" />Expense</Link></Button>
              <Button asChild variant="secondary" size="sm"><Link to="/transfers"><ArrowLeftRight className="h-4 w-4 mr-1" />Transfer</Link></Button>
              <Button asChild className="bg-white text-primary hover:bg-white/90" size="sm"><Link to="/accounts"><PlusCircle className="h-4 w-4 mr-1" />Account</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Income this period" value={money(income)} color="text-income" />
        <StatCard icon={TrendingDown} label="Spent this period" value={money(expense)} color="text-expense" />
        <StatCard icon={ArrowLeftRight} label="Transfers" value={money(transfersTotal)} color="text-transfer" />
        <StatCard icon={Wallet} label="Net cash flow" value={money(netFlow)} color={netFlow >= 0 ? "text-income" : "text-expense"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-[var(--shadow-sm)]">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Accounts</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Your money split by bank/account.</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/accounts">Manage</Link></Button>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 && <Empty msg="No accounts yet. Add your first account." to="/accounts" cta="Add Account" />}
            <div className="grid gap-3 md:grid-cols-2">
              {accounts.map(a => (
                <div key={a.id} className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-4 hover:shadow-[var(--shadow-md)] transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shrink-0"><Landmark className="h-5 w-5" /></div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{a.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{[a.bank_name, a.account_type].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold tabular-nums">{money(a.current_balance)}</div>
                      <div className="text-[11px] text-muted-foreground">Started {money(a.starting_balance)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-4 w-4" />Active Pay Period</CardTitle></CardHeader>
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

          <Card className="shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Quick Links</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="outline" className="justify-start"><Link to="/history">View transaction history</Link></Button>
              <Button asChild variant="outline" className="justify-start"><Link to="/categories">Manage categories</Link></Button>
              <Button asChild variant="outline" className="justify-start"><Link to="/pay-periods">Manage pay periods</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-sm)]">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/history">View all</Link></Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 && <div className="text-sm text-muted-foreground">No activity yet.</div>}
          <div className="divide-y">
            {recent.map(r => (
              <div key={r.kind + r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <TypeIcon kind={r.kind} type={(r as any).transaction_type} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {r.kind === "transfer"
                        ? `${accName((r as any).from_account_id)} → ${accName((r as any).to_account_id)}`
                        : (r.notes || (r as any).transaction_type)}
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(r.date)} · {r.kind === "transfer" ? "Transfer" : (r as any).transaction_type}</div>
                  </div>
                </div>
                <div className={`font-semibold tabular-nums shrink-0 ${
                  r.kind === "transfer" ? "text-transfer"
                    : (["income","deposit"].includes((r as any).transaction_type) ? "text-income" : "text-expense")
                }`}>
                  {r.kind === "transfer" || ["income","deposit"].includes((r as any).transaction_type) ? "+" : "-"}{money((r as any).amount)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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

const TypeIcon = ({ kind, type }: { kind: string; type?: string }) => {
  const cls = "h-9 w-9 rounded-full flex items-center justify-center shrink-0";
  if (kind === "transfer") return <div className={`${cls} bg-transfer/10 text-transfer`}><ArrowLeftRight className="h-4 w-4" /></div>;
  if (["income","deposit"].includes(type || "")) return <div className={`${cls} bg-income/10 text-income`}><TrendingUp className="h-4 w-4" /></div>;
  return <div className={`${cls} bg-expense/10 text-expense`}><TrendingDown className="h-4 w-4" /></div>;
};
