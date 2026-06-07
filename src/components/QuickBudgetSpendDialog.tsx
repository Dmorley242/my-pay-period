import { useEffect, useMemo, useRef, useState } from "react";
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
import { addPendingMovement, isNetworkError } from "@/lib/offlineQueue";
import { withTimeout, isLikelyNetworkOrTimeoutError } from "@/lib/networkSync";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const lsKey = (budgetItemId: string) => `quickSpend:lastAccount:${budgetItemId}`;

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
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && budgetItem) {
      setDate(todayLocal());
      setBudgetItemId(budgetItem.id);
      setAmount("");
      setNotes("");

      // Default account: last-used for this budget item, else linked account
      let nextAccount = budgetItem.account_id;
      try {
        const last = localStorage.getItem(lsKey(budgetItem.id));
        if (last && accounts.some(a => a.id === last)) nextAccount = last;
      } catch {}
      setAccountId(nextAccount);
    }
  }, [open, budgetItem, accounts]);

  const periodItems = useMemo(
    () => (activePeriod ? budgetItems.filter(b => b.pay_period_id === activePeriod.id) : []),
    [activePeriod, budgetItems],
  );

  const parsed = parseFloat(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const dateValid = !!date;
  const accountValid = !!accountId && accounts.some(a => a.id === accountId);
  const budgetValid = !!budgetItemId;
  const canConfirm = !!user && amountValid && dateValid && accountValid && budgetValid && !saving;

  const confirm = async () => {
    if (!user) return toast.error("Not signed in");
    if (!amountValid) return toast.error("Enter an amount greater than 0");
    if (!dateValid) return toast.error("Date is required");
    if (!accountValid) return toast.error("Account is required");
    if (!budgetValid) return toast.error("Budget item is required");
    setSaving(true);

    const payload = {
      user_id: user.id,
      transaction_type: "expense",
      date,
      account_id: accountId,
      category_id: null,
      pay_period_id: activePeriod?.id ?? null,
      amount: parsed,
      notes: notes || null,
      budget_item_id: budgetItemId,
    };

    const queueOffline = (reason: "offline" | "network") => {
      addPendingMovement("transaction", payload);
      try { localStorage.setItem(lsKey(budgetItemId), accountId); } catch {}
      toast.success(
        reason === "offline"
          ? "Saved offline. It will sync when you're back online."
          : "Connection issue. Saved offline for sync.",
      );
      setSaving(false);
      onOpenChange(false);
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return queueOffline("offline");
    }

    try {
      const res: any = await withTimeout(
        supabase.from("transactions").insert(payload as any) as unknown as Promise<any>,
        7000,
        "quick-spend-insert",
      );
      const error = res?.error;
      if (error) {
        if (isLikelyNetworkOrTimeoutError(error)) return queueOffline("network");
        setSaving(false);
        return toast.error(friendlyError(error));
      }
      try { localStorage.setItem(lsKey(budgetItemId), accountId); } catch {}
      toast.success("Expense added");
      qc.invalidateQueries();
      setSaving(false);
      onOpenChange(false);
    } catch (e: any) {
      if (isLikelyNetworkOrTimeoutError(e)) return queueOffline("network");
      setSaving(false);
      toast.error(friendlyError(e));
    }
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
            <MoneyInput ref={amountRef} value={amount} onChange={setAmount} />

            {!amountValid && amount !== "" && (
              <p className="text-xs text-destructive mt-1">Amount must be greater than 0.</p>
            )}
          </div>
          <div>
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            {!dateValid && <p className="text-xs text-destructive mt-1">Date is required.</p>}
          </div>
          <div>
            <Label>Account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
            {!accountValid && <p className="text-xs text-destructive mt-1">Account is required.</p>}
          </div>
          <div>
            <Label>Budget Item *</Label>
            <Select value={budgetItemId} onValueChange={setBudgetItemId}>
              <SelectTrigger><SelectValue placeholder="Select budget item" /></SelectTrigger>
              <SelectContent>
                {periodItems.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!budgetValid && <p className="text-xs text-destructive mt-1">Budget item is required.</p>}
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What was this for?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={confirm} disabled={!canConfirm}>{saving ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QuickBudgetSpendDialog;
