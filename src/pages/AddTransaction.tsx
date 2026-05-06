import { useEffect, useState } from "react";
import { useAccounts, useCategories, usePayPeriods, useActivePayPeriod } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";

const TYPES = [
  { value: "income", label: "Income", desc: "Money in (e.g. salary)" },
  { value: "expense", label: "Expense", desc: "Money spent" },
  { value: "deposit", label: "Deposit", desc: "Increase account balance" },
  { value: "withdrawal", label: "Withdrawal", desc: "Decrease account balance" },
];

export default function AddTransaction() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: periods = [] } = usePayPeriods();
  const active = useActivePayPeriod();

  const initialType = searchParams.get("type");
  const safeInitialType = ["income", "expense", "deposit", "withdrawal"].includes(initialType || "")
    ? (initialType as "income" | "expense" | "deposit" | "withdrawal")
    : "expense";

  const [type, setType] = useState<"income" | "expense" | "deposit" | "withdrawal">(safeInitialType);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [periodId, setPeriodId] = useState<string>(active?.id || "none");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (active?.id && periodId === "none") setPeriodId(active.id);
  }, [active?.id, periodId]);

  const filteredCats = categories.filter(c => {
    if (type === "income" || type === "deposit") return c.category_type === "income" || c.category_type === "both";
    return c.category_type === "expense" || c.category_type === "both";
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!user || !accountId || !amount) return toast.error("Account and amount required");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter an amount greater than 0");
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id, transaction_type: type, date, account_id: accountId,
      category_id: categoryId === "none" ? null : categoryId,
      pay_period_id: periodId === "none" ? null : periodId,
      amount: parsedAmount, notes: notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Transaction added");
    qc.invalidateQueries();
    nav("/");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-3xl font-bold">Add Transaction</h1><p className="text-muted-foreground mt-1">Record income, expenses, deposits, and withdrawals.</p></div>
      <Card>
        <CardHeader><CardTitle>Transaction Type</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={type} onValueChange={v => { setType(v as any); setCategoryId("none"); }}>
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
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><Label>Amount *</Label><Input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
            </div>
            <div>
              <Label>Account *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {filteredCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pay Period</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_active ? " (active)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional details" /></div>
            <Button type="submit" className="w-full">Save Transaction</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
