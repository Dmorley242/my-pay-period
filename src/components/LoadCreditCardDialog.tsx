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
import { accountLabel, money } from "@/lib/format";
import type { Account, PayPeriod } from "@/hooks/useFinanceData";
import { addPendingMovement, isNetworkError } from "@/lib/offlineQueue";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isCreditCard = (a: Account) => (a.account_type || "").toLowerCase() === "credit card";

const LS_FROM = "loadCC:lastFromId";
const LS_TO = "loadCC:lastToId";
const DEFAULT_NOTE = "Load Credit Card";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: Account[];
  activePeriod: PayPeriod | null;
  selectedAccountId?: string | null;
}

export function LoadCreditCardDialog({ open, onOpenChange, accounts, activePeriod, selectedAccountId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const fundingAccounts = useMemo(() => accounts.filter(a => !isCreditCard(a)), [accounts]);
  const creditCards = useMemo(() => accounts.filter(isCreditCard), [accounts]);

  const [date, setDate] = useState(todayLocal());
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState(DEFAULT_NOTE);
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDate(todayLocal());
    setAmount("");
    setNotes(DEFAULT_NOTE);

    // Default From
    const lastFrom = typeof window !== "undefined" ? localStorage.getItem(LS_FROM) : null;
    const selected = selectedAccountId ? accounts.find(a => a.id === selectedAccountId) : null;
    let nextFrom = "";
    if (selected && !isCreditCard(selected)) {
      nextFrom = selected.id;
    } else if (lastFrom && fundingAccounts.some(a => a.id === lastFrom)) {
      nextFrom = lastFrom;
    }
    setFromId(nextFrom);

    // Default To
    let nextTo = "";
    if (creditCards.length === 1) {
      nextTo = creditCards[0].id;
    } else if (creditCards.length > 1) {
      const lastTo = typeof window !== "undefined" ? localStorage.getItem(LS_TO) : null;
      if (lastTo && creditCards.some(a => a.id === lastTo)) nextTo = lastTo;
    }
    setToId(nextTo);

    setTimeout(() => amountRef.current?.focus(), 60);
  }, [open]);

  const parsed = parseFloat(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);
  const fromValid = !!fromAcc && !isCreditCard(fromAcc);
  const toValid = !!toAcc && isCreditCard(toAcc);
  const sameAcc = fromId && toId && fromId === toId;
  const canConfirm = !!user && fromValid && toValid && amountValid && !!date && !sameAcc && !saving;

  const confirm = async () => {
    if (!user) return toast.error("Not signed in");
    if (!fromValid) return toast.error("Please select the account you are loading the credit card from.");
    if (!toValid) return toast.error("Please select a Credit Card account to load.");
    if (sameAcc) return toast.error("From and To accounts must be different");
    if (!amountValid) return toast.error("Enter an amount greater than 0");

    setSaving(true);
    const payload = {
      user_id: user.id,
      date,
      from_account_id: fromId,
      to_account_id: toId,
      pay_period_id: activePeriod?.id ?? null,
      amount: parsed,
      notes: notes?.trim() ? notes.trim() : DEFAULT_NOTE,
    };

    const queueOffline = (reason: "offline" | "network") => {
      addPendingMovement("transfer", payload);
      try {
        localStorage.setItem(LS_FROM, fromId);
        localStorage.setItem(LS_TO, toId);
      } catch {}
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
      const { error } = await supabase.from("transfers").insert(payload);
      if (error) {
        if (isNetworkError(error)) return queueOffline("network");
        setSaving(false);
        return toast.error(friendlyError(error));
      }
      try {
        localStorage.setItem(LS_FROM, fromId);
        localStorage.setItem(LS_TO, toId);
      } catch {}
      toast.success("Credit card loaded");
      qc.invalidateQueries();
      setSaving(false);
      onOpenChange(false);
    } catch (e: any) {
      if (isNetworkError(e)) return queueOffline("network");
      setSaving(false);
      toast.error(friendlyError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Load Credit Card</DialogTitle>
        </DialogHeader>

        {creditCards.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No Credit Card accounts found. Please create an account with type "Credit Card" first.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Amount *</Label>
              <MoneyInput value={amount} onChange={setAmount} autoFocus />
            </div>
            <div>
              <Label>From Account *</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger><SelectValue placeholder="Select funding account" /></SelectTrigger>
                <SelectContent>
                  {fundingAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{accountLabel(a)} — {money(a.current_balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!fromValid && (
                <p className="text-xs text-muted-foreground mt-1">Please select the account you are loading the credit card from.</p>
              )}
            </div>
            <div>
              <Label>To Credit Card *</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue placeholder="Select credit card" /></SelectTrigger>
                <SelectContent>
                  {creditCards.map(a => (
                    <SelectItem key={a.id} value={a.id}>{accountLabel(a)} — {money(a.current_balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            {sameAcc && (
              <p className="text-xs text-destructive">From and To accounts must be different.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          {creditCards.length > 0 && (
            <Button onClick={confirm} disabled={!canConfirm}>{saving ? "Saving…" : "Confirm"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LoadCreditCardDialog;
