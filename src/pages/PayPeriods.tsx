import { useState } from "react";
import { useAccounts, usePayPeriods, useTransactions, type PayPeriod } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, Plus, CheckCircle2, Pencil, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { fmtDate, money } from "@/lib/format";

const defaultNext = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 27);
  if (today.getDate() < 27) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 26);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end), name: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
};

import { accountLabel as accLabel } from "@/lib/format";
// (accLabel re-exported)

type FormState = {
  name: string; start: string; end: string;
  income_source: string; account_id: string; net_pay: string; notes: string;
};

const emptyForm = (): FormState => {
  const d = defaultNext();
  return { name: d.name, start: d.start, end: d.end, income_source: "", account_id: "none", net_pay: "", notes: "" };
};

const FormFields = ({ s, set, accounts }: { s: FormState; set: (f: FormState) => void; accounts: { id: string; name: string; bank_name: string | null }[] }) => (
  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 [&>div]:min-w-0">
    <div><Label>From Date</Label><Input type="date" value={s.start} onChange={e => set({ ...s, start: e.target.value })} /></div>
    <div><Label>Until Date</Label><Input type="date" value={s.end} onChange={e => set({ ...s, end: e.target.value })} /></div>
    <div><Label>Income Source</Label><Input value={s.income_source} onChange={e => set({ ...s, income_source: e.target.value })} placeholder="e.g. Fidelity Salary" /></div>
    <div>
      <Label>Account</Label>
      <Select value={s.account_id} onValueChange={v => set({ ...s, account_id: v })}>
        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div><Label>Pay Amount</Label><Input type="number" inputMode="decimal" step="0.01" value={s.net_pay} onChange={e => set({ ...s, net_pay: e.target.value })} placeholder="0.00" /></div>
    <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={s.notes} onChange={e => set({ ...s, notes: e.target.value })} placeholder="Optional" /></div>
  </div>
);

