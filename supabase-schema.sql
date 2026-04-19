-- Supabase Schema for PreoCryptoFX

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'marketer', 'admin')),
    demo_balance NUMERIC DEFAULT 10000,
    real_balance NUMERIC DEFAULT 0,
    active_account TEXT DEFAULT 'DEMO' CHECK (active_account IN ('DEMO', 'REAL')),
    verification_status TEXT DEFAULT 'not_verified' CHECK (verification_status IN ('not_verified', 'pending', 'verified')),
    verification_documents JSONB,
    verification_submitted_at BIGINT,
    total_profit_real NUMERIC DEFAULT 0,
    total_profit_demo NUMERIC DEFAULT 0,
    daily_profit_real NUMERIC DEFAULT 0,
    daily_profit_demo NUMERIC DEFAULT 0,
    last_profit_reset_date TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAW')),
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'rejected')),
    account_type TEXT NOT NULL CHECK (account_type IN ('DEMO', 'REAL')),
    method TEXT,
    external_id TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Trades Table
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    coin TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
    price NUMERIC NOT NULL,
    status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    profit NUMERIC DEFAULT 0,
    account_type TEXT NOT NULL CHECK (account_type IN ('DEMO', 'REAL')),
    duration INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Bot Settings Table
CREATE TABLE IF NOT EXISTS public.bot_settings (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
    scalping_active BOOLEAN DEFAULT FALSE,
    trend_active BOOLEAN DEFAULT FALSE,
    ai_active BOOLEAN DEFAULT FALSE,
    custom_active BOOLEAN DEFAULT FALSE,
    custom_config JSONB
);

-- 5. Helper function to check if user is admin (Strictly by email and ID for double security)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Allow the Service Role (the backend server) to perform updates
  IF (auth.role() = 'service_role') THEN
    RETURN TRUE;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND email = 'wren20688@gmail.com'
      AND id = '304020c9-3695-4f8f-85fe-9ee12eda8152'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5b. Prevent unauthorized role or balance changes by users
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If the requester is not a verified admin email
  IF NOT public.is_admin() THEN
    -- Prevent changing role
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
      NEW.role := OLD.role;
    END IF;
    -- Prevent changing real balance directly
    IF (OLD.real_balance IS DISTINCT FROM NEW.real_balance) THEN
      NEW.real_balance := OLD.real_balance;
    END IF;
    -- Prevent changing demo balance (optional, but safer)
    -- IF (OLD.demo_balance IS DISTINCT FROM NEW.demo_balance) THEN
    --   NEW.demo_balance := OLD.demo_balance;
    -- END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_protect_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_fields();

-- 6. Trigger to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := CASE WHEN NEW.email IN ('wren20688@gmail.com') THEN 'admin' ELSE 'user' END;

  -- Update auth.users metadata to include the role (this allows auth.jwt() to see it)
  UPDATE auth.users SET raw_user_meta_data = 
    jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', to_jsonb(user_role))
  WHERE id = NEW.id;

  INSERT INTO public.users (id, username, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    user_role
  );
  
  INSERT INTO public.bot_settings (user_id) VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. One-time migration to sync roles to metadata for existing users
-- Run this manually in SQL Editor if you already have users:
-- UPDATE auth.users
-- SET raw_user_meta_data = 
--   jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', to_jsonb(public.users.role))
-- FROM public.users
-- WHERE auth.users.id = public.users.id;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Auto-process pending items (Verification ONLY)
-- This function can be called via RPC or scheduled with pg_cron
CREATE OR REPLACE FUNCTION public.auto_process_pending()
RETURNS void AS $$
BEGIN
  -- Auto-verify users pending for more than 5-10 minutes (average 7.5 mins = 450000ms)
  -- Note: verification_submitted_at is BIGINT (ms)
  UPDATE public.users
  SET verification_status = 'verified'
  WHERE verification_status = 'pending'
    AND verification_submitted_at IS NOT NULL
    AND (EXTRACT(EPOCH FROM NOW()) * 1000) - verification_submitted_at > 450000;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id OR is_admin());

CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can insert their own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY "Admins can update transactions" ON public.transactions FOR UPDATE USING (is_admin());

CREATE POLICY "Users can view their own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can insert their own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can update their own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can delete their own trades" ON public.trades FOR DELETE USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can view their own bot settings" ON public.bot_settings FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can update their own bot settings" ON public.bot_settings FOR UPDATE USING (auth.uid() = user_id OR is_admin());
