ALTER TABLE public.pay_periods
  ADD COLUMN IF NOT EXISTS income_source TEXT,
  ADD COLUMN IF NOT EXISTS net_pay_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS paycheck_account_id UUID,
  ADD COLUMN IF NOT EXISTS paycheck_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT;