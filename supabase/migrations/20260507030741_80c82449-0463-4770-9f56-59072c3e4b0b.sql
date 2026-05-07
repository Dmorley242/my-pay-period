ALTER TABLE public.account_holds
  ADD COLUMN IF NOT EXISTS hold_type text NOT NULL DEFAULT 'reserve_hold',
  ADD COLUMN IF NOT EXISTS goal_amount numeric;