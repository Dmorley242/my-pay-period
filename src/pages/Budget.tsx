import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts, useActivePayPeriod, useBudgetItems, useBudgetSubItems, useTransactions } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { money, fmtDate } from "@/lib/format";
import { Plus, Trash2, Pencil, Wallet, ChevronDown, ChevronUp, ListTree } from "lucide-react";

const accLabel = (a: { bank_name: string | null; name: string }) => a.bank_name ? `${a.bank_name} - ${a.name}` : a.name;

export default function Budget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const active = useActivePayPeriod();
  const { data: accounts = [] } = useAccounts();
  const { data: items = [] } = useBudgetItems();
  const { data: txs = [] } = useTransactions();
  const { data: subItems = [] } = useBudgetSubItems();

  const periodItems = useMemo(() => active ? items.filter(i => i.pay_period_id === active.id) : [], [items, active]);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [templateNameOpen, setTemplateNameOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const [editing, setEditing] = useState<null | { id: string; name: string; account_id: string; budget_amount: string }>(null);

  const spentByItem = useMemo(() => {
    const m = new Map<string, number>();
    txs.forEach(t => {
      const bid = (t as any).budget_item_id as string | null | undefined;
      if (bid && t.transaction_type === "expense") m.set(bid, (m.get(bid) || 0) + Number(t.amount));
    });
    return m;
  }, [txs]);

  const payAmount = Number(active?.net_pay_amount ?? 0);
  const totalBudgeted = periodItems.reduce((s, i) => s + Number(i.budget_amount), 0);
  const totalSpent = periodItems.reduce((s, i) => s + (spentByItem.get(i.id) || 0), 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const remainingToAssign = payAmount - totalBudgeted;
  const depositAccount = accounts.find(a => a.id === active?.paycheck_account_id);

  const reset = () => { setName(""); setAccountId(""); setAmount(""); };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !active) return toast.error("No active pay period");
    if (!name || !accountId || !amount) return toast.error("Name, account, amount required");
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be > 0");
    const { error } = await (supabase as any).from("budget_items").insert({
      user_id: user.id, pay_period_id: active.id, account_id: accountId,
      name, budget_amount: amt,
    });
    if (error) return toast.error(error.message);
    toast.success("Budget item added");
    qc.invalidateQueries({ queryKey: ["budget_items"] });
    reset();
  };

  const remove = async (id: string) => {
    const linked = txs.some(t => (t as any).budget_item_id === id);
    if (linked) return toast.error("Cannot delete: this budget item has linked transactions.");
    if (!confirm("Delete this budget item?")) return;
    const { error } = await (supabase as any).from("budget_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["budget_items"] });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const amt = parseFloat(editing.budget_amount);
    if (!editing.name || !editing.account_id || !Number.isFinite(amt) || amt <= 0) return toast.error("Fill all fields");
    const { error } = await (supabase as any).from("budget_items").update({
      name: editing.name, account_id: editing.account_id, budget_amount: amt,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["budget_items"] });
    setEditing(null);
  };

  const justPublish = () => {
    setPublishConfirmOpen(false);
    reset();
    setBuilderOpen(false);
    toast.success("Budget published");
  };

  const saveAsTemplate = async () => {
    if (!user) return;
    const tname = templateName.trim();
    if (!tname) return toast.error("Template name required");
    // Check duplicate
    const { data: existing } = await (supabase as any).from("budget_templates").select("id").eq("user_id", user.id).eq("name", tname).maybeSingle();
    if (existing) return toast.error("A template with this name already exists");
    if (periodItems.length === 0) return toast.error("No budget items to save");
    const { data: tpl, error: tErr } = await (supabase as any).from("budget_templates").insert({ user_id: user.id, name: tname, notes: null }).select().single();
    if (tErr) return toast.error(tErr.message);
    const rows = periodItems.map(i => ({
      user_id: user.id, template_id: tpl.id, account_id: i.account_id, name: i.name, budget_amount: Number(i.budget_amount),
    }));
    const { error: iErr } = await (supabase as any).from("budget_template_items").insert(rows);
    if (iErr) return toast.error(iErr.message);
    toast.success("Template saved");
    qc.invalidateQueries({ queryKey: ["budget_templates"] });
    qc.invalidateQueries({ queryKey: ["budget_template_items"] });
    setTemplateName("");
    setTemplateNameOpen(false);
    reset();
    setBuilderOpen(false);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Budget</h1>
        <p className="text-muted-foreground mt-1">Plan how the active pay period money is spent.</p>
      </div>

      {!active ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No active pay period. Set one in Pay Periods to start budgeting.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" />Active Pay Period</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
              <Row label="From Date" value={fmtDate(active.start_date)} />
              <Row label="Until Date" value={fmtDate(active.end_date)} />
              <Row label="Income Source" value={active.income_source || "—"} />
              <Row label="Deposit Account" value={depositAccount ? accLabel(depositAccount) : "—"} />
              <Row label="Pay Amount" value={active.net_pay_amount != null ? money(active.net_pay_amount) : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Active Budget</CardTitle>
              <Button size="sm" onClick={() => { reset(); setBuilderOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Add Items
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                <Cell label="Pay Amount" value={money(payAmount)} />
                <Cell label="Total Budgeted" value={money(totalBudgeted)} />
                <Cell label="Total Spent" value={money(totalSpent)} cls="text-expense" />
                <Cell label="Total Remaining" value={money(totalRemaining)} cls={totalRemaining < 0 ? "text-destructive" : "text-income"} />
                <Cell label="Remaining to Assign" value={money(remainingToAssign)} cls={remainingToAssign < 0 ? "text-destructive" : "text-income"} />
              </div>
              {remainingToAssign < 0 && (
                <div className="text-xs text-destructive font-medium text-center">Over budget by {money(Math.abs(remainingToAssign))}</div>
              )}

              {periodItems.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No budget items yet. Click Add Items to start.</div>
              ) : (
                <div className="space-y-2">
                  {periodItems.map(i => {
                    const acc = accounts.find(a => a.id === i.account_id);
                    const spent = spentByItem.get(i.id) || 0;
                    const remaining = Number(i.budget_amount) - spent;
                    return (
                      <div key={i.id} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                            <span className="font-semibold truncate">{i.name}</span>
                            <span className="text-xs text-muted-foreground truncate">{acc ? accLabel(acc) : "—"}</span>
                          </div>
                          <div className="flex shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(s => ({ ...s, [i.id]: !s[i.id] }))} title="Sub-items">
                              {expanded[i.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ListTree className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ id: i.id, name: i.name, account_id: i.account_id, budget_amount: String(i.budget_amount) })}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <Cell label="Budget" value={money(i.budget_amount)} />
                          <Cell label="Spent" value={money(spent)} cls="text-expense" />
                          <Cell label="Remaining" value={money(remaining)} cls={remaining < 0 ? "text-destructive" : "text-income"} />
                        </div>
                        {expanded[i.id] && (
                          <SubItems
                            budgetItemId={i.id}
                            parentAmount={Number(i.budget_amount)}
                            subItems={subItems.filter(s => s.budget_item_id === i.id)}
                            userId={user?.id}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={builderOpen} onOpenChange={o => { if (!o) reset(); setBuilderOpen(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Budget Items</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Cell label="Pay Amount" value={money(payAmount)} />
            <Cell label="Remaining to Assign" value={money(remainingToAssign)} cls={remainingToAssign < 0 ? "text-destructive" : "text-income"} />
          </div>
          <form onSubmit={addItem} className="space-y-3">
            <div><Label>Budget Item Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Groceries" /></div>
            <div>
              <Label>Account *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Budget Amount *</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
            <div className="flex gap-2 justify-end">
              <Button type="submit"><Plus className="h-4 w-4 mr-1" />Add Item</Button>
              <Button type="button" variant="outline" onClick={() => setPublishConfirmOpen(true)}>Publish Budget</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Budget Item</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Budget Item Name *</Label><Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
              <div>
                <Label>Account *</Label>
                <Select value={editing.account_id} onValueChange={v => setEditing({ ...editing, account_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Budget Amount *</Label><Input type="number" step="0.01" value={editing.budget_amount} onChange={e => setEditing({ ...editing, budget_amount: e.target.value })} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveEdit}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Publish Budget</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Do you want to save this budget as a template?</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <Button variant="outline" onClick={() => setPublishConfirmOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={justPublish}>No, Just Publish Budget</Button>
            <Button onClick={() => { setPublishConfirmOpen(false); setTemplateName(""); setTemplateNameOpen(true); }}>Yes, Save as Template</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateNameOpen} onOpenChange={o => { if (!o) setTemplateName(""); setTemplateNameOpen(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save as Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Template Name *</Label><Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Regular Paycheck Budget" autoFocus /></div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setTemplateName(""); setTemplateNameOpen(false); }}>Cancel</Button>
              <Button onClick={saveAsTemplate}>Save Template & Publish</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between rounded-md bg-accent/40 px-3 py-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

const Cell = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
  <div className="rounded-md bg-accent/40 px-2 py-1.5 text-center">
    <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    <div className={`font-semibold tabular-nums ${cls || ""}`}>{value}</div>
  </div>
);

function SubItems({ budgetItemId, parentAmount, subItems, userId }: {
  budgetItemId: string;
  parentAmount: number;
  subItems: { id: string; name: string; amount: number }[];
  userId?: string;
}) {
  const qc = useQueryClient();
  const [n, setN] = useState("");
  const [a, setA] = useState("");
  const total = subItems.reduce((s, x) => s + Number(x.amount), 0);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!n || !a) return toast.error("Name and amount required");
    const amt = parseFloat(a);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be > 0");
    const { error } = await (supabase as any).from("budget_sub_items").insert({
      user_id: userId, budget_item_id: budgetItemId, name: n, amount: amt,
    });
    if (error) return toast.error(error.message);
    setN(""); setA("");
    qc.invalidateQueries({ queryKey: ["budget_sub_items"] });
  };

  const del = async (id: string) => {
    if (!confirm("Delete this sub-item?")) return;
    const { error } = await (supabase as any).from("budget_sub_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["budget_sub_items"] });
  };

  const matches = Math.abs(total - parentAmount) < 0.005;

  return (
    <div className="border-t pt-2 mt-1 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Sub-items (planning breakdown)</div>
      {subItems.length > 0 && (
        <div className="space-y-1">
          {subItems.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-accent/30 px-2 py-1.5">
              <span className="text-xs truncate">{s.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold tabular-nums">{money(s.amount)}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => del(s.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs px-2">
            <span className="text-muted-foreground">Sub-items total</span>
            <span className="font-semibold tabular-nums">{money(total)}</span>
          </div>
          {!matches && (
            <div className="text-[11px] text-muted-foreground italic px-2">Sub-items total does not match budget amount.</div>
          )}
        </div>
      )}
      <form onSubmit={add} className="flex gap-2">
        <Input className="h-8 text-xs" placeholder="Sub-item name" value={n} onChange={e => setN(e.target.value)} />
        <Input className="h-8 text-xs w-24" type="number" step="0.01" placeholder="0.00" value={a} onChange={e => setA(e.target.value)} />
        <Button type="submit" size="sm" className="h-8"><Plus className="h-3.5 w-3.5" /></Button>
      </form>
    </div>
  );
}
