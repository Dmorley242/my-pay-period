import { useEffect, useState } from "react";
import { useAccounts, usePayPeriods, useActivePayPeriod, useBudgetItems } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { useNavigate, useSearchParams } from "react-router-dom";

type TxType = "income" | "expense" | "withdrawal" | "transfer";

const TYPES: { value: TxType; label: string; desc: string }[] = [
  { value: "income", label: "Income", desc: "Money in (e.g. salary)" },
  { value: "expense", label: "Expense", desc: "Money spent" },
  { value: "withdrawal", label: "Withdrawal", desc: "Decrease account balance" },
  { value: "transfer", label: "Transfer", desc: "Move money between accounts" },
];

import { accountLabel as accLabel } from "@/lib/format";

// Today's date as YYYY-MM-DD in the user's local timezone (avoids UTC off-by-one).
const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function AddTransaction() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: periods = [] } = usePayPeriods();
  const active = useActivePayPeriod();
  const { data: budgetItems = [] } = useBudgetItems();

  const initialType = searchParams.get("type");
  const safeInitialType: TxType = (["income", "expense", "withdrawal", "transfer"].includes(initialType || "")
    ? initialType
    : "expense") as TxType;

  const [type, setType] = useState<TxType>(safeInitialType);
  const [date, setDate] = useState(todayLocal());
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [periodId, setPeriodId] = useState<string>(active?.id || "none");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [budgetItemId, setBudgetItemId] = useState<string>("none");
  const [attachActive, setAttachActive] = useState<boolean>(true);
  const [incomeSource, setIncomeSource] = useState("");
  const [expenseLabel, setExpenseLabel] = useState("");
  const [purpose, setPurpose] = useState("");

  const activeBudgetItems = active ? budgetItems.filter(b => b.pay_period_id === active.id) : [];

  useEffect(() => {
    if (active?.id && periodId === "none") setPeriodId(active.id);
  }, [active?.id, periodId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!user || !amount) return toast.error("Amount required");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter an amount greater than 0");

    if (type === "transfer") {
      if (!accountId || !toAccountId) return toast.error("From and To accounts required");
      if (accountId === toAccountId) return toast.error("From and To must differ");
      const { error } = await supabase.from("transfers").insert({
        user_id: user.id, date, from_account_id: accountId, to_account_id: toAccountId,
        pay_period_id: null,
        amount: parsedAmount, notes: notes || null,
      });
      if (error) return toast.error(friendlyError(error));
      toast.success("Transfer added");
    } else {
      if (!accountId) return toast.error("Account required");
      const effectivePeriodId = type === "income"
        ? (attachActive && active?.id ? active.id : null)
        : (periodId === "none" ? null : periodId);

      let effectiveNotes: string | null = notes || null;
      if (type === "income") {
        effectiveNotes = incomeSource && notes ? `${incomeSource} — ${notes}` : (incomeSource || notes || null);
      } else if (type === "expense") {
        effectiveNotes = expenseLabel && notes ? `${expenseLabel} — ${notes}` : (expenseLabel || notes || null);
      } else if (type === "withdrawal") {
        effectiveNotes = purpose && notes ? `${purpose} — ${notes}` : (purpose || notes || null);
      }

      const includeBudget = (type === "expense" || type === "withdrawal") && budgetItemId !== "none";

      const { error } = await supabase.from("transactions").insert({
        user_id: user.id, transaction_type: type, date, account_id: accountId,
        category_id: null,
        pay_period_id: effectivePeriodId,
        amount: parsedAmount, notes: effectiveNotes,
        ...(includeBudget ? { budget_item_id: budgetItemId } : {}),
      } as any);
      if (error) return toast.error(friendlyError(error));
      toast.success("Transaction added");
    }
    qc.invalidateQueries();
    nav("/");
  };

  const isTransfer = type === "transfer";
  const isExpenseLike = type === "expense" || type === "withdrawal";

  const dateField = (
    <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
  );
  const amountField = (
    <div><Label>Amount *</Label><Input type="number" inputMode="decimal" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
  );
  const accountField = (
    <div>
      <Label>Account *</Label>
      <Select value={accountId} onValueChange={setAccountId}>
        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
        <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const subtractFromBudgetField = (
    <div>
      <Label>Subtract From Budget</Label>
      <Select value={budgetItemId} onValueChange={setBudgetItemId}>
        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {activeBudgetItems.map(b => {
            const acc = accounts.find(a => a.id === b.account_id);
            return <SelectItem key={b.id} value={b.id}>{b.name}{acc ? ` - ${accLabel(acc)}` : ""}</SelectItem>;
          })}
        </SelectContent>
      </Select>
      {activeBudgetItems.length === 0 && <p className="text-xs text-muted-foreground mt-1">No budget items in active pay period.</p>}
    </div>
  );
  const payPeriodField = (
    <div>
      <Label>Pay Period</Label>
      <Select value={periodId} onValueChange={setPeriodId}>
        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_active ? " (active)" : ""}</SelectItem>)}
        </SelectContent>
      </Select>
      {!active && <p className="text-xs text-muted-foreground mt-1">No active pay period — choose one manually if needed.</p>}
    </div>
  );
  const notesField = (
    <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional details" /></div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-3xl font-bold">Add Transaction</h1><p className="text-muted-foreground mt-1">Record income, expenses, withdrawals, and transfers.</p></div>
      <Card>
        <CardHeader><CardTitle>Transaction Type</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={type} onValueChange={v => { setType(v as TxType); setBudgetItemId("none"); }}>
            <TabsList className="grid grid-cols-4 w-full">
              {TYPES.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground mt-2">{TYPES.find(t => t.value === type)?.desc}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-4">
            {isTransfer ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{dateField}{amountField}</div>
                <div>
                  <Label>From Account *</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To Account *</Label>
                  <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{accounts.filter(a => a.id !== accountId).map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {notesField}
              </>
            ) : type === "income" ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{dateField}{amountField}</div>
                {accountField}
                <div>
                  <Label>Income Source</Label>
                  <Input value={incomeSource} onChange={e => setIncomeSource(e.target.value)} placeholder="e.g. Work Salary, Porch Job, Side Job, Refund, Gift" />
                </div>
                {active ? (
                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <Checkbox id="attach-active" checked={attachActive} onCheckedChange={v => setAttachActive(!!v)} />
                    <Label htmlFor="attach-active" className="cursor-pointer">
                      Attach to Active Pay Period <span className="text-muted-foreground font-normal">({active.name})</span>
                    </Label>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No active pay period to attach this income to.</p>
                )}
                {notesField}
              </>
            ) : type === "expense" ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{dateField}{amountField}</div>
                {subtractFromBudgetField}
                {accountField}
                <div>
                  <Label>Expense</Label>
                  <Input value={expenseLabel} onChange={e => setExpenseLabel(e.target.value)} placeholder="e.g. Ice cream, Gas, Food, Barber, Lunch" />
                </div>
                {payPeriodField}
                {notesField}
              </>
            ) : (
              // withdrawal
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{dateField}{amountField}</div>
                {subtractFromBudgetField}
                {accountField}
                <div>
                  <Label>Purpose</Label>
                  <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Pay Barber, Cash for Food, Help Someone" />
                </div>
                {payPeriodField}
                {notesField}
              </>
            )}
            <Button type="submit" className="w-full">{isTransfer ? "Save Transfer" : "Save Transaction"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
