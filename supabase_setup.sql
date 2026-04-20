-- Supabase Database Setup for PreoCryptoFX
-- This script contains all tables, security logic, and initial roles.

-- 1. BASE TABLES
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'user',
    demo_balance NUMERIC DEFAULT 10000,
    real_balance NUMERIC DEFAULT 0,
    active_account TEXT DEFAULT 'DEMO',
    verification_status TEXT DEFAULT 'not_verified',
    verification_documents JSONB,
    verification_submitted_at BIGINT,
    total_profit_real NUMERIC DEFAULT 0,
    total_profit_demo NUMERIC DEFAULT 0,
    daily_profit_real NUMERIC DEFAULT 0,
    daily_profit_demo NUMERIC DEFAULT 0,
    last_profit_reset_date TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL, 
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending',
    account_type TEXT NOT NULL,
    method TEXT,
    external_id TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.trades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    coin TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL,
    price NUMERIC NOT NULL,
    status TEXT DEFAULT 'OPEN',
    profit NUMERIC DEFAULT 0,
    account_type TEXT NOT NULL,
    duration INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bot_settings (
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
    scalping_active BOOLEAN DEFAULT FALSE,
    trend_active BOOLEAN DEFAULT FALSE,
    ai_active BOOLEAN DEFAULT FALSE,
    custom_active BOOLEAN DEFAULT FALSE,
    custom_config JSONB
);

-- 2. SECURITY FUNCTIONS
-- Checks if requester is a authorized admin by hardcoded ID and email
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
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

-- Prevents users from changing their own roles or sensitive data via SQL injection
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_protect_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_fields();

-- 3. CORE TRIGGER: Handle automatic setup of new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Auto-assign admin role based on hardcoded email
  user_role := CASE WHEN NEW.email = 'wren20688@gmail.com' THEN 'admin' ELSE 'user' END;

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

IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
END IF;

-- 4. UTILITY FUNCTIONS
-- Marks transactions as failed if older than 15 minutes (to be called by cron/rpc)
CREATE OR REPLACE FUNCTION public.auto_process_pending()
RETURNS void AS $$
BEGIN
  -- Verify users pending for > 7.5 mins
  UPDATE public.users SET verification_status = 'verified'
  WHERE verification_status = 'pending' AND verification_submitted_at IS NOT NULL
    AND (EXTRACT(EPOCH FROM NOW()) * 1000) - verification_submitted_at > 450000;

  -- Reject stale deposits > 15 mins
  UPDATE public.transactions SET status = 'rejected'
  WHERE status = 'pending' AND type = 'DEPOSIT'
    AND timestamp < NOW() - INTERVAL '15 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. ADMIN VIEW: Consolidated financial overview for admin dashboard
CREATE OR REPLACE VIEW public.admin_user_financials AS
SELECT 
  u.id, u.username, u.email, u.real_balance, u.verification_status,
  COUNT(t.id) as total_tx,
  SUM(CASE WHEN t.type = 'DEPOSIT' AND t.status = 'completed' THEN t.amount ELSE 0 END) as total_deposited
FROM public.users u
LEFT JOIN public.transactions t ON u.id = t.user_id
GROUP BY u.id, u.username, u.email, u.real_balance, u.verification_status;

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

-- 7. POLICIES
DROP POLICY IF EXISTS "Users view self" ON public.users;
CREATE POLICY "Users view self" ON public.users FOR SELECT USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "Users update self" ON public.users;
CREATE POLICY "Users update self" ON public.users FOR UPDATE USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "Users view tx" ON public.transactions;
CREATE POLICY "Users view tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users insert tx" ON public.transactions;
CREATE POLICY "Users insert tx" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin update tx" ON public.transactions;
CREATE POLICY "Admin update tx" ON public.transactions FOR UPDATE USING (is_admin());

DROP POLICY IF EXISTS "Users view trades" ON public.trades;
CREATE POLICY "Users view trades" ON public.trades FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users insert trades" ON public.trades;
CREATE POLICY "Users insert trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update trades" ON public.trades;
CREATE POLICY "Users update trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view bots" ON public.bot_settings;
CREATE POLICY "Users view bots" ON public.bot_settings FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "Users update bots" ON public.bot_settings;
CREATE POLICY "Users update bots" ON public.bot_settings FOR UPDATE USING (auth.uid() = user_id OR is_admin());
