import { useState } from "react";
import { useCategories } from "@/hooks/useFinanceData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

const SEEDS = ["Salary","Groceries","Gas","Food","Bills","Savings","Business","Personal","Debt","Emergency"];

export default function Categories() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cats = [] } = useCategories();
  const [name, setName] = useState("");
  const [type, setType] = useState<"income"|"expense"|"transfer"|"both">("expense");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    const { error } = await supabase.from("categories").insert({ user_id: user.id, name: name.trim(), category_type: type });
    if (error) return toast.error(friendlyError(error));
    setName("");
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const seed = async () => {
    if (!user) return;
    const existing = new Set(cats.map(c => c.name.toLowerCase()));
    const toAdd = SEEDS.filter(s => !existing.has(s.toLowerCase())).map(name => ({
      user_id: user.id, name,
      category_type: ["Salary","Business"].includes(name) ? "income" : "expense",
    }));
    if (toAdd.length === 0) return toast.info("All defaults already added");
    const { error } = await supabase.from("categories").insert(toAdd as any);
    if (error) return toast.error(friendlyError(error));
    toast.success(`Added ${toAdd.length} categories`);
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const typeColor: Record<string, string> = {
    income: "bg-income/10 text-income border-income/30",
    expense: "bg-expense/10 text-expense border-expense/30",
    transfer: "bg-transfer/10 text-transfer border-transfer/30",
    both: "bg-accent text-accent-foreground border-border",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-3xl font-bold">Categories</h1><p className="text-muted-foreground mt-1">Organize transactions with custom categories.</p></div>
        <Button variant="outline" onClick={seed}>Add Default Categories</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>New Category</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Groceries" /></div>
            <div className="w-40"><Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit"><Plus className="h-4 w-4 mr-1" />Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your Categories ({cats.length})</CardTitle></CardHeader>
        <CardContent>
          {cats.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
          <div className="flex flex-wrap gap-2">
            {cats.map(c => (
              <div key={c.id} className={`group flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${typeColor[c.category_type]}`}>
                <span>{c.name}</span>
                <span className="text-[10px] uppercase opacity-70">{c.category_type}</span>
                <button onClick={() => del(c.id)} className="opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
