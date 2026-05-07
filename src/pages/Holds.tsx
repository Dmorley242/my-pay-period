import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountHolds, useAccounts } from "@/hooks/useFinanceData";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, fmtDate } from "@/lib/format";
import { Lock, Plus, X, Check } from "lucide-react";
import { toast } from "sonner";

export default function Holds() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: holds = [] } = useAccountHolds();

  const [hold_name, setHoldName] = useState("");
  const [account_id, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const accName = (id: string) => {
    const a = accounts.find(x => x.id === id);
    return a ? [a.bank_name, a.name].filter(Boolean).join(" ") : "—";
  };

  const active = useMemo(() => holds.filter(h => h.status === "active"), [holds]);
  const inactive = useMemo(() => holds.filter(h => h.status !== "active"), [holds]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amt = parseFloat(amount);
    if (!hold_name || !account_id || !(amt > 0)) return toast.error("Fill all required fields");
    const { error } = await supabase.from("account_holds").insert({
      user_id: user.id, account_id, hold_name, amount: amt, notes: notes || null, status: "active",
    });
    if (error) return toast.error(error.message);
    toast.success("Hold created");
    setHoldName(""); setAmount(""); setNotes("");
    qc.invalidateQueries({ queryKey: ["account_holds"] });
  };

  const updateStatus = async (id: string, status: "released" | "cancelled") => {
    const { error } = await supabase.from("account_holds").update({
      status, released_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "released" ? "Hold released" : "Hold cancelled");
    qc.invalidateQueries({ queryKey: ["account_holds"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lock className="h-6 w-6" />Holds</h1>
        <p className="text-sm text-muted-foreground">Reserve money inside an account without changing the real balance.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" />New Hold</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <div><Label>Hold name</Label><Input value={hold_name} onChange={e => setHoldName(e.target.value)} placeholder="Radiator Pump" required /></div>
            <div><Label>Account</Label>
              <Select value={account_id} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{[a.bank_name, a.name].filter(Boolean).join(" ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
            <div className="md:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
            <div className="md:col-span-2"><Button type="submit"><Plus className="h-4 w-4 mr-1" />Add Hold</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Active Holds ({active.length})</CardTitle></CardHeader>
        <CardContent>
          {active.length === 0 && <p className="text-sm text-muted-foreground">No active holds.</p>}
          <div className="divide-y">
            {active.map(h => (
              <div key={h.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{h.hold_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{accName(h.account_id)} · {fmtDate(h.created_at)}{h.notes ? ` · ${h.notes}` : ""}</div>
                </div>
                <div className="font-semibold tabular-nums shrink-0">{money(h.amount)}</div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(h.id, "released")}><Check className="h-4 w-4 mr-1" />Release</Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(h.id, "cancelled")}><X className="h-4 w-4 mr-1" />Cancel</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">History ({inactive.length})</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowInactive(s => !s)}>{showInactive ? "Hide" : "Show"}</Button>
        </CardHeader>
        {showInactive && (
          <CardContent>
            {inactive.length === 0 && <p className="text-sm text-muted-foreground">No past holds.</p>}
            <div className="divide-y">
              {inactive.map(h => (
                <div key={h.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{h.hold_name} <span className="text-xs uppercase ml-2 text-muted-foreground">{h.status}</span></div>
                    <div className="text-xs text-muted-foreground truncate">{accName(h.account_id)} · {fmtDate(h.created_at)}</div>
                  </div>
                  <div className="font-semibold tabular-nums shrink-0 text-muted-foreground">{money(h.amount)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
