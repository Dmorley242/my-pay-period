
DROP POLICY IF EXISTS "tx all own" ON public.transactions;

CREATE POLICY "tx select own" ON public.transactions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tx insert own" ON public.transactions
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
);

CREATE POLICY "tx update own" ON public.transactions
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
);

CREATE POLICY "tx delete own" ON public.transactions
FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tr all own" ON public.transfers;

CREATE POLICY "tr select own" ON public.transfers
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tr insert own" ON public.transfers
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = from_account_id AND a.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = to_account_id AND a.user_id = auth.uid())
);

CREATE POLICY "tr update own" ON public.transfers
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = from_account_id AND a.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = to_account_id AND a.user_id = auth.uid())
);

CREATE POLICY "tr delete own" ON public.transfers
FOR DELETE USING (auth.uid() = user_id);
