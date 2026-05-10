
ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_name text,
  ADD COLUMN IF NOT EXISTS recurring_amount numeric,
  ADD COLUMN IF NOT EXISTS recurring_date integer,
  ADD COLUMN IF NOT EXISTS recurring_frequency text;

ALTER TABLE public.budget_sub_items
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_name text,
  ADD COLUMN IF NOT EXISTS recurring_amount numeric,
  ADD COLUMN IF NOT EXISTS recurring_date integer,
  ADD COLUMN IF NOT EXISTS recurring_frequency text;

ALTER TABLE public.budget_template_items
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_name text,
  ADD COLUMN IF NOT EXISTS recurring_amount numeric,
  ADD COLUMN IF NOT EXISTS recurring_date integer,
  ADD COLUMN IF NOT EXISTS recurring_frequency text;

ALTER TABLE public.budget_template_sub_items
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_name text,
  ADD COLUMN IF NOT EXISTS recurring_amount numeric,
  ADD COLUMN IF NOT EXISTS recurring_date integer,
  ADD COLUMN IF NOT EXISTS recurring_frequency text;

CREATE TABLE IF NOT EXISTS public.recurring_expense_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_item_id uuid,
  budget_sub_item_id uuid,
  pay_period_id uuid NOT NULL,
  transaction_id uuid,
  applied_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_expense_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rea all own" ON public.recurring_expense_applications;
CREATE POLICY "rea all own"
  ON public.recurring_expense_applications
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS rea_unique_item
  ON public.recurring_expense_applications (user_id, pay_period_id, budget_item_id)
  WHERE budget_sub_item_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rea_unique_sub
  ON public.recurring_expense_applications (user_id, pay_period_id, budget_sub_item_id)
  WHERE budget_sub_item_id IS NOT NULL;
