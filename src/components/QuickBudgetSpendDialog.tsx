import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/MoneyInput";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { accountLabel } from "@/lib/format";
import type { Account, BudgetItem, PayPeriod } from "@/hooks/useFinanceData";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  budgetItem: BudgetItem | null;
  accounts: Account[];
  budgetItems: BudgetItem[];
  activePeriod: PayPeriod | null;
}

export function QuickBudgetSpendDialog({ open, onOpenChange, budgetItem, accounts, budgetItems, activePeriod }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayLocal());
  const [accountId, setAccountId] = useState("");
  const [budgetItemId, setBudgetItemId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && budgetItem) {
      setDate(todayLocal());
      setAccountId(budgetItem.account_id);
      setBudgetItemId(budgetItem.id);
      setAmount("");
      setNotes("");
    }
  }, [open, budgetItem]);

  const periodItems = activePeriod ? budgetItems.filter(b => b.pay_period_id === activePeriod.id) : [];

  const confirm = async () => {
    if (!user) return toast.error("Not signed in");
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return toast.error("Enter an amount greater than 0");
    if (!accountId) return toast.error("Account required");
    if (!budgetItemId) return toast.error("Budget item required");
    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      transaction_type: "expense",
      date,
      account_id: accountId,
      category_id: null,
      pay_period_id: activePeriod?.id ?? null,
      amount: parsed,
      notes: notes || null,
      budget_item_id: budgetItemId,
    } as any);
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Expense added");
    qc.invalidateQueries();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick spend{budgetItem ? ` · ${budgetItem.name}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount *</Label>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Budget Item</Label>
            <Select value={budgetItemId} onValueChange={setBudgetItemId}>
              <SelectTrigger><SelectValue placeholder="Select budget item" /></SelectTrigger>
              <SelectContent>
                {periodItems.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What was this for?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={confirm} disabled={saving}>{saving ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QuickBudgetSpendDialog;
