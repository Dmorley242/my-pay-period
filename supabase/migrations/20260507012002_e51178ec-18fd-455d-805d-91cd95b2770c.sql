
CREATE TABLE public.account_holds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID NOT NULL,
  hold_name TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  released_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.account_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holds all own" ON public.account_holds
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_account_holds_account ON public.account_holds(account_id);
CREATE INDEX idx_account_holds_status ON public.account_holds(status);
