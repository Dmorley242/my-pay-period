CREATE TABLE public.movement_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  movement_kind text NOT NULL CHECK (movement_kind IN ('tx','transfer')),
  movement_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, movement_kind, movement_id)
);

CREATE INDEX idx_movement_orders_account ON public.movement_orders(account_id);

ALTER TABLE public.movement_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movement_orders all own" ON public.movement_orders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_movement_orders_updated_at
  BEFORE UPDATE ON public.movement_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();