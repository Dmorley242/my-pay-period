import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PendingOfflineBar } from "@/components/PendingOfflineBar";

const TABLES = [
  "accounts","transactions","transfers","pay_periods",
  "budget_items","budget_sub_items","budget_templates",
  "budget_template_items","budget_template_sub_items",
  "account_holds","categories","recurring_expense_applications","profiles",
] as const;

export default function Backup() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    if (!user) return toast.error("Not signed in");
    setBusy(true);
    try {
      const data: Record<string, unknown[]> = {};
      for (const t of TABLES) {
        // RLS already restricts to current user; profiles uses id = auth.uid()
        const { data: rows, error } = await (supabase as any).from(t).select("*");
        if (error) throw new Error(`${t}: ${error.message}`);
        data[t] = rows || [];
      }
      const payload = {
        exported_at: new Date().toISOString(),
        app: "Money Tracker",
        user_id: user.id,
        data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `money-tracker-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Backup</h1>
        <p className="text-muted-foreground mt-1">Download a private copy of your data.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Export My Data</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Downloads a JSON file containing only your account's data: accounts, transactions,
            transfers, pay periods, budgets, templates, holds, categories, and profile.
            No passwords or secrets are included.
          </p>
          <Button onClick={exportData} disabled={busy}>
            <Download className="h-4 w-4 mr-2" />
            {busy ? "Exporting..." : "Export My Data"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
