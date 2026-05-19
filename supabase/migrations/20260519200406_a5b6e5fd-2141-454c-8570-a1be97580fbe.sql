
-- Centralized balance impact: handle INSERT, UPDATE, DELETE for transactions
CREATE OR REPLACE FUNCTION public.apply_tx_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  old_delta NUMERIC;
  new_delta NUMERIC;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    new_delta := CASE WHEN NEW.transaction_type IN ('income','deposit') THEN NEW.amount ELSE -NEW.amount END;
    UPDATE public.accounts SET current_balance = current_balance + new_delta WHERE id = NEW.account_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    old_delta := CASE WHEN OLD.transaction_type IN ('income','deposit') THEN -OLD.amount ELSE OLD.amount END;
    UPDATE public.accounts SET current_balance = current_balance + old_delta WHERE id = OLD.account_id;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Reverse old impact on old account
    old_delta := CASE WHEN OLD.transaction_type IN ('income','deposit') THEN -OLD.amount ELSE OLD.amount END;
    UPDATE public.accounts SET current_balance = current_balance + old_delta WHERE id = OLD.account_id;
    -- Apply new impact on new account
    new_delta := CASE WHEN NEW.transaction_type IN ('income','deposit') THEN NEW.amount ELSE -NEW.amount END;
    UPDATE public.accounts SET current_balance = current_balance + new_delta WHERE id = NEW.account_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $function$;

-- Centralized balance impact: handle INSERT, UPDATE, DELETE for transfers
CREATE OR REPLACE FUNCTION public.apply_transfer_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.from_account_id;
    UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.from_account_id;
    UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_account_id;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Reverse old transfer on old accounts
    UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.from_account_id;
    UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_account_id;
    -- Apply new transfer on new accounts
    UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.from_account_id;
    UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $function$;

-- Ensure triggers exist for all relevant ops (drop+recreate to be safe)
DROP TRIGGER IF EXISTS trg_apply_tx_balance_ins ON public.transactions;
DROP TRIGGER IF EXISTS trg_apply_tx_balance_upd ON public.transactions;
DROP TRIGGER IF EXISTS trg_apply_tx_balance_del ON public.transactions;
DROP TRIGGER IF EXISTS trg_apply_tx_balance ON public.transactions;

CREATE TRIGGER trg_apply_tx_balance_ins
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_balance();

CREATE TRIGGER trg_apply_tx_balance_upd
AFTER UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_balance();

CREATE TRIGGER trg_apply_tx_balance_del
AFTER DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_balance();

DROP TRIGGER IF EXISTS trg_apply_transfer_balance_ins ON public.transfers;
DROP TRIGGER IF EXISTS trg_apply_transfer_balance_upd ON public.transfers;
DROP TRIGGER IF EXISTS trg_apply_transfer_balance_del ON public.transfers;
DROP TRIGGER IF EXISTS trg_apply_transfer_balance ON public.transfers;

CREATE TRIGGER trg_apply_transfer_balance_ins
AFTER INSERT ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_balance();

CREATE TRIGGER trg_apply_transfer_balance_upd
AFTER UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_balance();

CREATE TRIGGER trg_apply_transfer_balance_del
AFTER DELETE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_balance();