export default function PayPeriods() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: periods = [] } = usePayPeriods();
  const { data: accounts = [] } = useAccounts();
  const { data: transactions = [] } = useTransactions();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<PayPeriod | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  const upsertPaycheckTx = async (
    period: { id: string; start_date: string },
    existingTxId: string | null,
    accountId: string | null,
    amount: number | null,
    incomeSource: string | null,
    notes: string | null,
    date: string,
  ): Promise<string | null> => {
    if (!user) return null;
    const hasIncome = accountId && amount && amount > 0;

    if (existingTxId && !hasIncome) {
      // Remove existing tx → balance will revert via trigger
      await supabase.from("transactions").delete().eq("id", existingTxId);
      return null;
    }
    if (existingTxId && hasIncome) {
      // Update in place. If account changed, trigger on update won't move balances,
      // so we delete+reinsert to leverage existing balance triggers.
      const { data: existing } = await supabase.from("transactions").select("account_id, amount").eq("id", existingTxId).maybeSingle();
      const accountChanged = existing && existing.account_id !== accountId;
      const amountChanged = existing && Number(existing.amount) !== amount;
      if (accountChanged || amountChanged) {
        await supabase.from("transactions").delete().eq("id", existingTxId);
        const { data: ins, error } = await supabase.from("transactions").insert({
          user_id: user.id, transaction_type: "income", date, account_id: accountId!,
          pay_period_id: period.id, amount, notes: incomeSource || notes || "Paycheck",
        }).select("id").single();
        if (error) { toast.error(friendlyError(error)); return existingTxId; }
        return ins.id;
      } else {
        await supabase.from("transactions").update({
          date, notes: incomeSource || notes || "Paycheck", pay_period_id: period.id,
        }).eq("id", existingTxId);
        return existingTxId;
      }
    }
    if (!existingTxId && hasIncome) {
      const { data: ins, error } = await supabase.from("transactions").insert({
        user_id: user.id, transaction_type: "income", date, account_id: accountId!,
        pay_period_id: period.id, amount, notes: incomeSource || notes || "Paycheck",
      }).select("id").single();
      if (error) { toast.error(friendlyError(error)); return null; }
      return ins.id;
    }
    return null;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amt = form.net_pay ? parseFloat(form.net_pay) : null;
    const accountId = form.account_id === "none" ? null : form.account_id;
    const { data: created, error } = await supabase.from("pay_periods").insert({
      user_id: user.id, name: form.name, start_date: form.start, end_date: form.end,
      is_active: periods.length === 0,
      income_source: form.income_source || null,
      paycheck_account_id: accountId,
      net_pay_amount: amt,
      notes: form.notes || null,
    }).select("*").single();
    if (error) return toast.error(friendlyError(error));

    const txId = await upsertPaycheckTx(created, null, accountId, amt, form.income_source, form.notes, form.start);
    if (txId) await supabase.from("pay_periods").update({ paycheck_transaction_id: txId }).eq("id", created.id);

    toast.success("Pay period added");
    setForm(emptyForm());
    qc.invalidateQueries();
  };

  const openEdit = (p: PayPeriod) => {
    setEditing(p);
    setEditForm({
      name: p.name, start: p.start_date, end: p.end_date,
      income_source: p.income_source || "",
      account_id: p.paycheck_account_id || "none",
      net_pay: p.net_pay_amount != null ? String(p.net_pay_amount) : "",
      notes: p.notes || "",
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const amt = editForm.net_pay ? parseFloat(editForm.net_pay) : null;
    const accountId = editForm.account_id === "none" ? null : editForm.account_id;

    const newTxId = await upsertPaycheckTx(
      { id: editing.id, start_date: editForm.start },
      editing.paycheck_transaction_id,
      accountId, amt, editForm.income_source, editForm.notes, editForm.start,
    );

    const { error } = await supabase.from("pay_periods").update({
      name: editForm.name, start_date: editForm.start, end_date: editForm.end,
      income_source: editForm.income_source || null,
      paycheck_account_id: accountId,
      net_pay_amount: amt,
      notes: editForm.notes || null,
      paycheck_transaction_id: newTxId,
    }).eq("id", editing.id);
    if (error) return toast.error(friendlyError(error));

    toast.success("Pay period updated");
    setEditing(null);
    qc.invalidateQueries();
  };

  const setActive = async (id: string) => {
    if (!user) return;
    await supabase.from("pay_periods").update({ is_active: false }).eq("user_id", user.id);
    await supabase.from("pay_periods").update({ is_active: true }).eq("id", id);
    toast.success("Active period set");
    qc.invalidateQueries({ queryKey: ["pay_periods"] });
  };

  const del = async (p: PayPeriod) => {
    if (p.paycheck_transaction_id) await supabase.from("transactions").delete().eq("id", p.paycheck_transaction_id);
    const { error } = await supabase.from("pay_periods").delete().eq("id", p.id);
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries();
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Pay Periods</h1><p className="text-muted-foreground mt-1">Create a pay period and optionally record your paycheck income at the same time.</p></div>

      <Card>
        <CardHeader><CardTitle>New Pay Period</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-4">
            <FormFields s={form} set={setForm} accounts={accounts} />
            <Button type="submit"><Plus className="h-4 w-4 mr-1" />Add Period</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All Pay Periods</CardTitle></CardHeader>
        <CardContent>
          {periods.length === 0 && <p className="text-sm text-muted-foreground">No pay periods yet.</p>}
          <div className="divide-y">
            {periods.map(p => {
              const acc = accounts.find(a => a.id === p.paycheck_account_id);
              const incomes = transactions.filter(t => t.transaction_type === "income" && t.pay_period_id === p.id);
              return (
              <div key={p.id} className={`py-3 px-2 ${p.is_active ? "bg-primary/5 rounded-lg" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                      {p.is_active && <Badge className="bg-primary text-primary-foreground">Active</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.income_source || "—"}{acc ? ` · ${accLabel(acc)}` : ""}
                    </div>
                    {p.net_pay_amount != null && (
                      <div className="text-xs text-income mt-0.5">+{money(p.net_pay_amount)}</div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!p.is_active && <Button variant="outline" size="sm" onClick={() => setActive(p.id)}><CheckCircle2 className="h-4 w-4 mr-1" />Set active</Button>}
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => del(p)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Collapsible className="mt-2">
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
                    <ChevronDown className="h-3 w-3 transition-transform" />
                    Income ({incomes.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-1">
                    {incomes.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-4">No income attached.</p>
                    ) : incomes.map(t => {
                      const ia = accounts.find(a => a.id === t.account_id);
                      return (
                        <div key={t.id} className="flex items-center justify-between text-xs pl-4 py-1 border-l-2 border-income/40">
                          <div className="min-w-0 truncate">
                            <span className="text-muted-foreground">{fmtDate(t.date)}</span>
                            <span className="mx-1">·</span>
                            <span className="font-medium">{t.notes || "Income"}</span>
                            {ia && <><span className="mx-1">·</span><span className="text-muted-foreground">{accLabel(ia)}</span></>}
                          </div>
                          <div className="text-income font-medium tabular-nums shrink-0">+{money(t.amount)}</div>
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Pay Period</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <FormFields s={editForm} set={setEditForm} accounts={accounts} />
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
