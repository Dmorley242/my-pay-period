CREATE TABLE public.budget_template_sub_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  template_item_id UUID NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_template_sub_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_sub_items all own"
ON public.budget_template_sub_items
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_budget_template_sub_items_template_item ON public.budget_template_sub_items(template_item_id);

CREATE TRIGGER update_budget_template_sub_items_updated_at
BEFORE UPDATE ON public.budget_template_sub_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();