import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts, useActivePayPeriod, useBudgetItems, useBudgetSubItems, useTransactions, useRecurringApplications } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { money, fmtDate } from "@/lib/format";
import { Plus, Trash2, Pencil, Wallet, ChevronDown, ChevronUp, ListTree, Repeat } from "lucide-react";

type Recurring = { is_recurring: boolean; recurring_name?: string; recurring_amount?: number; recurring_date?: number; recurring_frequency?: "Monthly" | "Weekly" | "Every Pay Period" };
const FREQS: Recurring["recurring_frequency"][] = ["Monthly", "Weekly", "Every Pay Period"];

// Decide if a recurring item is "due" within a pay period [start, end]
function isRecurringDue(rec: { recurring_frequency?: string | null; recurring_date?: number | null }, startDate: string, endDate: string): boolean {
  const freq = rec.recurring_frequency;
  if (!freq) return false;
  if (freq === "Every Pay Period") return true;
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (freq === "Monthly") {
    const day = rec.recurring_date ?? 1;
    // Walk months in range looking for that day-of-month inside [start,end]
    const cur = new Date(start);
    while (cur <= end) {
      const candidate = new Date(cur.getFullYear(), cur.getMonth(), Math.min(day, new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()));
      if (candidate >= start && candidate <= end) return true;
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
    }
    return false;
  }
  if (freq === "Weekly") {
    // recurring_date treated as day of week 0=Sun..6=Sat. If unset, due if any day in range (always true).
    const dow = rec.recurring_date;
    if (dow == null) return true;
    const cur = new Date(start);
    while (cur <= end) {
      if (cur.getDay() === dow) return true;
      cur.setDate(cur.getDate() + 1);
    }
    return false;
  }
  return false;
}

import { accountLabel as accLabel } from "@/lib/format";
// (accLabel re-exported)

