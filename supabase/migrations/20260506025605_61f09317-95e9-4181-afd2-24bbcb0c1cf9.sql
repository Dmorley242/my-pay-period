
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Accounts
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank_name TEXT,
  account_type TEXT,
  starting_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts all own" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pay periods
CREATE TABLE public.pay_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp all own" ON public.pay_periods FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('income','expense','transfer','both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat all own" ON public.categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income','expense','deposit','withdrawal')),
  account_id UUID NOT NULL REFERENCES public.accounts ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories ON DELETE SET NULL,
  pay_period_id UUID REFERENCES public.pay_periods ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx all own" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transfers
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  from_account_id UUID NOT NULL REFERENCES public.accounts ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES public.accounts ON DELETE CASCADE,
  pay_period_id UUID REFERENCES public.pay_periods ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tr all own" ON public.transfers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Account balance maintenance triggers
CREATE OR REPLACE FUNCTION public.apply_tx_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta NUMERIC;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    delta := CASE WHEN NEW.transaction_type IN ('income','deposit') THEN NEW.amount ELSE -NEW.amount END;
    UPDATE public.accounts SET current_balance = current_balance + delta WHERE id = NEW.account_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    delta := CASE WHEN OLD.transaction_type IN ('income','deposit') THEN -OLD.amount ELSE OLD.amount END;
    UPDATE public.accounts SET current_balance = current_balance + delta WHERE id = OLD.account_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER tx_balance AFTER INSERT OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_balance();

CREATE OR REPLACE FUNCTION public.apply_transfer_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.from_account_id;
    UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.from_account_id;
    UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_account_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER transfer_balance AFTER INSERT OR DELETE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_balance();
