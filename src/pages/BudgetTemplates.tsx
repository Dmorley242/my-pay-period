import { useMemo, useState } from "react";
import { useAccounts, useActivePayPeriod, useBudgetItems, useBudgetTemplates, useBudgetTemplateItems, useBudgetTemplateSubItems, usePayPeriods } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { money, fmtDate } from "@/lib/format";
import { Plus, Trash2, Pencil, LayoutTemplate, Send } from "lucide-react";

const accLabel = (a: { bank_name: string | null; name: string }) => a.bank_name ? `${a.bank_name} - ${a.name}` : a.name;

export default function BudgetTemplates() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: templates = [] } = useBudgetTemplates();
  const { data: tItems = [] } = useBudgetTemplateItems();
  const { data: periods = [] } = usePayPeriods();
  const { data: budgetItems = [] } = useBudgetItems();
  const active = useActivePayPeriod();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<{ id: string | null; name: string; notes: string }>({ id: null, name: "", notes: "" });

  const [itemName, setItemName] = useState("");
  const [itemAccount, setItemAccount] = useState("");
  const [itemAmount, setItemAmount] = useState("");

  const [editingItem, setEditingItem] = useState<null | { id: string; name: string; account_id: string; budget_amount: string }>(null);

  const [applyOpen, setApplyOpen] = useState<null | { templateId: string; payPeriodId: string }>(null);

  const itemsByTemplate = useMemo(() => {
    const m = new Map<string, typeof tItems>();
    tItems.forEach(i => {
      const arr = m.get(i.template_id) || [];
      arr.push(i); m.set(i.template_id, arr);
    });
    return m;
  }, [tItems]);

  const builderItems = editingTpl.id ? (itemsByTemplate.get(editingTpl.id) || []) : [];
  const builderTotal = builderItems.reduce((s, i) => s + Number(i.budget_amount), 0);

  const openNewBuilder = async () => {
    if (!user) return;
    const name = "Untitled Template";
    const { data, error } = await (supabase as any).from("budget_templates").insert({ user_id: user.id, name, notes: null }).select().single();
    if (error) return toast.error(error.message);
    setEditingTpl({ id: data.id, name: data.name, notes: "" });
    setBuilderOpen(true);
    qc.invalidateQueries({ queryKey: ["budget_templates"] });
  };

  const openEditBuilder = (id: string) => {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setEditingTpl({ id: t.id, name: t.name, notes: t.notes || "" });
    setBuilderOpen(true);
  };

  const saveTemplateMeta = async () => {
    if (!editingTpl.id) return;
    if (!editingTpl.name.trim()) return toast.error("Template name required");
    const { error } = await (supabase as any).from("budget_templates").update({
      name: editingTpl.name.trim(), notes: editingTpl.notes || null,
    }).eq("id", editingTpl.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["budget_templates"] });
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingTpl.id) return;
    if (!itemName || !itemAccount || !itemAmount) return toast.error("All fields required");
    const amt = parseFloat(itemAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be > 0");
    const { error } = await (supabase as any).from("budget_template_items").insert({
      user_id: user.id, template_id: editingTpl.id, account_id: itemAccount, name: itemName, budget_amount: amt,
    });
    if (error) return toast.error(error.message);
    toast.success("Item added");
    setItemName(""); setItemAccount(""); setItemAmount("");
    qc.invalidateQueries({ queryKey: ["budget_template_items"] });
  };

  const removeItem = async (id: string) => {
    if (!confirm("Delete this template item?")) return;
    const { error } = await (supabase as any).from("budget_template_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["budget_template_items"] });
  };

  const saveItemEdit = async () => {
    if (!editingItem) return;
    const amt = parseFloat(editingItem.budget_amount);
    if (!editingItem.name || !editingItem.account_id || !Number.isFinite(amt) || amt <= 0) return toast.error("Fill all fields");
    const { error } = await (supabase as any).from("budget_template_items").update({
      name: editingItem.name, account_id: editingItem.account_id, budget_amount: amt,
    }).eq("id", editingItem.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["budget_template_items"] });
    setEditingItem(null);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template? Items in already-applied pay periods will remain.")) return;
    const { error } = await (supabase as any).from("budget_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    qc.invalidateQueries({ queryKey: ["budget_templates"] });
    qc.invalidateQueries({ queryKey: ["budget_template_items"] });
  };

  const applyTemplate = async () => {
    if (!user || !applyOpen) return;
    const items = itemsByTemplate.get(applyOpen.templateId) || [];
    if (items.length === 0) return toast.error("Template has no items");
    const already = budgetItems.some(b => (b as any).source_template_id === applyOpen.templateId && b.pay_period_id === applyOpen.payPeriodId);
    if (already) return toast.error("This template was already applied to this pay period.");
    const rows = items.map(i => ({
      user_id: user.id,
      pay_period_id: applyOpen.payPeriodId,
      account_id: i.account_id,
      name: i.name,
      budget_amount: Number(i.budget_amount),
      source_template_id: applyOpen.templateId,
    }));
    const { error } = await (supabase as any).from("budget_items").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Applied ${rows.length} budget items`);
    qc.invalidateQueries({ queryKey: ["budget_items"] });
    setApplyOpen(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Budget Templates</h1>
          <p className="text-muted-foreground mt-1">Save reusable budget plans and apply them to pay periods.</p>
        </div>
        <Button onClick={openNewBuilder}><Plus className="h-4 w-4 mr-1" />Add Template</Button>
      </div>

      {templates.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No templates yet. Click Add Template to create one.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const items = itemsByTemplate.get(t.id) || [];
            const total = items.reduce((s, i) => s + Number(i.budget_amount), 0);
            return (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-2"><LayoutTemplate className="h-4 w-4" />{t.name}</div>
                      {t.notes && <div className="text-xs text-muted-foreground mt-0.5">{t.notes}</div>}
                      <div className="text-xs text-muted-foreground mt-0.5">Created {fmtDate(t.created_at)}</div>
                    </div>
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditBuilder(t.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteTemplate(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-accent/40 px-2 py-1.5 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">Total</div>
                      <div className="font-semibold tabular-nums">{money(total)}</div>
                    </div>
                    <div className="rounded-md bg-accent/40 px-2 py-1.5 text-center">
                      <div className="text-[10px] uppercase text-muted-foreground">Items</div>
                      <div className="font-semibold tabular-nums">{items.length}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={items.length === 0}
                    onClick={() => setApplyOpen({ templateId: t.id, payPeriodId: active?.id || (periods[0]?.id ?? "") })}
                  >
                    <Send className="h-4 w-4 mr-1" />Apply Template
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Builder dialog */}
      <Dialog open={builderOpen} onOpenChange={async (o) => {
        if (!o && editingTpl.id) { await saveTemplateMeta(); }
        setBuilderOpen(o);
        if (!o) { setEditingTpl({ id: null, name: "", notes: "" }); setItemName(""); setItemAccount(""); setItemAmount(""); }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTpl.id ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Template Name *</Label><Input value={editingTpl.name} onChange={e => setEditingTpl({ ...editingTpl, name: e.target.value })} onBlur={saveTemplateMeta} /></div>
            <div><Label>Notes</Label><Textarea value={editingTpl.notes} onChange={e => setEditingTpl({ ...editingTpl, notes: e.target.value })} onBlur={saveTemplateMeta} /></div>

            <div className="rounded-md bg-accent/40 px-3 py-2 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Template Total</div>
              <div className="font-semibold tabular-nums">{money(builderTotal)}</div>
            </div>

            <form onSubmit={addItem} className="space-y-3 border-t pt-3">
              <div className="text-sm font-medium">Add Item</div>
              <div><Label>Budget Item Name *</Label><Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Groceries" /></div>
              <div>
                <Label>Account *</Label>
                <Select value={itemAccount} onValueChange={setItemAccount}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Budget Amount *</Label><Input type="number" step="0.01" value={itemAmount} onChange={e => setItemAmount(e.target.value)} placeholder="0.00" /></div>
              <div className="flex gap-2 justify-end">
                <Button type="submit"><Plus className="h-4 w-4 mr-1" />Add Item</Button>
                <Button type="button" variant="outline" onClick={async () => { await saveTemplateMeta(); setBuilderOpen(false); setEditingTpl({ id: null, name: "", notes: "" }); }}>Done</Button>
              </div>
            </form>

            {builderItems.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="text-sm font-medium">Items in template</div>
                {builderItems.map(i => {
                  const acc = accounts.find(a => a.id === i.account_id);
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{i.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{acc ? accLabel(acc) : "—"}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">{money(i.budget_amount)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingItem({ id: i.id, name: i.name, account_id: i.account_id, budget_amount: String(i.budget_amount) })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit item dialog */}
      <Dialog open={!!editingItem} onOpenChange={o => !o && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Template Item</DialogTitle></DialogHeader>
          {editingItem && (
            <div className="space-y-3">
              <div><Label>Budget Item Name *</Label><Input value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} /></div>
              <div>
                <Label>Account *</Label>
                <Select value={editingItem.account_id} onValueChange={v => setEditingItem({ ...editingItem, account_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Budget Amount *</Label><Input type="number" step="0.01" value={editingItem.budget_amount} onChange={e => setEditingItem({ ...editingItem, budget_amount: e.target.value })} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
                <Button onClick={saveItemEdit}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Apply dialog */}
      <Dialog open={!!applyOpen} onOpenChange={o => !o && setApplyOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply Template</DialogTitle></DialogHeader>
          {applyOpen && (
            <div className="space-y-3">
              <div>
                <Label>Pay Period *</Label>
                <Select value={applyOpen.payPeriodId} onValueChange={v => setApplyOpen({ ...applyOpen, payPeriodId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select pay period" /></SelectTrigger>
                  <SelectContent>
                    {periods.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {fmtDate(p.start_date)} – {fmtDate(p.end_date)}{p.is_active ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {applyOpen.payPeriodId && budgetItems.some(b => (b as any).source_template_id === applyOpen.templateId && b.pay_period_id === applyOpen.payPeriodId) && (
                <div className="text-xs text-destructive">This template was already applied to the selected pay period.</div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setApplyOpen(null)}>Cancel</Button>
                <Button onClick={applyTemplate} disabled={!applyOpen.payPeriodId}>Apply</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
