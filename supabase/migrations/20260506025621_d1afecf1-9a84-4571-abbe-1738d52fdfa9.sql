
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_tx_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_transfer_balance() FROM PUBLIC, anon, authenticated;
