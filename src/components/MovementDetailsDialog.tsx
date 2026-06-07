import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { money, fmtDate, accountLabel } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useBudgetItems, useCategories, usePayPeriods, type Transaction, type Transfer } from "@/hooks/useFinanceData";
import { parseTxNotes, buildTxNotes } from "@/lib/txNotes";
import { addPendingMovement, isNetworkError } from "@/lib/offlineQueue";
import { withTimeout, isLikelyNetworkOrTimeoutError } from "@/lib/networkSync";

export type MovementRef =
  | { kind: "tx"; record: Transaction; balanceBefore?: number; balanceAfter?: number }
  | { kind: "transfer"; record: Transfer; balanceBefore?: number; balanceAfter?: number };

type Mode = "view" | "edit" | "replace" | "repeat";
type ReplaceType = "income" | "expense" | "transfer";

export function MovementDetailsDialog({
  open,
  onOpenChange,
  movement,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  movement: MovementRef | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const { data: periods = [] } = usePayPeriods();

  const [mode, setMode] = useState<Mode>("view");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const replaceAmountRef = useRef<HTMLInputElement>(null);
  const repeatAmountRef = useRef<HTMLInputElement>(null);

  // Edit fields
  const [eDate, setEDate] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eAccountId, setEAccountId] = useState("");
  const [eToAccountId, setEToAccountId] = useState("");
  const [eLabel, setELabel] = useState("");
  const [eNotes, setENotes] = useState("");

  // Replace fields
  const [rType, setRType] = useState<ReplaceType>("expense");
  const [rDate, setRDate] = useState("");
  const [rAmount, setRAmount] = useState("");
  const [rAccountId, setRAccountId] = useState("");
  const [rToAccountId, setRToAccountId] = useState("");
  const [rLabel, setRLabel] = useState("");
  const [rNotes, setRNotes] = useState("");
  const [rPeriodId, setRPeriodId] = useState<string>("none");

  // Repeat fields (independent of replace)
  const [pType, setPType] = useState<ReplaceType>("expense");
  const [pDate, setPDate] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pAccountId, setPAccountId] = useState("");
  const [pToAccountId, setPToAccountId] = useState("");
  const [pLabel, setPLabel] = useState("");
  const [pNotes, setPNotes] = useState("");
  const [pPeriodId, setPPeriodId] = useState<string>("none");
  const [pCategoryId, setPCategoryId] = useState<string | null>(null);
  const [pBudgetItemId, setPBudgetItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("view");
    setConfirmDelete(false);
    if (!movement) return;
    const rec: any = movement.record;
    if (movement.kind === "tx") {
      const parsed = parseTxNotes(rec.notes);
      setEDate(rec.date);
      setEAmount(String(rec.amount));
      setEAccountId(rec.account_id);
      setELabel(parsed.label || "");
      setENotes(parsed.notes || "");
      // Replace defaults
      setRType((rec.transaction_type === "income" ? "income" : "expense"));
      setRDate(rec.date);
      setRAmount(String(rec.amount));
      setRAccountId(rec.account_id);
      setRToAccountId("");
      setRLabel(parsed.label || "");
      setRNotes(parsed.notes || "");
      setRPeriodId(rec.pay_period_id || "none");
    } else {
      setEDate(rec.date);
      setEAmount(String(rec.amount));
      setEAccountId(rec.from_account_id);
      setEToAccountId(rec.to_account_id);
      setENotes(rec.notes || "");
      setELabel("");
      setRType("transfer");
      setRDate(rec.date);
      setRAmount(String(rec.amount));
      setRAccountId(rec.from_account_id);
      setRToAccountId(rec.to_account_id);
      setRNotes(rec.notes || "");
      setRPeriodId(rec.pay_period_id || "none");
      setRLabel("");
    }
    // Repeat defaults — date defaults to today (local), all other fields copied
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (movement.kind === "tx") {
      const parsed = parseTxNotes(rec.notes);
      setPType(rec.transaction_type === "income" ? "income" : "expense");
      setPDate(todayStr);
      setPAmount(String(rec.amount));
      setPAccountId(rec.account_id);
      setPToAccountId("");
      setPLabel(parsed.label || "");
      setPNotes(parsed.notes || "");
      setPPeriodId(rec.pay_period_id || "none");
      setPCategoryId(rec.category_id || null);
      setPBudgetItemId(rec.budget_item_id || null);
    } else {
      setPType("transfer");
      setPDate(todayStr);
      setPAmount(String(rec.amount));
      setPAccountId(rec.from_account_id);
      setPToAccountId(rec.to_account_id);
      setPLabel("");
      setPNotes(rec.notes || "");
      setPPeriodId(rec.pay_period_id || "none");
      setPCategoryId(null);
      setPBudgetItemId(null);
    }
  }, [open, movement?.kind, movement?.record?.id]);

  // Auto-focus removed intentionally so mobile keyboard does not pop up automatically.

  if (!movement) return null;

  const accName = (id: string) => {
    const a = accounts.find(x => x.id === id);
    return a ? accountLabel(a) : "—";
  };
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name ?? null;
  const periodName = (id: string | null) => periods.find(p => p.id === id)?.name ?? null;

  const isTx = movement.kind === "tx";
  const rec: any = movement.record;
  const parsedNotes = isTx ? parseTxNotes(rec.notes) : { label: null, notes: rec.notes };
  const label = isTx
    ? (parsedNotes.label || catName(rec.category_id) || rec.transaction_type)
    : `Transfer ${accName(rec.from_account_id)} → ${accName(rec.to_account_id)}`;

  const amount = Number(rec.amount);
  const type = isTx ? rec.transaction_type : "transfer";
  const isIn = isTx ? (type === "income" || type === "deposit") : false;
  const signClass = !isTx ? "text-transfer" : isIn ? "text-income" : "text-expense";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transfers"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries();
  };

  const saveEdit = async () => {
    const parsedAmount = parseFloat(eAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter an amount greater than 0");
    if (!eDate) return toast.error("Date required");
    setSaving(true);
    try {
      if (isTx) {
        if (!eAccountId) throw new Error("Account required");
        const newNotes = buildTxNotes(eLabel.trim() || parsedNotes.label, eNotes.trim() || null);
        const { error } = await supabase.from("transactions").update({
          date: eDate,
          amount: parsedAmount,
          account_id: eAccountId,
          notes: newNotes,
        }).eq("id", rec.id);
        if (error) throw error;
      } else {
        if (!eAccountId || !eToAccountId) throw new Error("Both accounts required");
        if (eAccountId === eToAccountId) throw new Error("From and To must differ");
        const { error } = await supabase.from("transfers").update({
          date: eDate,
          amount: parsedAmount,
          from_account_id: eAccountId,
          to_account_id: eToAccountId,
          notes: eNotes.trim() || null,
        }).eq("id", rec.id);
        if (error) throw error;
      }
      toast.success("Saved");
      invalidate();
      setMode("view");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      const table = isTx ? "transactions" : "transfers";
      const { error } = await supabase.from(table).delete().eq("id", rec.id);
      if (error) throw error;
      toast.success("Deleted");
      invalidate();
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const doReplace = async () => {
    if (!user) return toast.error("Not authenticated");
    const parsedAmount = parseFloat(rAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter an amount greater than 0");
    if (!rDate) return toast.error("Date required");

    setSaving(true);
    try {
      let newId: string | null = null;
      let newTable: "transactions" | "transfers" = "transactions";
      if (rType === "transfer") {
        if (!rAccountId || !rToAccountId) throw new Error("From and To accounts required");
        if (rAccountId === rToAccountId) throw new Error("From and To must differ");
        const { data, error } = await supabase.from("transfers").insert({
          user_id: user.id, date: rDate, from_account_id: rAccountId, to_account_id: rToAccountId,
          pay_period_id: rPeriodId === "none" ? null : rPeriodId,
          amount: parsedAmount, notes: rNotes.trim() || null,
        }).select("id").single();
        if (error) throw error;
        newId = data!.id; newTable = "transfers";
      } else {
        if (!rAccountId) throw new Error("Account required");
        const effectiveNotes = buildTxNotes(rLabel.trim() || null, rNotes.trim() || null);
        const { data, error } = await supabase.from("transactions").insert({
          user_id: user.id, transaction_type: rType, date: rDate, account_id: rAccountId,
          category_id: null,
          pay_period_id: rPeriodId === "none" ? null : rPeriodId,
          amount: parsedAmount, notes: effectiveNotes,
        } as any).select("id").single();
        if (error) throw error;
        newId = data!.id; newTable = "transactions";
      }

      // Now delete old. If this fails, attempt to roll back new insert.
      const oldTable = isTx ? "transactions" : "transfers";
      const { error: delErr } = await supabase.from(oldTable).delete().eq("id", rec.id);
      if (delErr) {
        // rollback
        await supabase.from(newTable).delete().eq("id", newId!);
        throw delErr;
      }
      toast.success("Replaced");
      invalidate();
      setMode("view");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const doRepeat = async () => {
    if (!user) return toast.error("Not authenticated");
    const parsedAmount = parseFloat(pAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return toast.error("Enter an amount greater than 0");
    if (!pDate) return toast.error("Date required");

    let kind: "transaction" | "transfer";
    let payload: Record<string, any>;
    if (pType === "transfer") {
      if (!pAccountId) return toast.error("From account required");
      if (!pToAccountId) return toast.error("To account required");
      if (pAccountId === pToAccountId) return toast.error("From and To must differ");
      kind = "transfer";
      payload = {
        user_id: user.id, date: pDate, from_account_id: pAccountId, to_account_id: pToAccountId,
        pay_period_id: pPeriodId === "none" ? null : pPeriodId,
        amount: parsedAmount, notes: pNotes.trim() || null,
      };
    } else {
      if (!pAccountId) return toast.error("Account required");
      const effectiveNotes = buildTxNotes(pLabel.trim() || null, pNotes.trim() || null);
      kind = "transaction";
      payload = {
        user_id: user.id, transaction_type: pType, date: pDate, account_id: pAccountId,
        category_id: pCategoryId,
        budget_item_id: pBudgetItemId,
        pay_period_id: pPeriodId === "none" ? null : pPeriodId,
        amount: parsedAmount, notes: effectiveNotes,
      };
    }

    setSaving(true);

    const queueOffline = (reason: "offline" | "network") => {
      addPendingMovement(kind, payload);
      toast.success(reason === "offline"
        ? "Saved offline. It will sync when you're back online."
        : "Connection issue. Saved offline for sync.");
      invalidate();
      setSaving(false);
      setMode("view");
      onOpenChange(false);
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) return queueOffline("offline");

    try {
      const table = kind === "transfer" ? "transfers" : "transactions";
      const res: any = await withTimeout(
        supabase.from(table as any).insert(payload as any) as unknown as Promise<any>,
        7000,
        `repeat-${table}-insert`,
      );
      const error = res?.error;
      if (error) {
        if (isLikelyNetworkOrTimeoutError(error)) return queueOffline("network");
        throw error;
      }
      toast.success("Repeated");
      invalidate();
      setMode("view");
      onOpenChange(false);
    } catch (e: any) {
      if (isLikelyNetworkOrTimeoutError(e)) return queueOffline("network");
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "edit" ? "Edit" : mode === "replace" ? "Replace" : mode === "repeat" ? "Repeat" : label;
  const desc = mode === "edit"
    ? "Update details. Transaction type can't be changed here — use Replace."
    : mode === "replace"
    ? "Create a corrected transaction. The old one is removed only after the new one is saved."
    : mode === "repeat"
    ? "Create a new movement from this one. The original is kept unchanged."
    : (isTx ? "Transaction details" : "Transfer details");

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription>{desc}</DialogDescription>
          </DialogHeader>

          {mode === "view" && (
            <div className="space-y-3 text-sm">
              <div className={`text-2xl font-bold tabular-nums ${signClass}`}>
                {isTx ? (isIn ? "+" : "-") : ""}{money(amount)}
              </div>

              <DetailRow label="Type" value={<span className="capitalize">{type}</span>} />
              <DetailRow label="Date" value={fmtDate(rec.date)} />

              {isTx ? (
                <>
                  <DetailRow label="Account" value={accName(rec.account_id)} />
                  {catName(rec.category_id) && <DetailRow label="Category" value={catName(rec.category_id)!} />}
                </>
              ) : (
                <>
                  <DetailRow label="From" value={accName(rec.from_account_id)} />
                  <DetailRow label="To" value={accName(rec.to_account_id)} />
                </>
              )}

              {periodName(rec.pay_period_id) && (
                <DetailRow label="Pay Period" value={periodName(rec.pay_period_id)!} />
              )}

              {(movement.balanceBefore !== undefined || movement.balanceAfter !== undefined) && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
                  {movement.balanceBefore !== undefined && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Balance before</span><span className="tabular-nums font-medium">{money(movement.balanceBefore)}</span></div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{type}</span>
                    <span className={`tabular-nums font-medium ${signClass}`}>{isTx ? (isIn ? "+" : "-") : (movement.balanceAfter! >= (movement.balanceBefore ?? 0) ? "+" : "-")}{money(Math.abs(amount))}</span>
                  </div>
                  {movement.balanceAfter !== undefined && (
                    <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Balance after</span><span className="tabular-nums font-semibold">{money(movement.balanceAfter)}</span></div>
                  )}
                </div>
              )}

              <div className="pt-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes</Label>
                <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/90">
                  {parsedNotes.notes || <span className="text-muted-foreground italic">No notes added.</span>}
                </p>
              </div>
            </div>
          )}

          {mode === "edit" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={eDate} onChange={e => setEDate(e.target.value)} />
                </div>
                <div>
                  <Label>Amount</Label>
                  <MoneyInput value={eAmount} onChange={setEAmount} />
                </div>
              </div>

              {isTx ? (
                <>
                  <div>
                    <Label>Account</Label>
                    <Select value={eAccountId} onValueChange={setEAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{type === "income" ? "Source" : "Label"}</Label>
                    <Input value={eLabel} onChange={e => setELabel(e.target.value)} placeholder={type === "income" ? "e.g. Salary" : "e.g. Groceries"} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>From Account</Label>
                    <Select value={eAccountId} onValueChange={setEAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To Account</Label>
                    <Select value={eToAccountId} onValueChange={setEToAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.filter(a => a.id !== eAccountId).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea value={eNotes} onChange={e => setENotes(e.target.value)} placeholder="No notes added." rows={3} />
              </div>

              <p className="text-xs text-muted-foreground">To change the transaction type, use Replace instead.</p>
            </div>
          )}

          {mode === "replace" && (
            <div className="space-y-3">
              <div>
                <Label>Transaction Type</Label>
                <Tabs value={rType} onValueChange={v => setRType(v as ReplaceType)}>
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="income">Income</TabsTrigger>
                    <TabsTrigger value="expense">Expense</TabsTrigger>
                    <TabsTrigger value="transfer">Transfer</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={rDate} onChange={e => setRDate(e.target.value)} />
                </div>
                <div>
                  <Label>Amount</Label>
                  <MoneyInput ref={replaceAmountRef} value={rAmount} onChange={setRAmount} />
                </div>
              </div>

              {rType === "transfer" ? (
                <>
                  <div>
                    <Label>From Account</Label>
                    <Select value={rAccountId} onValueChange={setRAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To Account</Label>
                    <Select value={rToAccountId} onValueChange={setRToAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.filter(a => a.id !== rAccountId).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Account</Label>
                    <Select value={rAccountId} onValueChange={setRAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{rType === "income" ? "Source" : "Label"}</Label>
                    <Input value={rLabel} onChange={e => setRLabel(e.target.value)} placeholder={rType === "income" ? "e.g. Salary" : "e.g. Groceries"} />
                  </div>
                </>
              )}

              <div>
                <Label>Pay Period</Label>
                <Select value={rPeriodId} onValueChange={setRPeriodId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_active ? " (active)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={rNotes} onChange={e => setRNotes(e.target.value)} rows={3} />
              </div>
            </div>
          )}

          {mode === "repeat" && (
            <div className="space-y-3">
              {!isTx ? (
                <p className="text-xs text-muted-foreground">Repeating a transfer.</p>
              ) : (
                <div>
                  <Label>Transaction Type</Label>
                  <Tabs value={pType} onValueChange={v => setPType(v as ReplaceType)}>
                    <TabsList className="grid grid-cols-3 w-full">
                      <TabsTrigger value="income">Income</TabsTrigger>
                      <TabsTrigger value="expense">Expense</TabsTrigger>
                      <TabsTrigger value="transfer">Transfer</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={pDate} onChange={e => setPDate(e.target.value)} />
                </div>
                <div>
                  <Label>Amount</Label>
                  <MoneyInput ref={repeatAmountRef} value={pAmount} onChange={setPAmount} />
                </div>
              </div>

              {pType === "transfer" ? (
                <>
                  <div>
                    <Label>From Account</Label>
                    <Select value={pAccountId} onValueChange={setPAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To Account</Label>
                    <Select value={pToAccountId} onValueChange={setPToAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.filter(a => a.id !== pAccountId).map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Account</Label>
                    <Select value={pAccountId} onValueChange={setPAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{pType === "income" ? "Source" : "Label"}</Label>
                    <Input value={pLabel} onChange={e => setPLabel(e.target.value)} placeholder={pType === "income" ? "e.g. Salary" : "e.g. Groceries"} />
                  </div>
                </>
              )}

              <div>
                <Label>Pay Period</Label>
                <Select value={pPeriodId} onValueChange={setPPeriodId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_active ? " (active)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={pNotes} onChange={e => setPNotes(e.target.value)} rows={3} />
              </div>

              <p className="text-xs text-muted-foreground">A new movement will be created. The original is kept unchanged.</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
            {mode === "view" && (
              <>
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
                <Button variant="outline" onClick={() => setMode("replace")}>Replace</Button>
                <Button variant="outline" onClick={() => setMode("repeat")}>Repeat</Button>
                <Button variant="outline" onClick={() => setMode("edit")}>Edit</Button>
                <Button onClick={() => onOpenChange(false)}>Close</Button>
              </>
            )}
            {mode === "edit" && (
              <>
                <Button variant="outline" onClick={() => setMode("view")} disabled={saving}>Cancel</Button>
                <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              </>
            )}
            {mode === "replace" && (
              <>
                <Button variant="outline" onClick={() => setMode("view")} disabled={saving}>Cancel</Button>
                <Button onClick={doReplace} disabled={saving}>{saving ? "Replacing..." : "Confirm Replace"}</Button>
              </>
            )}
            {mode === "repeat" && (
              <>
                <Button variant="outline" onClick={() => setMode("view")} disabled={saving}>Cancel</Button>
                <Button
                  onClick={doRepeat}
                  disabled={
                    saving ||
                    !pDate ||
                    !(parseFloat(pAmount) > 0) ||
                    !pAccountId ||
                    (pType === "transfer" && (!pToAccountId || pAccountId === pToAccountId))
                  }
                >
                  {saving ? "Repeating..." : "Confirm Repeat"}
                </Button>
              </>
            )}
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !saving && setConfirmDelete(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {isTx ? "transaction" : "transfer"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the record and update account balances. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={saving}>{saving ? "Deleting..." : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right min-w-0 truncate">{value}</span>
    </div>
  );
}
