CREATE OR REPLACE FUNCTION public.recalculate_account_balances(_user_id uuid DEFAULT NULL)
RETURNS TABLE(account_id uuid, account_name text, old_balance numeric, new_balance numeric, difference numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc RECORD;
  computed NUMERIC;
  tx_sum NUMERIC;
  tr_out NUMERIC;
  tr_in NUMERIC;
BEGIN
  FOR acc IN
    SELECT a.id, a.name, a.starting_balance, a.current_balance, a.user_id
    FROM public.accounts a
    WHERE (_user_id IS NULL OR a.user_id = _user_id)
  LOOP
    SELECT COALESCE(SUM(
      CASE WHEN t.transaction_type IN ('income','deposit') THEN t.amount ELSE -t.amount END
    ), 0) INTO tx_sum
    FROM public.transactions t
    WHERE t.account_id = acc.id;

    SELECT COALESCE(SUM(amount), 0) INTO tr_out
    FROM public.transfers WHERE from_account_id = acc.id;

    SELECT COALESCE(SUM(amount), 0) INTO tr_in
    FROM public.transfers WHERE to_account_id = acc.id;

    computed := COALESCE(acc.starting_balance, 0) + tx_sum - tr_out + tr_in;

    RAISE NOTICE 'Account % (%): old=% new=% diff=%',
      acc.name, acc.id, acc.current_balance, computed, computed - acc.current_balance;

    account_id := acc.id;
    account_name := acc.name;
    old_balance := acc.current_balance;
    new_balance := computed;
    difference := computed - acc.current_balance;
    RETURN NEXT;

    UPDATE public.accounts SET current_balance = computed WHERE id = acc.id;
  END LOOP;
END;
$$;

-- Run the repair once for all accounts
SELECT * FROM public.recalculate_account_balances();