DROP TRIGGER IF EXISTS tx_balance ON public.transactions;
DROP TRIGGER IF EXISTS transfer_balance ON public.transfers;
SELECT public.recalculate_account_balances();