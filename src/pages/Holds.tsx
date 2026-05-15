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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { money, fmtDate, accountLabel } from "@/lib/format";
import { Lock, Plus, X, Check, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";

type HoldType = "reserve_hold" | "savings_goal";

export default function Holds() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: holds = [] } = useAccountHolds();

  const [holdType, setHoldType] = useState<HoldType>("reserve_hold");
  const [hold_name, setHoldName] = useState("");
  const [account_id, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [increaseId, setIncreaseId] = useState<string | null>(null);
  const [increaseAmt, setIncreaseAmt] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const accName = (id: string) => {
    const a = accounts.find(x => x.id === id);
    return a ? accountLabel(a) : "—";
  };

  const active = useMemo(() => holds.filter(h => h.status === "active"), [holds]);
  const inactive = useMemo(() => holds.filter(h => h.status !== "active"), [holds]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amt = parseFloat(amount);
    const goal = holdType === "savings_goal" ? parseFloat(goalAmount) : null;
    if (!hold_name || !account_id) return toast.error("Fill all required fields");
    if (holdType === "reserve_hold" && !(amt > 0)) return toast.error("Amount required");
    if (holdType === "savings_goal" && !(goal! > 0)) return toast.error("Goal amount required");
    const startAmt = holdType === "savings_goal" ? (amount ? amt : 0) : amt;

    const { error } = await supabase.from("account_holds").insert({
      user_id: user.id, account_id, hold_name,
      amount: startAmt, notes: notes || null, status: "active",
      hold_type: holdType, goal_amount: goal,
    });
    if (error) return toast.error(friendlyError(error));
    toast.success(holdType === "savings_goal" ? "Savings goal created" : "Hold created");
    setHoldName(""); setAmount(""); setGoalAmount(""); setNotes("");
    setFormOpen(false);
    qc.invalidateQueries({ queryKey: ["account_holds"] });
  };

  const updateStatus = async (id: string, status: "released" | "cancelled") => {
    const { error } = await supabase.from("account_holds").update({
      status, released_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success(status === "released" ? "Hold released" : "Hold cancelled");
    qc.invalidateQueries({ queryKey: ["account_holds"] });
  };

  const submitIncrease = async () => {
    if (!increaseId) return;
    const add = parseFloat(increaseAmt);
    if (!(add > 0)) return toast.error("Enter an amount");
    const h = holds.find(x => x.id === increaseId);
    if (!h) return;
    const { error } = await supabase.from("account_holds")
      .update({ amount: Number(h.amount) + add }).eq("id", increaseId);
    if (error) return toast.error(friendlyError(error));
    toast.success("Held amount increased");
    setIncreaseId(null); setIncreaseAmt("");
    qc.invalidateQueries({ queryKey: ["account_holds"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Lock className="h-6 w-6" />Holds</h1>
          <p className="text-sm text-muted-foreground">Reserve money or save toward goals without changing real balances.</p>
        </div>
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />New Hold</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New Hold</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <Tabs value={holdType} onValueChange={(v) => setHoldType(v as HoldType)}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="reserve_hold"><Lock className="h-4 w-4 mr-1" />Reserve Hold</TabsTrigger>
                  <TabsTrigger value="savings_goal"><Target className="h-4 w-4 mr-1" />Savings Goal</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div className="md:col-span-2"><Label>Hold name</Label><Input value={hold_name} onChange={e => setHoldName(e.target.value)} placeholder={holdType === "savings_goal" ? "Home Gym" : "Radiator Pump"} required /></div>
                <div className="md:col-span-2"><Label>Account</Label>
                  <Select value={account_id} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{accountLabel(a)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {holdType === "reserve_hold" ? (
                  <div className="md:col-span-2"><Label>Amount</Label><Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
                ) : (
                  <>
                    <div><Label>Goal Amount</Label><Input type="number" inputMode="decimal" step="0.01" min="0" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} required /></div>
                    <div><Label>Starting Hold Amount</Label><Input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
                  </>
                )}
                <div className="md:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button type="submit"><Plus className="h-4 w-4 mr-1" />Add {holdType === "savings_goal" ? "Goal" : "Hold"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active Holds ({active.length})</CardTitle></CardHeader>
        <CardContent>
          {active.length === 0 && <p className="text-sm text-muted-foreground">No active holds.</p>}
          <div className="divide-y">
            {active.map(h => {
              const isGoal = h.hold_type === "savings_goal";
              const goal = Number(h.goal_amount ?? 0);
              const held = Number(h.amount);
              const pct = isGoal && goal > 0 ? Math.min(100, (held / goal) * 100) : 0;
              return (
                <div key={h.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate flex items-center gap-2">
                        {isGoal ? <Target className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        {h.hold_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{accName(h.account_id)} · {fmtDate(h.created_at)}{h.notes ? ` · ${h.notes}` : ""}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold tabular-nums">{money(held)}</div>
                      {isGoal && <div className="text-xs text-muted-foreground tabular-nums">of {money(goal)}</div>}
                    </div>
                  </div>
                  {isGoal && <Progress value={pct} className="h-1.5" />}
                  <div className="flex gap-1 flex-wrap">
                    {isGoal && (
                      <Button size="sm" variant="outline" onClick={() => { setIncreaseId(h.id); setIncreaseAmt(""); }}>
                        <TrendingUp className="h-4 w-4 mr-1" />Increase
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => updateStatus(h.id, "released")}><Check className="h-4 w-4 mr-1" />Release</Button>
                    <Button size="sm" variant="ghost" onClick={() => updateStatus(h.id, "cancelled")}><X className="h-4 w-4 mr-1" />Cancel</Button>
                  </div>
                </div>
              );
            })}
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

      <Dialog open={!!increaseId} onOpenChange={(o) => !o && setIncreaseId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Increase Held Amount</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Amount to add</Label>
            <Input type="number" inputMode="decimal" step="0.01" min="0" value={increaseAmt} onChange={e => setIncreaseAmt(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIncreaseId(null)}>Cancel</Button>
            <Button onClick={submitIncrease}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
