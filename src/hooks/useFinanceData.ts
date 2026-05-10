import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Account = { id: string; name: string; bank_name: string | null; account_type: string | null; starting_balance: number; current_balance: number; notes: string | null; created_at: string; };
export type PayPeriod = { id: string; name: string; start_date: string; end_date: string; is_active: boolean; income_source: string | null; net_pay_amount: number | null; paycheck_account_id: string | null; paycheck_transaction_id: string | null; notes: string | null; };
export type Category = { id: string; name: string; category_type: "income" | "expense" | "transfer" | "both"; };
export type Transaction = { id: string; date: string; transaction_type: "income" | "expense" | "deposit" | "withdrawal"; account_id: string; category_id: string | null; pay_period_id: string | null; amount: number; notes: string | null; budget_item_id?: string | null; };
export type RecurringFields = { is_recurring?: boolean; recurring_name?: string | null; recurring_amount?: number | null; recurring_date?: number | null; recurring_frequency?: string | null; };
export type BudgetItem = { id: string; user_id: string; pay_period_id: string; account_id: string; name: string; budget_amount: number; notes: string | null; created_at: string; } & RecurringFields;
export type Transfer = { id: string; date: string; from_account_id: string; to_account_id: string; pay_period_id: string | null; amount: number; notes: string | null; };

export const useAccounts = () => useQuery({
  queryKey: ["accounts"],
  queryFn: async () => {
    const { data, error } = await supabase.from("accounts").select("*").order("created_at");
    if (error) throw error; return (data || []) as Account[];
  },
});

export const usePayPeriods = () => useQuery({
  queryKey: ["pay_periods"],
  queryFn: async () => {
    const { data, error } = await supabase.from("pay_periods").select("*").order("start_date", { ascending: false });
    if (error) throw error; return (data || []) as PayPeriod[];
  },
});

export const useActivePayPeriod = () => {
  const { data } = usePayPeriods();
  return data?.find(p => p.is_active) ?? null;
};

export const useCategories = () => useQuery({
  queryKey: ["categories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("categories").select("*").order("name");
    if (error) throw error; return (data || []) as Category[];
  },
});

export const useTransactions = () => useQuery({
  queryKey: ["transactions"],
  queryFn: async () => {
    const { data, error } = await supabase.from("transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error; return (data || []) as Transaction[];
  },
});

export type AccountHold = { id: string; account_id: string; hold_name: string; amount: number; status: "active" | "released" | "cancelled"; notes: string | null; created_at: string; released_at: string | null; hold_type: "reserve_hold" | "savings_goal"; goal_amount: number | null; };

export const useAccountHolds = () => useQuery({
  queryKey: ["account_holds"],
  queryFn: async () => {
    const { data, error } = await supabase.from("account_holds").select("*").order("created_at", { ascending: false });
    if (error) throw error; return (data || []) as AccountHold[];
  },
});

export const useTransfers = () => useQuery({
  queryKey: ["transfers"],
  queryFn: async () => {
    const { data, error } = await supabase.from("transfers").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error; return (data || []) as Transfer[];
  },
});

export const useBudgetItems = () => useQuery({
  queryKey: ["budget_items"],
  queryFn: async () => {
    const { data, error } = await (supabase as any).from("budget_items").select("*").order("created_at", { ascending: false });
    if (error) throw error; return (data || []) as BudgetItem[];
  },
});

export type BudgetTemplate = { id: string; user_id: string; name: string; notes: string | null; created_at: string; updated_at: string; };
export type BudgetTemplateItem = { id: string; user_id: string; template_id: string; account_id: string; name: string; budget_amount: number; created_at: string; updated_at: string; };

export const useBudgetTemplates = () => useQuery({
  queryKey: ["budget_templates"],
  queryFn: async () => {
    const { data, error } = await (supabase as any).from("budget_templates").select("*").order("created_at", { ascending: false });
    if (error) throw error; return (data || []) as BudgetTemplate[];
  },
});

export const useBudgetTemplateItems = () => useQuery({
  queryKey: ["budget_template_items"],
  queryFn: async () => {
    const { data, error } = await (supabase as any).from("budget_template_items").select("*").order("created_at", { ascending: false });
    if (error) throw error; return (data || []) as BudgetTemplateItem[];
  },
});

export type BudgetSubItem = { id: string; user_id: string; budget_item_id: string; name: string; amount: number; created_at: string; updated_at: string; };

export const useBudgetSubItems = () => useQuery({
  queryKey: ["budget_sub_items"],
  queryFn: async () => {
    const { data, error } = await (supabase as any).from("budget_sub_items").select("*").order("created_at", { ascending: true });
    if (error) throw error; return (data || []) as BudgetSubItem[];
  },
});

export type BudgetTemplateSubItem = { id: string; user_id: string; template_item_id: string; name: string; amount: number; created_at: string; updated_at: string; };

export const useBudgetTemplateSubItems = () => useQuery({
  queryKey: ["budget_template_sub_items"],
  queryFn: async () => {
    const { data, error } = await (supabase as any).from("budget_template_sub_items").select("*").order("created_at", { ascending: true });
    if (error) throw error; return (data || []) as BudgetTemplateSubItem[];
  },
});
