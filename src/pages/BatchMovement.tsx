import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts, useActivePayPeriod, useBudgetItems, useBudgetSubItems } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { money, accountLabel } from "@/lib/format";
import { Plus, Trash2, TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react";
import { addPendingMovement } from "@/lib/offlineQueue";
import { withTimeout, isLikelyNetworkOrTimeoutError } from "@/lib/networkSync";
import { buildTxNotes } from "@/lib/txNotes";

type RowKind = "income" | "expense" | "transfer";

type Row = {
  id: string;
  kind: RowKind;
  account: string;       // income/expense: account_id ; transfer: from
  toAccount: string;     // transfer: to
  amount: string;
  title: string;
  note: string;
  payPeriod: string;     // "none" or pay_period_id
  budgetItem: string;    // "none" or budget_item_id (expense only)
  budgetSubItem: string; // "none" or budget_sub_item_id (expense only)
};

const genRowId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const newRow = (kind: RowKind, defaultPeriod: string): Row => ({
  id: genRowId(),
  kind,
  account: "",
  toAccount: "",
  amount: "",
  title: "",
  note: "",
  payPeriod: kind === "transfer" ? "none" : defaultPeriod,
  budgetItem: "none",
  budgetSubItem: "none",
});

const cents = (s: string) => {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function BatchMovement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const active = useActivePayPeriod();
  const { data: budgetItems = [] } = useBudgetItems();
  const { data: budgetSubItems = [] } = useBudgetSubItems();

  const defaultPeriod = active?.id || "none";
  const activeBudgetItems = useMemo(
    () => (active ? budgetItems.filter(b => b.pay_period_id === active.id) : []),
    [budgetItems, active],
  );

  const [batchName, setBatchName] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [expectedIncome, setExpectedIncome] = useState("");
  const [expectedExpense, setExpectedExpense] = useState("");
  const [expectedTransfer, setExpectedTransfer] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows(rs => rs.filter(r => r.id !== id));
  const addRow = (kind: RowKind) => setRows(rs => [...rs, newRow(kind, defaultPeriod)]);

  const incomeRows = rows.filter(r => r.kind === "income");
  const expenseRows = rows.filter(r => r.kind === "expense");
  const transferRows = rows.filter(r => r.kind === "transfer");

  const incomeTotalCents = incomeRows.reduce((s, r) => s + cents(r.amount), 0);
  const expenseTotalCents = expenseRows.reduce((s, r) => s + cents(r.amount), 0);
  const transferTotalCents = transferRows.reduce((s, r) => s + cents(r.amount), 0);

  const expectedIncomeCents = expectedIncome ? cents(expectedIncome) : null;
  const expectedExpenseCents = expectedExpense ? cents(expectedExpense) : null;
  const expectedTransferCents = expectedTransfer ? cents(expectedTransfer) : null;

  const incomeMatches = expectedIncomeCents === null || expectedIncomeCents === incomeTotalCents;
  const expenseMatches = expectedExpenseCents === null || expectedExpenseCents === expenseTotalCents;
  const transferMatches = expectedTransferCents === null || expectedTransferCents === transferTotalCents;

  const rowValidity = (r: Row): string | null => {
    if (cents(r.amount) <= 0) return "Amount must be greater than 0";
    if (r.kind === "transfer") {
      if (!r.account) return "From account required";
      if (!r.toAccount) return "To account required";
      if (r.account === r.toAccount) return "From and To must differ";
    } else {
      if (!r.account) return "Account required";
      if (r.kind === "expense" && r.budgetSubItem !== "none") {
        // sub-item must belong to chosen budget item
        const sub = budgetSubItems.find(s => s.id === r.budgetSubItem);
        if (!sub || sub.budget_item_id !== r.budgetItem) return "Sub-item must belong to chosen budget item";
      }
    }
    return null;
  };

  const allRowsValid = rows.length > 0 && rows.every(r => rowValidity(r) === null);
  const canSave =
    !saving && !!user && !!date && allRowsValid && incomeMatches && expenseMatches && transferMatches;

  // Net worth & account impact
  const netWorthCents = incomeTotalCents - expenseTotalCents;
  const accountImpactCents: Record<string, number> = {};
  for (const r of rows) {
    const amt = cents(r.amount);
    if (!amt) continue;
    if (r.kind === "income" && r.account) accountImpactCents[r.account] = (accountImpactCents[r.account] || 0) + amt;
    if (r.kind === "expense" && r.account) accountImpactCents[r.account] = (accountImpactCents[r.account] || 0) - amt;
    if (r.kind === "transfer") {
      if (r.account) accountImpactCents[r.account] = (accountImpactCents[r.account] || 0) - amt;
      if (r.toAccount) accountImpactCents[r.toAccount] = (accountImpactCents[r.toAccount] || 0) + amt;
    }
  }

  const buildPayloadFor = (r: Row) => {
    const amt = cents(r.amount) / 100;
    const combinedNoteText = [batchName.trim(), batchNote.trim()].filter(Boolean).join(" — ") || null;
    const userNote = r.note.trim() || combinedNoteText;
    const notes = buildTxNotes(r.title.trim() || null, userNote);
    if (r.kind === "transfer") {
      return {
        kind: "transfer" as const,
        payload: {
          user_id: user!.id,
          date,
          from_account_id: r.account,
          to_account_id: r.toAccount,
          pay_period_id: null as string | null,
          amount: amt,
          notes,
        },
      };
    }
    const periodId = r.payPeriod === "none" ? null : r.payPeriod;
    const payload: Record<string, any> = {
      user_id: user!.id,
      transaction_type: r.kind,
      date,
      account_id: r.account,
      category_id: null,
      pay_period_id: periodId,
      amount: amt,
      notes,
    };
    if (r.kind === "expense") {
      if (r.budgetItem !== "none") payload.budget_item_id = r.budgetItem;
      if (r.budgetSubItem !== "none") payload.budget_sub_item_id = r.budgetSubItem;
    }
    return { kind: "transaction" as const, payload };
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);

    const items = rows.map(buildPayloadFor);

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      for (const it of items) addPendingMovement(it.kind, it.payload);
      toast.success("Batch entries saved offline. They will sync when you're back online.");
      qc.invalidateQueries();
      nav("/");
      return;
    }

    let insertedCount = 0;
    let queuedCount = 0;
    let stoppedError: string | null = null;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const table = it.kind === "transfer" ? "transfers" : "transactions";
      try {
        const insertP = supabase.from(table as any).insert(it.payload as any).select().single();
        const res: any = await withTimeout(insertP as unknown as Promise<any>, 8000, `batch-${table}`);
        if (res?.error) {
          if (isLikelyNetworkOrTimeoutError(res.error)) {
            for (let j = i; j < items.length; j++) {
              addPendingMovement(items[j].kind, items[j].payload);
              queuedCount++;
            }
            break;
          } else {
            stoppedError = friendlyError(res.error);
            break;
          }
        } else {
          insertedCount++;
        }
      } catch (e: any) {
        if (isLikelyNetworkOrTimeoutError(e)) {
          for (let j = i; j < items.length; j++) {
            addPendingMovement(items[j].kind, items[j].payload);
            queuedCount++;
          }
          break;
        } else {
          stoppedError = e?.message || "Save failed";
          break;
        }
      }
    }

    setSaving(false);
    qc.invalidateQueries();

    if (stoppedError) {
      toast.error(stoppedError);
      return;
    }
    if (queuedCount > 0) {
      toast.success("Connection issue. Remaining batch entries saved offline for sync.");
    } else {
      toast.success("Batch entry saved.");
    }
    nav("/");
  };

  const accName = (id: string) => {
    const a = accounts.find(x => x.id === id);
    return a ? accountLabel(a) : "—";
  };

  const renderRow = (r: Row, idx: number) => {
    const err = rowValidity(r);
    const kindMeta =
      r.kind === "income"
        ? { label: "Income", icon: <TrendingUp className="h-3 w-3" />, cls: "bg-income/15 text-income border-income/30" }
        : r.kind === "expense"
          ? { label: "Expense", icon: <TrendingDown className="h-3 w-3" />, cls: "bg-expense/15 text-expense border-expense/30" }
          : { label: "Transfer", icon: <ArrowLeftRight className="h-3 w-3" />, cls: "bg-transfer/15 text-transfer border-transfer/30" };
    const subItems = r.kind === "expense" && r.budgetItem !== "none"
      ? budgetSubItems.filter(s => s.budget_item_id === r.budgetItem)
      : [];
    return (
      <div key={r.id} className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`gap-1 ${kindMeta.cls}`}>
                {kindMeta.icon}
                <span className="text-[10px] uppercase tracking-wide">{kindMeta.label}</span>
              </Badge>
              <span className="text-xs text-muted-foreground">#{idx + 1}</span>
            </div>
            {r.title.trim() && (
              <div className="mt-1 text-base font-semibold truncate">{r.title.trim()}</div>
            )}
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => removeRow(r.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {r.kind === "transfer" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>From *</Label>
              <Select value={r.account} onValueChange={v => updateRow(r.id, { account: v })}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)} — {money(a.current_balance)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To *</Label>
              <Select value={r.toAccount} onValueChange={v => updateRow(r.id, { toAccount: v })}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter(a => a.id !== r.account).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div>
            <Label>Account *</Label>
            <Select value={r.account} onValueChange={v => updateRow(r.id, { account: v })}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Amount *</Label>
            <MoneyInput value={r.amount} onChange={v => updateRow(r.id, { amount: v })} />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={r.title} onChange={e => updateRow(r.id, { title: e.target.value })} placeholder="Optional display title" />
          </div>
        </div>

        {r.kind === "expense" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Budget Item</Label>
              <Select
                value={r.budgetItem}
                onValueChange={v => updateRow(r.id, { budgetItem: v, budgetSubItem: "none" })}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {activeBudgetItems.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {activeBudgetItems.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No budget items in active pay period.</p>
              )}
            </div>
            {subItems.length > 0 && (
              <div>
                <Label>Sub-item</Label>
                <Select value={r.budgetSubItem} onValueChange={v => updateRow(r.id, { budgetSubItem: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {subItems.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {r.kind !== "transfer" && (
          <div>
            <Label>Pay Period</Label>
            <Select value={r.payPeriod} onValueChange={v => updateRow(r.id, { payPeriod: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {active && <SelectItem value={active.id}>{active.name} (active)</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Note</Label>
          <Textarea rows={2} value={r.note} onChange={e => updateRow(r.id, { note: e.target.value })} placeholder="Optional" />
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Batch Entry</h1>
        <p className="text-muted-foreground mt-1 text-sm">Enter income, expenses, and transfers in one session.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Batch Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Batch Name</Label>
            <Input value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="Optional (e.g. Payday)" />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Expected Income</Label>
              <MoneyInput value={expectedIncome} onChange={setExpectedIncome} />
            </div>
            <div>
              <Label>Expected Expense</Label>
              <MoneyInput value={expectedExpense} onChange={setExpectedExpense} />
            </div>
            <div>
              <Label>Expected Transfer</Label>
              <MoneyInput value={expectedTransfer} onChange={setExpectedTransfer} />
            </div>
          </div>
          <div>
            <Label>Batch Note</Label>
            <Textarea rows={2} value={batchNote} onChange={e => setBatchNote(e.target.value)} placeholder="Optional" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Add Row</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => addRow("income")} className="gap-1">
              <TrendingUp className="h-4 w-4" />Income
            </Button>
            <Button variant="outline" onClick={() => addRow("expense")} className="gap-1">
              <TrendingDown className="h-4 w-4" />Expense
            </Button>
            <Button variant="outline" onClick={() => addRow("transfer")} className="gap-1">
              <ArrowLeftRight className="h-4 w-4" />Transfer
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Rows ({rows.length})</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setRows([])}>Clear all</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.map((r, i) => renderRow(r, i))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Summary</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground uppercase">Income</div>
              <div className="font-semibold tabular-nums text-income">{money(incomeTotalCents / 100)}</div>
              <div className="text-[11px] text-muted-foreground">{incomeRows.length} row{incomeRows.length === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground uppercase">Expense</div>
              <div className="font-semibold tabular-nums text-expense">{money(expenseTotalCents / 100)}</div>
              <div className="text-[11px] text-muted-foreground">{expenseRows.length} row{expenseRows.length === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[11px] text-muted-foreground uppercase">Transfer</div>
              <div className="font-semibold tabular-nums text-transfer">{money(transferTotalCents / 100)}</div>
              <div className="text-[11px] text-muted-foreground">{transferRows.length} row{transferRows.length === 1 ? "" : "s"}</div>
            </div>
          </div>

          <div className="flex justify-between border-t pt-2">
            <span className="text-muted-foreground">Net worth impact</span>
            <span className={`font-semibold tabular-nums ${netWorthCents >= 0 ? "text-income" : "text-expense"}`}>
              {netWorthCents >= 0 ? "+" : "-"}{money(Math.abs(netWorthCents) / 100)}
            </span>
          </div>

          {Object.keys(accountImpactCents).length > 0 && (
            <div className="border-t pt-2">
              <div className="text-xs uppercase text-muted-foreground mb-1">Account impact</div>
              <div className="space-y-1">
                {Object.entries(accountImpactCents).map(([accId, delta]) => (
                  <div key={accId} className="flex justify-between">
                    <span className="truncate">{accName(accId)}</span>
                    <span className={`tabular-nums font-medium ${delta >= 0 ? "text-income" : "text-expense"}`}>
                      {delta >= 0 ? "+" : "-"}{money(Math.abs(delta) / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {expectedIncomeCents !== null && !incomeMatches && (
            <p className="text-xs text-destructive">Income rows must equal expected income total.</p>
          )}
          {expectedExpenseCents !== null && !expenseMatches && (
            <p className="text-xs text-destructive">Expense rows must equal expected expense total.</p>
          )}
          {expectedTransferCents !== null && !transferMatches && (
            <p className="text-xs text-destructive">Transfer rows must equal expected transfer total.</p>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-4 px-4 py-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => nav("/")}>Cancel</Button>
        <Button className="flex-1" disabled={!canSave} onClick={save}>
          {saving ? "Saving…" : "Save Batch"}
        </Button>
      </div>
    </div>
  );
}