export default function Budget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const active = useActivePayPeriod();
  const { data: accounts = [] } = useAccounts();
  const { data: items = [] } = useBudgetItems();
  const { data: txs = [] } = useTransactions();
  const { data: subItems = [] } = useBudgetSubItems();
  const { data: recurringApps = [] } = useRecurringApplications();

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

  // ---- Full Build Budget workflow ----
  type DraftSub = { id: string; name: string; amount: number } & Recurring;
  type DraftItem = { id: string; name: string; account_id: string; budget_amount: number; subs: DraftSub[] } & Recurring;
  const [fullBuilderOpen, setFullBuilderOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [draftExpanded, setDraftExpanded] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [postPublishPromptOpen, setPostPublishPromptOpen] = useState(false);
  const [postPublishTplOpen, setPostPublishTplOpen] = useState(false);
  const [postPublishTplName, setPostPublishTplName] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);
  const [publishedDrafts, setPublishedDrafts] = useState<DraftItem[]>([]);
  // Simple item form
  const [siName, setSiName] = useState("");
  const [siAccount, setSiAccount] = useState("");
  const [siAmount, setSiAmount] = useState("");
  const [siRecurring, setSiRecurring] = useState(false);
  const [siRecName, setSiRecName] = useState("");
  const [siRecDate, setSiRecDate] = useState("");
  const [siRecFreq, setSiRecFreq] = useState<Recurring["recurring_frequency"]>("Monthly");
  // Category form
  const [catName, setCatName] = useState("");
  const [catAccount, setCatAccount] = useState("");
  const [catAmountManual, setCatAmountManual] = useState("");
  const [catSubs, setCatSubs] = useState<DraftSub[]>([]);
  const [csName, setCsName] = useState("");
  const [csAmount, setCsAmount] = useState("");
  const [csRecurring, setCsRecurring] = useState(false);
  const [csRecDate, setCsRecDate] = useState("");
  const [csRecFreq, setCsRecFreq] = useState<Recurring["recurring_frequency"]>("Monthly");
  const [applyingRecurring, setApplyingRecurring] = useState(false);
  const [catBuilderOpen, setCatBuilderOpen] = useState(false);
  const [savingCat, setSavingCat] = useState(false);

  const resetCatForm = () => {
    setCatName(""); setCatAccount(""); setCatAmountManual(""); setCatSubs([]);
    setCsName(""); setCsAmount(""); setCsRecurring(false); setCsRecDate(""); setCsRecFreq("Monthly");
  };

  const saveCategoryItemToActive = async () => {
    if (!user || !active) return toast.error("No active pay period");
    if (!catName || !catAccount) return toast.error("Category name and account required");
    if (catSubs.length === 0) return toast.error("Add at least one sub-item");
    if (catParentAmount <= 0) return toast.error("Parent amount must be > 0");
    setSavingCat(true);
    try {
      const { data: inserted, error } = await (supabase as any).from("budget_items").insert({
        user_id: user.id, pay_period_id: active.id, account_id: catAccount,
        name: catName, budget_amount: catParentAmount, is_recurring: false,
      }).select().single();
      if (error) return toast.error(error.message);
      const subRows = catSubs.map(s => ({
        user_id: user.id, budget_item_id: inserted.id, name: s.name, amount: s.amount,
        is_recurring: !!s.is_recurring,
        recurring_name: s.recurring_name ?? null,
        recurring_amount: s.recurring_amount ?? null,
        recurring_date: s.recurring_date ?? null,
        recurring_frequency: s.recurring_frequency ?? null,
      }));
      const { error: sErr } = await (supabase as any).from("budget_sub_items").insert(subRows);
      if (sErr) return toast.error(sErr.message);
      toast.success("Category item added");
      qc.invalidateQueries({ queryKey: ["budget_items"] });
      qc.invalidateQueries({ queryKey: ["budget_sub_items"] });
      resetCatForm();
      setCatBuilderOpen(false);
    } finally {
      setSavingCat(false);
    }
  };

  const draftsTotal = drafts.reduce((s, d) => s + d.budget_amount, 0);

  const resetFullBuilder = () => {
    setDrafts([]); setDraftExpanded({});
    setSiName(""); setSiAccount(""); setSiAmount("");
    setSiRecurring(false); setSiRecName(""); setSiRecDate(""); setSiRecFreq("Monthly");
    setCatName(""); setCatAccount(""); setCatAmountManual(""); setCatSubs([]); setCsName(""); setCsAmount("");
    setCsRecurring(false); setCsRecDate(""); setCsRecFreq("Monthly");
  };

  const addSimpleDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siName || !siAccount || !siAmount) return toast.error("Name, account, amount required");
    const amt = parseFloat(siAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be > 0");
    if (siRecurring && !siRecFreq) return toast.error("Select a recurring frequency");
    setDrafts(d => [...d, {
      id: crypto.randomUUID(), name: siName, account_id: siAccount, budget_amount: amt, subs: [],
      is_recurring: siRecurring,
      recurring_name: siRecurring ? (siRecName || siName) : undefined,
      recurring_amount: siRecurring ? amt : undefined,
      recurring_date: siRecurring && siRecDate ? parseInt(siRecDate, 10) : undefined,
      recurring_frequency: siRecurring ? siRecFreq : undefined,
    }]);
    setSiName(""); setSiAccount(""); setSiAmount("");
    setSiRecurring(false); setSiRecName(""); setSiRecDate(""); setSiRecFreq("Monthly");
  };

  const addCatSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csName || !csAmount) return toast.error("Sub-item name and amount required");
    const amt = parseFloat(csAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be > 0");
    setCatSubs(s => [...s, {
      id: crypto.randomUUID(), name: csName, amount: amt,
      is_recurring: csRecurring,
      recurring_name: csRecurring ? csName : undefined,
      recurring_amount: csRecurring ? amt : undefined,
      recurring_date: csRecurring && csRecDate ? parseInt(csRecDate, 10) : undefined,
      recurring_frequency: csRecurring ? csRecFreq : undefined,
    }]);
    setCsName(""); setCsAmount(""); setCsRecurring(false); setCsRecDate(""); setCsRecFreq("Monthly");
  };

  const catSubsTotal = catSubs.reduce((s, x) => s + x.amount, 0);
  const catParentAmount = catAmountManual !== "" ? parseFloat(catAmountManual) || 0 : catSubsTotal;
  const catMismatch = catAmountManual !== "" && Math.abs(catParentAmount - catSubsTotal) > 0.005;

  const addCategoryDraft = () => {
    if (!catName || !catAccount) return toast.error("Category name and account required");
    if (catSubs.length === 0) return toast.error("Add at least one sub-item");
    if (catParentAmount <= 0) return toast.error("Parent amount must be > 0");
    setDrafts(d => [...d, {
      id: crypto.randomUUID(), name: catName, account_id: catAccount,
      budget_amount: catParentAmount, subs: catSubs,
      is_recurring: false,
    }]);
    setCatName(""); setCatAccount(""); setCatAmountManual(""); setCatSubs([]); setCsName(""); setCsAmount("");
  };

  const removeDraft = (id: string) => setDrafts(d => d.filter(x => x.id !== id));

  const publishFullBudget = async () => {
    if (!user || !active) return toast.error("No active pay period");
    if (drafts.length === 0) { setFullBuilderOpen(false); return; }
    setPublishing(true);
    try {
      const itemRows = drafts.map(d => ({
        user_id: user.id, pay_period_id: active.id, account_id: d.account_id,
        name: d.name, budget_amount: d.budget_amount,
        is_recurring: !!d.is_recurring,
        recurring_name: d.recurring_name ?? null,
        recurring_amount: d.recurring_amount ?? null,
        recurring_date: d.recurring_date ?? null,
        recurring_frequency: d.recurring_frequency ?? null,
      }));
      const { data: inserted, error } = await (supabase as any).from("budget_items").insert(itemRows).select();
      if (error) return toast.error(error.message);
      const subRows: any[] = [];
      drafts.forEach((d, idx) => {
        const insertedId = inserted?.[idx]?.id;
        if (!insertedId) return;
        d.subs.forEach(s => subRows.push({
          user_id: user.id, budget_item_id: insertedId, name: s.name, amount: s.amount,
          is_recurring: !!s.is_recurring,
          recurring_name: s.recurring_name ?? null,
          recurring_amount: s.recurring_amount ?? null,
          recurring_date: s.recurring_date ?? null,
          recurring_frequency: s.recurring_frequency ?? null,
        }));
      });
      if (subRows.length > 0) {
        const { error: sErr } = await (supabase as any).from("budget_sub_items").insert(subRows);
        if (sErr) return toast.error(sErr.message);
      }
      toast.success("Budget published");
      qc.invalidateQueries({ queryKey: ["budget_items"] });
      qc.invalidateQueries({ queryKey: ["budget_sub_items"] });
      // Keep snapshot for optional template save, then close builder and prompt
      setPublishedDrafts(drafts);
      resetFullBuilder();
      setFullBuilderOpen(false);
      setPostPublishPromptOpen(true);
    } finally {
      setPublishing(false);
    }
  };

  const saveBudgetAsTemplate = async () => {
    if (!user) return;
    const tname = postPublishTplName.trim();
    if (!tname) return toast.error("Template name required");
    if (publishedDrafts.length === 0) return toast.error("Nothing to save");
    setSavingTpl(true);
    try {
      const { data: existing } = await (supabase as any).from("budget_templates").select("id").eq("user_id", user.id).eq("name", tname).maybeSingle();
      if (existing) return toast.error("A template with this name already exists");
      const { data: tpl, error: tErr } = await (supabase as any).from("budget_templates").insert({ user_id: user.id, name: tname, notes: null }).select().single();
      if (tErr) return toast.error(tErr.message);
      const itemRows = publishedDrafts.map(d => ({
        user_id: user.id, template_id: tpl.id, account_id: d.account_id, name: d.name, budget_amount: d.budget_amount,
        is_recurring: !!d.is_recurring,
        recurring_name: d.recurring_name ?? null,
        recurring_amount: d.recurring_amount ?? null,
        recurring_date: d.recurring_date ?? null,
        recurring_frequency: d.recurring_frequency ?? null,
      }));
      const { data: insertedItems, error: iErr } = await (supabase as any).from("budget_template_items").insert(itemRows).select();
      if (iErr) return toast.error(iErr.message);
      const subRows: any[] = [];
      publishedDrafts.forEach((d, idx) => {
        const tid = insertedItems?.[idx]?.id;
        if (!tid) return;
        d.subs.forEach(s => subRows.push({
          user_id: user.id, template_item_id: tid, name: s.name, amount: s.amount,
          is_recurring: !!s.is_recurring,
          recurring_name: s.recurring_name ?? null,
          recurring_amount: s.recurring_amount ?? null,
          recurring_date: s.recurring_date ?? null,
          recurring_frequency: s.recurring_frequency ?? null,
        }));
      });
      if (subRows.length > 0) {
        const { error: sErr } = await (supabase as any).from("budget_template_sub_items").insert(subRows);
        if (sErr) return toast.error(sErr.message);
      }
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["budget_templates"] });
      qc.invalidateQueries({ queryKey: ["budget_template_items"] });
      qc.invalidateQueries({ queryKey: ["budget_template_sub_items"] });
      setPostPublishTplName("");
      setPostPublishTplOpen(false);
      setPublishedDrafts([]);
    } finally {
      setSavingTpl(false);
    }
  };

  const applyRecurringExpenses = async (force = false) => {
    if (!user || !active) return toast.error("No active pay period");
    setApplyingRecurring(true);
    try {
      const periodSubs = subItems.filter(s => periodItems.some(p => p.id === s.budget_item_id));
      type Candidate = { kind: "item" | "sub"; itemId: string; subId: string | null; accountId: string; amount: number; name: string };
      const candidates: Candidate[] = [];

      periodItems.forEach(it => {
        const itSubs = periodSubs.filter(s => s.budget_item_id === it.id);
        if (it.is_recurring && isRecurringDue(it as any, active.start_date, active.end_date)) {
          candidates.push({
            kind: "item", itemId: it.id, subId: null, accountId: it.account_id,
            amount: Number(it.recurring_amount ?? it.budget_amount),
            name: it.recurring_name || it.name,
          });
        }
        itSubs.forEach(s => {
          if (s.is_recurring && isRecurringDue(s as any, active.start_date, active.end_date)) {
            candidates.push({
              kind: "sub", itemId: it.id, subId: s.id, accountId: it.account_id,
              amount: Number(s.recurring_amount ?? s.amount),
              name: s.recurring_name || `${it.name} · ${s.name}`,
            });
          }
        });
      });

      if (candidates.length === 0) {
        toast.info("No recurring expenses are due in this pay period");
        return;
      }

      const alreadyApplied = (c: Candidate) => recurringApps.some(a =>
        a.pay_period_id === active.id &&
        (c.kind === "sub" ? a.budget_sub_item_id === c.subId : (a.budget_item_id === c.itemId && a.budget_sub_item_id === null))
      );

      const dupes = candidates.filter(alreadyApplied);
      let applyDupes = false;
      if (dupes.length > 0 && !force) {
        applyDupes = confirm(`${dupes.length} recurring expense(s) were already applied to this pay period. Apply again and create duplicates?`);
        if (!applyDupes) {
          // Filter out duplicates and continue with the rest
        }
      }
      const toApply = candidates.filter(c => !alreadyApplied(c) || applyDupes);
      if (toApply.length === 0) {
        toast.info("Nothing new to apply");
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      let created = 0;
      for (const c of toApply) {
        const { data: tx, error: txErr } = await (supabase as any).from("transactions").insert({
          user_id: user.id, transaction_type: "expense", date: today,
          account_id: c.accountId, pay_period_id: active.id, budget_item_id: c.itemId,
          amount: c.amount, notes: `Recurring: ${c.name}`,
        }).select("id").single();
        if (txErr) { toast.error(txErr.message); continue; }
        const { error: appErr } = await (supabase as any).from("recurring_expense_applications").insert({
          user_id: user.id, budget_item_id: c.kind === "item" ? c.itemId : null,
          budget_sub_item_id: c.subId, pay_period_id: active.id, transaction_id: tx.id,
        });
        if (appErr) toast.error(appErr.message);
        created++;
      }
      toast.success(`Applied ${created} recurring expense(s)`);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["recurring_expense_applications"] });
    } finally {
      setApplyingRecurring(false);
    }
  };

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
  const liveTotalBudgeted = totalBudgeted + draftsTotal;
  const liveRemainingToAssign = payAmount - liveTotalBudgeted;

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
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <Row label="From Date" value={fmtDate(active.start_date)} />
                <Row label="Until Date" value={fmtDate(active.end_date)} />
                <Row label="Income Source" value={active.income_source || "—"} />
                <Row label="Deposit Account" value={depositAccount ? accLabel(depositAccount) : "—"} />
                <Row label="Pay Amount" value={active.net_pay_amount != null ? money(active.net_pay_amount) : "—"} />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("/budget-templates")}>Add Template</Button>
                <Button size="sm" onClick={() => setFullBuilderOpen(true)}>Build Budget</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Active Budget</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { resetCatForm(); setCatBuilderOpen(true); }}>
                  <ListTree className="h-4 w-4 mr-1" />Add Category Item
                </Button>
                <Button size="sm" onClick={() => { reset(); setBuilderOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" />Add Items
                </Button>
              </div>
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
                            <span className="font-semibold truncate flex items-center gap-1">
                              {i.name}
                              {i.is_recurring && <Repeat className="h-3 w-3 text-primary" aria-label="Recurring" />}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">{acc ? accLabel(acc) : "—"}</span>
                            {i.is_recurring && i.recurring_frequency && (
                              <span className="text-[10px] uppercase text-muted-foreground">
                                {i.recurring_frequency}{i.recurring_date ? ` · day ${i.recurring_date}` : ""}
                              </span>
                            )}
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
              <Button type="button" variant="outline" onClick={() => { reset(); setBuilderOpen(false); }}>Cancel</Button>
              <Button type="submit"><Plus className="h-4 w-4 mr-1" />Add Item</Button>
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

      {/* Full Build Budget workflow */}
      <Dialog open={fullBuilderOpen} onOpenChange={o => { if (!o) resetFullBuilder(); setFullBuilderOpen(o); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Build Budget</DialogTitle></DialogHeader>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <Cell label="Pay Amount" value={money(payAmount)} />
            <Cell label="Total Budgeted" value={money(liveTotalBudgeted)} />
            <Cell label="Remaining to Assign" value={money(liveRemainingToAssign)} cls={liveRemainingToAssign < 0 ? "text-destructive" : "text-income"} />
          </div>
          {liveRemainingToAssign < 0 && (
            <div className="text-xs text-destructive font-medium text-center">Over budget by {money(Math.abs(liveRemainingToAssign))}</div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Add Item */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Add Item</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={addSimpleDraft} className="space-y-2">
                  <div><Label className="text-xs">Name *</Label><Input value={siName} onChange={e => setSiName(e.target.value)} placeholder="Medical Fees" /></div>
                  <div>
                    <Label className="text-xs">Account *</Label>
                    <Select value={siAccount} onValueChange={setSiAccount}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Budget Amount *</Label><Input type="number" step="0.01" value={siAmount} onChange={e => setSiAmount(e.target.value)} placeholder="0.00" /></div>
                  <div className="rounded-md border p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox id="si-rec" checked={siRecurring} onCheckedChange={v => setSiRecurring(!!v)} />
                      <Label htmlFor="si-rec" className="text-xs cursor-pointer flex items-center gap-1">
                        <Repeat className="h-3 w-3" />Recurring
                      </Label>
                    </div>
                    {siRecurring && (
                      <div className="space-y-2">
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Frequency</Label>
                            <Select value={siRecFreq} onValueChange={v => setSiRecFreq(v as any)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{FREQS.map(f => <SelectItem key={f} value={f!}>{f}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">{siRecFreq === "Weekly" ? "Day of Week (0=Sun)" : siRecFreq === "Monthly" ? "Day of Month" : "Date (optional)"}</Label>
                            <Input type="number" min="0" max="31" value={siRecDate} onChange={e => setSiRecDate(e.target.value)} placeholder={siRecFreq === "Monthly" ? "20" : siRecFreq === "Weekly" ? "1" : ""} disabled={siRecFreq === "Every Pay Period"} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button type="submit" size="sm" className="w-full"><Plus className="h-4 w-4 mr-1" />Add Item</Button>
                </form>
              </CardContent>
            </Card>

            {/* Add Category Item */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Add Category Item</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div><Label className="text-xs">Category Name *</Label><Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="AI" /></div>
                <div>
                  <Label className="text-xs">Account *</Label>
                  <Select value={catAccount} onValueChange={setCatAccount}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <form onSubmit={addCatSub} className="space-y-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1"><Label className="text-xs">Sub-item</Label><Input value={csName} onChange={e => setCsName(e.target.value)} placeholder="ChatGPT" /></div>
                    <div className="w-24"><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={csAmount} onChange={e => setCsAmount(e.target.value)} placeholder="0.00" /></div>
                    <Button type="submit" size="icon" className="h-10 w-10"><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="cs-rec" checked={csRecurring} onCheckedChange={v => setCsRecurring(!!v)} />
                    <Label htmlFor="cs-rec" className="text-xs cursor-pointer flex items-center gap-1">
                      <Repeat className="h-3 w-3" />Recurring sub-item
                    </Label>
                  </div>
                  {csRecurring && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Frequency</Label>
                        <Select value={csRecFreq} onValueChange={v => setCsRecFreq(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{FREQS.map(f => <SelectItem key={f} value={f!}>{f}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">{csRecFreq === "Weekly" ? "Day of Week (0=Sun)" : csRecFreq === "Monthly" ? "Day of Month" : "Date (optional)"}</Label>
                        <Input type="number" min="0" max="31" value={csRecDate} onChange={e => setCsRecDate(e.target.value)} placeholder={csRecFreq === "Monthly" ? "20" : ""} disabled={csRecFreq === "Every Pay Period"} />
                      </div>
                    </div>
                  )}
                </form>
                {catSubs.length > 0 && (
                  <div className="space-y-1">
                    {catSubs.map(s => (
                      <div key={s.id} className="flex items-center justify-between rounded bg-accent/40 px-2 py-1 text-xs">
                        <span className="truncate flex items-center gap-1">
                          {s.name}
                          {s.is_recurring && <Repeat className="h-3 w-3 text-primary" />}
                          {s.is_recurring && s.recurring_frequency && <span className="text-[10px] uppercase text-muted-foreground">{s.recurring_frequency}</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums font-semibold">{money(s.amount)}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCatSubs(x => x.filter(y => y.id !== s.id))}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs px-2"><span className="text-muted-foreground">Sub-items total</span><span className="font-semibold tabular-nums">{money(catSubsTotal)}</span></div>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Parent Amount (optional override)</Label>
                  <Input type="number" step="0.01" value={catAmountManual} onChange={e => setCatAmountManual(e.target.value)} placeholder={catSubsTotal ? String(catSubsTotal) : "auto from sub-items"} />
                  {catMismatch && <div className="text-[11px] text-destructive mt-1">Manual amount does not match sub-items total ({money(catSubsTotal)}).</div>}
                </div>
                <Button type="button" size="sm" className="w-full" onClick={addCategoryDraft}><Plus className="h-4 w-4 mr-1" />Add Category Item</Button>
              </CardContent>
            </Card>
          </div>

          {/* Drafts list */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Items to Publish ({drafts.length})</div>
            {drafts.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-3">No items added yet.</div>
            ) : (
              <div className="space-y-1.5">
                {drafts.map(d => {
                  const acc = accounts.find(a => a.id === d.account_id);
                  return (
                    <div key={d.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate flex items-center gap-1">
                            {d.name}
                            {d.is_recurring && <Repeat className="h-3 w-3 text-primary" />}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">{acc ? accLabel(acc) : "—"}</span>
                          {d.subs.length > 0 && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</span>}
                          {d.is_recurring && d.recurring_frequency && (
                            <span className="text-[10px] uppercase text-muted-foreground">{d.recurring_frequency}{d.recurring_date ? ` · ${d.recurring_date}` : ""}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold tabular-nums text-sm">{money(d.budget_amount)}</span>
                          {d.subs.length > 0 && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDraftExpanded(s => ({ ...s, [d.id]: !s[d.id] }))}>
                              {draftExpanded[d.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDraft(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                      {d.subs.length > 0 && draftExpanded[d.id] && (
                        <div className="mt-2 pl-3 border-l space-y-1">
                          {d.subs.map(s => (
                            <div key={s.id} className="flex justify-between text-xs">
                              <span className="text-muted-foreground flex items-center gap-1">
                                {s.name}
                                {s.is_recurring && <Repeat className="h-3 w-3 text-primary" />}
                                {s.is_recurring && s.recurring_frequency && (
                                  <span className="text-[10px] uppercase">{s.recurring_frequency}{s.recurring_date ? ` · ${s.recurring_date}` : ""}</span>
                                )}
                              </span>
                              <span className="tabular-nums">{money(s.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { resetFullBuilder(); setFullBuilderOpen(false); }}>Cancel</Button>
            <Button onClick={publishFullBudget} disabled={publishing || drafts.length === 0}>
              {publishing ? "Publishing..." : "Publish Budget"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-publish: prompt to save as template */}
      <Dialog open={postPublishPromptOpen} onOpenChange={setPostPublishPromptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Budget Published</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Do you want to save this budget as a template you can reuse for future pay periods?</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <Button variant="outline" onClick={() => setPostPublishPromptOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => { setPostPublishPromptOpen(false); setPublishedDrafts([]); }}>No, Just Finish</Button>
            <Button onClick={() => { setPostPublishPromptOpen(false); setPostPublishTplName(""); setPostPublishTplOpen(true); }}>Yes, Save as Template</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={postPublishTplOpen} onOpenChange={o => { if (!o) { setPostPublishTplName(""); setPublishedDrafts([]); } setPostPublishTplOpen(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save as Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Template Name *</Label><Input value={postPublishTplName} onChange={e => setPostPublishTplName(e.target.value)} placeholder="Regular Paycheck Budget" autoFocus /></div>
            <div className="text-xs text-muted-foreground">Saving {publishedDrafts.length} item{publishedDrafts.length === 1 ? "" : "s"} (including any sub-items).</div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setPostPublishTplName(""); setPublishedDrafts([]); setPostPublishTplOpen(false); }}>Cancel</Button>
              <Button onClick={saveBudgetAsTemplate} disabled={savingTpl}>{savingTpl ? "Saving..." : "Save Template"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Category Item directly to active budget */}
      <Dialog open={catBuilderOpen} onOpenChange={o => { if (!o) resetCatForm(); setCatBuilderOpen(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Category Item</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label className="text-xs">Category Name *</Label><Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="AI" /></div>
            <div>
              <Label className="text-xs">Account *</Label>
              <Select value={catAccount} onValueChange={setCatAccount}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accLabel(a)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <form onSubmit={addCatSub} className="space-y-2">
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Label className="text-xs">Sub-item</Label><Input value={csName} onChange={e => setCsName(e.target.value)} placeholder="ChatGPT" /></div>
                <div className="w-24"><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={csAmount} onChange={e => setCsAmount(e.target.value)} placeholder="0.00" /></div>
                <Button type="submit" size="icon" className="h-10 w-10"><Plus className="h-4 w-4" /></Button>
              </div>
            </form>
            {catSubs.length > 0 && (
              <div className="space-y-1">
                {catSubs.map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded bg-accent/40 px-2 py-1 text-xs">
                    <span className="truncate">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums font-semibold">{money(s.amount)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCatSubs(x => x.filter(y => y.id !== s.id))}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-xs px-2"><span className="text-muted-foreground">Sub-items total</span><span className="font-semibold tabular-nums">{money(catSubsTotal)}</span></div>
              </div>
            )}
            <div>
              <Label className="text-xs">Parent Amount (optional override)</Label>
              <Input type="number" step="0.01" value={catAmountManual} onChange={e => setCatAmountManual(e.target.value)} placeholder={catSubsTotal ? String(catSubsTotal) : "auto from sub-items"} />
              {catMismatch && <div className="text-[11px] text-destructive mt-1">Manual amount does not match sub-items total ({money(catSubsTotal)}).</div>}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { resetCatForm(); setCatBuilderOpen(false); }}>Cancel</Button>
              <Button onClick={saveCategoryItemToActive} disabled={savingCat}>{savingCat ? "Saving..." : "Add Category Item"}</Button>
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
  subItems: { id: string; name: string; amount: number; is_recurring?: boolean; recurring_frequency?: string | null; recurring_date?: number | null }[];
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
              <span className="text-xs truncate flex items-center gap-1">
                {s.name}
                {s.is_recurring && <Repeat className="h-3 w-3 text-primary" aria-label="Recurring" />}
                {s.is_recurring && s.recurring_frequency && (
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {s.recurring_frequency}{s.recurring_date ? ` · day ${s.recurring_date}` : ""}
                  </span>
                )}
              </span>
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
