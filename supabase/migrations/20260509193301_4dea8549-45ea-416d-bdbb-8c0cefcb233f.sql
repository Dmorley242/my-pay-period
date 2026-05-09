CREATE TABLE public.budget_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pay_period_id UUID NOT NULL,
  account_id UUID NOT NULL,
  name TEXT NOT NULL,
  budget_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_items all own" ON public.budget_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.transactions ADD COLUMN budget_item_id UUID;
CREATE INDEX idx_transactions_budget_item_id ON public.transactions(budget_item_id);
CREATE INDEX idx_budget_items_pay_period_id ON public.budget_items(pay_period_id);