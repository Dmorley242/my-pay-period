
DROP TRIGGER IF EXISTS trg_apply_tx_balance_ins ON public.transactions;
DROP TRIGGER IF EXISTS trg_apply_tx_balance_upd ON public.transactions;
DROP TRIGGER IF EXISTS trg_apply_tx_balance_del ON public.transactions;
DROP TRIGGER IF EXISTS trg_apply_transfer_balance_ins ON public.transfers;
DROP TRIGGER IF EXISTS trg_apply_transfer_balance_upd ON public.transfers;
DROP TRIGGER IF EXISTS trg_apply_transfer_balance_del ON public.transfers;

CREATE TRIGGER trg_apply_tx_balance_ins AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_tx_balance();
CREATE TRIGGER trg_apply_tx_balance_upd AFTER UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_tx_balance();
CREATE TRIGGER trg_apply_tx_balance_del AFTER DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_tx_balance();

CREATE TRIGGER trg_apply_transfer_balance_ins AFTER INSERT ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_balance();
CREATE TRIGGER trg_apply_transfer_balance_upd AFTER UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_balance();
CREATE TRIGGER trg_apply_transfer_balance_del AFTER DELETE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_balance();

SELECT * FROM public.recalculate_account_balances();
