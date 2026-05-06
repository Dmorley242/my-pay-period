import { useMemo, useState } from "react";
import { useAccounts, useActivePayPeriod, useCategories, useTransactions, useTransfers } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight, PlusCircle, Plus, CalendarRange, History, Landmark, ArrowRight, ChevronDown } from "lucide-react";

type ActivityRow = {
  id: string;
  kind: "tx" | "transfer";
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  direction: "in" | "out" | "transfer";
};

export default function Dashboard() {
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: transfers = [] } = useTransfers();
  const { data: cats = [] } = useCategories();
  const active = useActivePayPeriod();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const selectedAccount = selectedAccountId
    ? accounts.find(a => a.id === selectedAccountId) ?? null
    : accounts[0] ?? null;

  const total = accounts.reduce((s, a) => s + Number(a.current_balance), 0);
  const startingTotal = accounts.reduce((s, a) => s + Number(a.starting_balance), 0);
  const balanceChange = total - startingTotal;
  const periodTxs = active ? txs.filter(t => t.pay_period_id === active.id) : [];
  const periodTransfers = active ? transfers.filter(t => t.pay_period_id === active.id) : [];
  const income = periodTxs.filter(t => t.transaction_type === "income" || t.transaction_type === "deposit").reduce((s, t) => s + Number(t.amount), 0);
  const expense = periodTxs.filter(t => t.transaction_type === "expense" || t.transaction_type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0);
  const netFlow = income - expense;
  const transfersTotal = periodTransfers.reduce((s, t) => s + Number(t.amount), 0);
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? "—";
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? "Uncategorized";

  const getAccountActivity = (accountId: string, limit = 5): ActivityRow[] => {
    const accountTxs: ActivityRow[] = txs
      .filter(t => t.account_id === accountId)
      .map(t => {
        const isIn = ["income", "deposit"].includes(t.transaction_type);
        return {
          id: t.id,
          kind: "tx" as const,
          date: t.date,
          title: t.notes || catName(t.category_id),
          subtitle: `${fmtDate(t.date)} · ${t.transaction_type}`,
          amount: Number(t.amount),
          direction: isIn ? "in" as const : "out" as const,
        };
      });

    const accountTransfers: ActivityRow[] = transfers
      .filter(t => t.from_account_id === accountId || t.to_account_id === accountId)
      .map(t => {
        const isIn = t.to_account_id === accountId;
        return {
          id: t.id,
          kind: "transfer" as const,
          date: t.date,
          title: isIn ? `Transfer from ${accName(t.from_account_id)}` : `Transfer to ${accName(t.to_account_id)}`,
          subtitle: `${fmtDate(t.date)} · account transfer`,
          amount: Number(t.amount),
          direction: isIn ? "in" as const : "out" as const,
        };
      });

    return [...accountTxs, ...accountTransfers]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, limit);
  };

  const recent = useMemo(() => [
    ...txs.slice(0, 10).map(t => {
      const isIn = ["income", "deposit"].includes(t.transaction_type);
      return {
        id: t.id,
        kind: "tx" as const,
        date: t.date,
        title: t.notes || catName(t.category_id),
        subtitle: `${accName(t.account_id)} · ${t.transaction_type}`,
        amount: Number(t.amount),
        direction: isIn ? "in" as const : "out" as const,
      };
    }),
    ...transfers.slice(0, 10).map(t => ({
      id: t.id,
      kind: "transfer" as const,
      date: t.date,
      title: `${accName(t.from_account_id)} → ${accName(t.to_account_id)}`,
      subtitle: "Transfer between accounts",
      amount: Number(t.amount),
      direction: "transfer" as const,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5), [txs, transfers, accounts, cats]);

  const selectedActivity = selectedAccount ? getAccountActivity(selectedAccount.id, 5) : [];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-lg)]">
        <div className="relative p-6 md:p-8 text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute right-20 bottom-0 h-28 w-28 rounded-full bg-white/10" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
                <Wallet className="h-3.5 w-3.5" /> Active money dashboard
              </div>
              <h1 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">{money(total)}</h1>
              <p className="mt-2 text-sm md:text-base opacity-85">Current total balance across {accounts.length} {accounts.length === 1 ? "account" : "accounts"}</p>
              {active && <p className="mt-1 text-xs opacity-75">Pay period: {fmtDate(active.start_date)} – {fmtDate(active.end_date)}</p>}
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Wallet} label="Starting total" value={money(startingTotal)} color="text-muted-foreground" />
        <StatCard icon={TrendingUp} label="Income this period" value={money(income)} color="text-income" />
        <StatCard icon={TrendingDown} label="Spent this period" value={money(expense)} color="text-expense" />
        <StatCard icon={ArrowLeftRight} label="Transfers" value={money(transfersTotal)} color="text-transfer" />
        <StatCard icon={Wallet} label="Balance movement" value={money(balanceChange)} color={balanceChange >= 0 ? "text-income" : "text-expense"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 shadow-[var(--shadow-sm)]">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Account Overview</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Click an account to see its balance movement and latest transactions.</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/accounts">Manage</Link></Button>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 && <Empty msg="No accounts yet. Add your first account." to="/accounts" cta="Add Account" />}
            <div className="grid gap-3 md:grid-cols-2">
              {accounts.map(a => {
                const isSelected = selectedAccount?.id === a.id;
                const accountChange = Number(a.current_balance) - Number(a.starting_balance);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAccountId(a.id)}
                    className={`text-left rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${isSelected ? "border-primary shadow-[var(--shadow-md)] ring-2 ring-primary/15" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground shrink-0"><Landmark className="h-5 w-5" /></div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{a.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{[a.bank_name, a.account_type].filter(Boolean).join(" · ") || "—"}</div>
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? "rotate-180" : ""}`} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MiniMetric label="Current" value={money(a.current_balance)} />
                      <MiniMetric label="Started" value={money(a.starting_balance)} />
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Change since start</span>
                      <span className={`font-semibold tabular-nums ${accountChange >= 0 ? "text-income" : "text-expense"}`}>{accountChange >= 0 ? "+" : "-"}{money(Math.abs(accountChange))}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-sm)]">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Selected Account</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Balance + last 5 movements.</p>
            </div>
            {selectedAccount && (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/history?account=${selectedAccount.id}`}>More <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedAccount && <p className="text-sm text-muted-foreground">Add an account to see details here.</p>}
            {selectedAccount && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-gradient-to-br from-muted/50 to-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{selectedAccount.name}</div>
                      <div className="text-xs text-muted-foreground">{selectedAccount.bank_name || "Bank account"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold tabular-nums">{money(selectedAccount.current_balance)}</div>
                      <div className="text-xs text-muted-foreground">Current balance</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <PeriodRow label="Beginning" value={money(selectedAccount.starting_balance)} className="text-foreground" />
                    <PeriodRow label="Change" value={`${Number(selectedAccount.current_balance) - Number(selectedAccount.starting_balance) >= 0 ? "+" : "-"}${money(Math.abs(Number(selectedAccount.current_balance) - Number(selectedAccount.starting_balance)))}`} className={Number(selectedAccount.current_balance) - Number(selectedAccount.starting_balance) >= 0 ? "text-income" : "text-expense"} />
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedActivity.length === 0 && <p className="text-sm text-muted-foreground">No transactions for this account yet.</p>}
                  {selectedActivity.map(r => <ActivityItem key={r.kind + r.id} row={r} />)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Last 5 Transactions</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Latest money movements across all accounts.</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/history">View all</Link></Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 && <div className="text-sm text-muted-foreground">No activity yet.</div>}
            <div className="divide-y">
              {recent.map(r => <ActivityItem key={r.kind + r.id} row={r} />)}
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

const MiniMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-background/70 px-3 py-2">
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="font-semibold tabular-nums truncate">{value}</div>
  </div>
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

const ActivityItem = ({ row }: { row: ActivityRow }) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <div className="flex items-center gap-3 min-w-0">
      <TypeIcon direction={row.direction} />
      <div className="min-w-0">
        <div className="font-medium truncate">{row.title}</div>
        <div className="text-xs text-muted-foreground truncate">{row.subtitle}</div>
      </div>
    </div>
    <div className={`font-semibold tabular-nums shrink-0 ${row.direction === "transfer" ? "text-transfer" : row.direction === "in" ? "text-income" : "text-expense"}`}>
      {row.direction === "out" ? "-" : "+"}{money(row.amount)}
    </div>
  </div>
);

const TypeIcon = ({ direction }: { direction: "in" | "out" | "transfer" }) => {
  const cls = "h-9 w-9 rounded-full flex items-center justify-center shrink-0";
  if (direction === "transfer") return <div className={`${cls} bg-transfer/10 text-transfer`}><ArrowLeftRight className="h-4 w-4" /></div>;
  if (direction === "in") return <div className={`${cls} bg-income/10 text-income`}><TrendingUp className="h-4 w-4" /></div>;
  return <div className={`${cls} bg-expense/10 text-expense`}><TrendingDown className="h-4 w-4" /></div>;
};
