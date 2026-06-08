ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS client_sync_id text;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS client_sync_id text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_client_sync_id_unique ON public.transactions (user_id, client_sync_id) WHERE client_sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transfers_user_client_sync_id_unique ON public.transfers (user_id, client_sync_id) WHERE client_sync_id IS NOT NULL;