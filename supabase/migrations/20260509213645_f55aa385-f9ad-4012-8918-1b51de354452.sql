
CREATE TABLE public.budget_sub_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  budget_item_id UUID NOT NULL REFERENCES public.budget_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.budget_sub_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_items all own" ON public.budget_sub_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_budget_sub_items_updated_at
  BEFORE UPDATE ON public.budget_sub_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
