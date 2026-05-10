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
import { money } from "@/lib/format";
import { Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Accounts() {
  const { data: accounts = [] } = useAccounts();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", bank_name: "", account_type: "Checking", starting_balance: "0", notes: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const sb = parseFloat(form.starting_balance) || 0;
    const { error } = await supabase.from("accounts").insert({
      user_id: user.id, name: form.name, bank_name: form.bank_name || null,
      account_type: form.account_type || null, starting_balance: sb, current_balance: sb,
      notes: form.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Account added");
    setOpen(false);
    setForm({ name: "", bank_name: "", account_type: "Checking", starting_balance: "0", notes: "" });
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Account</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Account Name *</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Groceries, Gas, Spending Money, Savings" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Bank</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Fidelity, CIBC, Commonwealth Bank, RBC" /></div>
                <div>
                  <Label>Account Type</Label>
                  <Select value={form.account_type} onValueChange={v => setForm({ ...form, account_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Checking">Checking</SelectItem>
                      <SelectItem value="Savings">Savings</SelectItem>
                      <SelectItem value="Credit Card">Credit Card</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Starting Balance</Label><Input type="number" step="0.01" value={form.starting_balance} onChange={e => setForm({ ...form, starting_balance: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
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
                    <div className="text-xs text-muted-foreground">{[a.bank_name, a.account_type].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Delete {a.name}?</AlertDialogTitle><AlertDialogDescription>This will also delete its transactions and transfers.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => del(a.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
    </div>
  );
}
