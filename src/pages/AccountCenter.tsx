import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

const EXPORT_TABLES = [
  "accounts", "transactions", "transfers", "pay_periods",
  "budget_items", "budget_sub_items", "budget_templates",
  "budget_template_items", "budget_template_sub_items",
  "account_holds", "categories", "recurring_expense_applications",
  "movement_orders", "profiles",
] as const;

// child -> parent order
const DELETE_TABLES = [
  "recurring_expense_applications",
  "movement_orders",
  "account_holds",
  "budget_template_sub_items",
  "budget_template_items",
  "budget_sub_items",
  "budget_items",
  "budget_templates",
  "transactions",
  "transfers",
  "pay_periods",
  "categories",
  "accounts",
] as const;

const LOCAL_KEYS = ["offlineQueue:v1", "syncAudit:v1", "app:customTitle"];

export default function AccountCenter() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const exportData = async () => {
    if (!user) return toast.error("Not signed in");
    setBusy(true);
    try {
      const data: Record<string, unknown[]> = {};
      for (const t of EXPORT_TABLES) {
        const { data: rows, error } = await (supabase as any).from(t).select("*");
        if (error) {
          // Skip tables that don't exist; surface other errors
          if (/does not exist|schema cache/i.test(error.message)) continue;
          throw new Error(`${t}: ${error.message}`);
        }
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

  const closeReset = () => {
    if (resetBusy) return;
    setResetOpen(false);
    setPassword("");
    setConfirmed(false);
    setResetError(null);
  };

  const doReset = async () => {
    if (!user?.email) {
      setResetError("Not signed in");
      return;
    }
    if (!confirmed) {
      setResetError("Please confirm before continuing.");
      return;
    }
    if (!password) {
      setResetError("Enter your password.");
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authErr) {
        setResetError("Password verification failed.");
        setResetBusy(false);
        return;
      }

      for (const t of DELETE_TABLES) {
        const { error } = await (supabase as any).from(t).delete().eq("user_id", user.id);
        if (error) {
          if (/does not exist|schema cache|column .* does not exist/i.test(error.message)) {
            continue;
          }
          throw new Error(`${t}: ${error.message}`);
        }
      }

      for (const k of LOCAL_KEYS) {
        try { localStorage.removeItem(k); } catch {}
      }

      qc.clear();

      toast.success("App data cleared. You're starting fresh.");
      setResetOpen(false);
      setPassword("");
      setConfirmed(false);
      nav("/");
    } catch (e: any) {
      setResetError(e.message || "Reset failed");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account Center</h1>
        <p className="text-muted-foreground mt-1">Manage your account and app data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
          <CardDescription>{user?.email ?? "—"}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export My Data</CardTitle>
          <CardDescription>
            Downloads a private JSON backup of your app data. No passwords or secrets are included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportData} disabled={busy}>
            <Download className="h-4 w-4 mr-2" />
            {busy ? "Exporting..." : "Export My Data"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Clear App Data
          </CardTitle>
          <CardDescription>
            This will delete your app data and reset the app to a blank starting state.
            Your login account will not be deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setResetOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear App Data
          </Button>
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={(o) => (o ? setResetOpen(true) : closeReset())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear App Data</DialogTitle>
            <DialogDescription>
              This permanently deletes your accounts, transactions, transfers, budgets, templates,
              holds, categories, pay periods, and pending offline data. Your login account is kept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reset-pass">Confirm your password</Label>
              <Input
                id="reset-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                className="mt-0.5"
              />
              <span>I understand this will clear my app data.</span>
            </label>
            {resetError && (
              <p className="text-sm text-destructive">{resetError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReset} disabled={resetBusy}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={doReset}
              disabled={resetBusy || !confirmed || !password}
            >
              {resetBusy ? "Clearing..." : "Clear App Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
