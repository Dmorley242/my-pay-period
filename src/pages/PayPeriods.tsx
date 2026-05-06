import { useState } from "react";
import { usePayPeriods } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";

// Helper: next pay period starting on the 27th
const defaultNext = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 27);
  if (today.getDate() >= 27) start.setMonth(start.getMonth() + 1);
  // adjust: start = previous month's 27 if today < 27
  if (today.getDate() < 27) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 26);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end), name: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
};

export default function PayPeriods() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: periods = [] } = usePayPeriods();
  const init = defaultNext();
  const [name, setName] = useState(init.name);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("pay_periods").insert({
      user_id: user.id, name, start_date: start, end_date: end, is_active: periods.length === 0,
    });
    if (error) return toast.error(error.message);
    toast.success("Pay period added");
    qc.invalidateQueries({ queryKey: ["pay_periods"] });
  };

  const setActive = async (id: string) => {
    if (!user) return;
    await supabase.from("pay_periods").update({ is_active: false }).eq("user_id", user.id);
    await supabase.from("pay_periods").update({ is_active: true }).eq("id", id);
    toast.success("Active period set");
    qc.invalidateQueries({ queryKey: ["pay_periods"] });
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("pay_periods").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["pay_periods"] });
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Pay Periods</h1><p className="text-muted-foreground mt-1">Your pay period starts on the 27th. Track income & expenses by cycle.</p></div>

      <Card>
        <CardHeader><CardTitle>New Pay Period</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-3 md:grid-cols-4 items-end">
            <div className="md:col-span-2"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div><Label>End</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
            <Button type="submit" className="md:col-span-4 md:w-auto"><Plus className="h-4 w-4 mr-1" />Add Period</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All Pay Periods</CardTitle></CardHeader>
        <CardContent>
          {periods.length === 0 && <p className="text-sm text-muted-foreground">No pay periods yet.</p>}
          <div className="divide-y">
            {periods.map(p => (
              <div key={p.id} className="flex items-center justify-between py-3 gap-3">
                <div>
                  <div className="font-medium flex items-center gap-2">{p.name}{p.is_active && <Badge className="bg-primary text-primary-foreground">Active</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</div>
                </div>
                <div className="flex gap-1">
                  {!p.is_active && <Button variant="outline" size="sm" onClick={() => setActive(p.id)}><CheckCircle2 className="h-4 w-4 mr-1" />Set active</Button>}
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
