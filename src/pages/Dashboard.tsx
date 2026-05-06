import { useAccounts, useActivePayPeriod, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight, PlusCircle, Plus, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  const transfersTotal = periodTransfers.reduce((s, t) => s + Number(t.amount), 0);
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";

  const recent = [
    ...txs.slice(0, 8).map(t => ({ kind: "tx" as const, ...t })),
    ...transfers.slice(0, 8).map(t => ({ kind: "transfer" as const, ...t })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">An overview of your money across every account.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/add"><Plus className="h-4 w-4 mr-1" />Income</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/add"><Plus className="h-4 w-4 mr-1" />Expense</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/transfers"><ArrowLeftRight className="h-4 w-4 mr-1" />Transfer</Link></Button>
          <Button asChild size="sm"><Link to="/accounts"><PlusCircle className="h-4 w-4 mr-1" />Add Account</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2 border-0 text-primary-foreground shadow-[var(--shadow-glow)]" style={{ background: "var(--gradient-hero)" }}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium opacity-90">Total Balance</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold tracking-tight">{money(total)}</div>
            <div className="text-sm opacity-80 mt-1">Across {accounts.length} {accounts.length === 1 ? "account" : "accounts"}</div>
          </CardContent>
        </Card>
        <StatCard icon={TrendingUp} label="Income (period)" value={money(income)} color="text-income" />
        <StatCard icon={TrendingDown} label="Expenses (period)" value={money(expense)} color="text-expense" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Accounts</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/accounts">Manage</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.length === 0 && <Empty msg="No accounts yet. Add your first account." to="/accounts" cta="Add Account" />}
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between p-4 rounded-xl border bg-card hover:shadow-[var(--shadow-md)] transition-shadow">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{[a.bank_name, a.account_type].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <div className="text-lg font-semibold tabular-nums">{money(a.current_balance)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-4 w-4" />Active Pay Period</CardTitle></CardHeader>
            <CardContent>
              {active ? (
                <>
                  <div className="font-semibold">{active.name}</div>
                  <div className="text-sm text-muted-foreground">{fmtDate(active.start_date)} – {fmtDate(active.end_date)}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-accent"><div className="text-income font-semibold">{money(income)}</div><div className="text-muted-foreground">Income</div></div>
                    <div className="p-2 rounded-lg bg-accent"><div className="text-expense font-semibold">{money(expense)}</div><div className="text-muted-foreground">Spent</div></div>
                    <div className="p-2 rounded-lg bg-accent"><div className="text-transfer font-semibold">{money(transfersTotal)}</div><div className="text-muted-foreground">Transfers</div></div>
                  </div>
                </>
              ) : (
                <Empty msg="No active pay period." to="/pay-periods" cta="Create One" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/history">View all</Link></Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 && <div className="text-sm text-muted-foreground">No activity yet.</div>}
          <div className="divide-y">
            {recent.map(r => (
              <div key={r.kind + r.id} className="flex items-center justify-between py-3">
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
                <div className={`font-semibold tabular-nums ${
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
  <Card>
    <CardHeader className="pb-2 flex-row items-center justify-between">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <Icon className={`h-4 w-4 ${color}`} />
    </CardHeader>
    <CardContent><div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div></CardContent>
  </Card>
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
