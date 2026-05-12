import { useState } from "react";
import { useAccounts } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { money, accountLabel } from "@/lib/format";
import { Plus, Trash2, Wallet, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type AcctType = "Bank Account" | "Credit Card" | "Cash" | "Other";
const ACCT_TYPES: AcctType[] = ["Cash", "Credit Card", "Bank Account", "Other"];

type FormState = {
  account_type: AcctType;
  bank_name: string;   // bank/issuer
  alias: string;       // nickname
  other_name: string;  // for "Other"
  starting_balance: string;
  notes: string;
};

const blank: FormState = { account_type: "Bank Account", bank_name: "", alias: "", other_name: "", starting_balance: "0", notes: "" };

const computeDisplayName = (f: FormState): string => {
  const alias = f.alias.trim();
  switch (f.account_type) {
    case "Bank Account": {
      const bn = f.bank_name.trim();
      return alias ? `${bn} - ${alias}` : bn;
    }
    case "Credit Card": {
      const bn = f.bank_name.trim();
      const base = "Credit Card";
      if (alias && bn) return `${base} - ${bn} - ${alias}`;
      if (alias) return `${base} - ${alias}`;
      if (bn) return `${base} - ${bn}`;
      return base;
    }
    case "Cash":
      return alias ? `Cash - ${alias}` : "Cash";
    case "Other":
      return f.other_name.trim() || alias || "Account";
  }
};

// Best-effort parse of an existing account back into the new form fields.
const parseAccount = (a: any): FormState => {
  const type = (ACCT_TYPES.includes(a.account_type) ? a.account_type : (a.account_type === "Checking" || a.account_type === "Savings" ? "Bank Account" : (a.account_type === "Credit Card" ? "Credit Card" : (a.account_type === "Cash" ? "Cash" : "Other")))) as AcctType;
  const bank = a.bank_name ?? "";
  const name = a.name ?? "";
  let alias = "";
  let other_name = "";
  if (type === "Bank Account") {
    if (bank && name.startsWith(`${bank} - `)) alias = name.slice(bank.length + 3);
    else if (bank && name === bank) alias = "";
    else alias = name; // fallback
  } else if (type === "Credit Card") {
    let rest = name;
    if (rest.startsWith("Credit Card - ")) rest = rest.slice("Credit Card - ".length);
    else if (rest === "Credit Card") rest = "";
    if (bank && rest.startsWith(`${bank} - `)) alias = rest.slice(bank.length + 3);
    else if (bank && rest === bank) alias = "";
    else alias = rest;
  } else if (type === "Cash") {
    alias = name.startsWith("Cash - ") ? name.slice(7) : (name === "Cash" ? "" : name);
  } else {
    other_name = name;
  }
  return {
    account_type: type,
    bank_name: bank,
    alias,
    other_name,
    starting_balance: String(a.starting_balance ?? "0"),
    notes: a.notes ?? "",
  };
};

function AccountFields({ f, setF }: { f: FormState; setF: (n: FormState) => void }) {
  const showBank = f.account_type === "Bank Account" || f.account_type === "Credit Card";
  const bankLabel = f.account_type === "Credit Card" ? "Bank Name / Issuer" : "Bank Name";
  return (
    <>
      <div>
        <Label>Account Type *</Label>
        <Select value={f.account_type} onValueChange={(v) => setF({ ...f, account_type: v as AcctType })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACCT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {showBank && (
        <div>
          <Label>{bankLabel} *</Label>
          <Input required value={f.bank_name} onChange={e => setF({ ...f, bank_name: e.target.value })} placeholder="e.g. Fidelity, RBC, CIBC" />
        </div>
      )}
      {f.account_type === "Other" && (
        <div>
          <Label>Name *</Label>
          <Input required value={f.other_name} onChange={e => setF({ ...f, other_name: e.target.value })} />
        </div>
      )}
      <div>
        <Label>Starting Balance</Label>
        <Input type="number" step="0.01" value={f.starting_balance} onChange={e => setF({ ...f, starting_balance: e.target.value })} />
      </div>
      <div>
        <Label>Alias / Nickname (optional)</Label>
        <Input value={f.alias} onChange={e => setF({ ...f, alias: e.target.value })} placeholder="e.g. Business Account, Wallet" />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
      </div>
    </>
  );
}

export default function Accounts() {
  const { data: accounts = [] } = useAccounts();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank);
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState<FormState>(blank);

  const openEdit = (a: any) => {
    setEditing(a);
    setEditForm(parseAccount(a));
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const newSb = parseFloat(editForm.starting_balance) || 0;
    const oldSb = Number(editing.starting_balance) || 0;
    const delta = newSb - oldSb;
    const newCurrent = Number(editing.current_balance) + delta;
    const display = computeDisplayName(editForm);
    if (!display) return toast.error("Please complete the required fields");
    const { error } = await supabase.from("accounts").update({
      name: display,
      bank_name: (editForm.account_type === "Bank Account" || editForm.account_type === "Credit Card") ? (editForm.bank_name || null) : null,
      account_type: editForm.account_type,
      starting_balance: newSb,
      current_balance: newCurrent,
      notes: editForm.notes || null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Account updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const sb = parseFloat(form.starting_balance) || 0;
    const display = computeDisplayName(form);
    if (!display) return toast.error("Please complete the required fields");
    const { error } = await supabase.from("accounts").insert({
      user_id: user.id,
      name: display,
      bank_name: (form.account_type === "Bank Account" || form.account_type === "Credit Card") ? (form.bank_name || null) : null,
      account_type: form.account_type,
      starting_balance: sb,
      current_balance: sb,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Account added");
    setOpen(false);
    setForm(blank);
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Account deleted");
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Accounts</h1><p className="text-muted-foreground mt-1">Add and manage your bank accounts.</p></div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(blank); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Account</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <AccountFields f={form} setF={setForm} />
              <DialogFooter><Button type="submit">Save</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.length === 0 && <p className="text-muted-foreground col-span-full text-center py-12">No accounts yet.</p>}
        {accounts.map(a => (
          <Card key={a.id} className="hover:shadow-[var(--shadow-md)] transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center text-accent-foreground"><Wallet className="h-5 w-5" /></div>
                  <div>
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.account_type || "—"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete {a.name}?</AlertDialogTitle><AlertDialogDescription>This will also delete its transactions and transfers.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del(a.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold tabular-nums">{money(a.current_balance)}</div>
                <div className="text-xs text-muted-foreground">Started at {money(a.starting_balance)}</div>
              </div>
              {a.notes && <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{a.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <AccountFields f={editForm} setF={setEditForm} />
            <p className="text-xs text-muted-foreground">Changing the starting balance will adjust the current balance by the same amount. Editing details will not reset balances or unlink transactions.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
