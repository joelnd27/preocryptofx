-- ==========================================
-- PREOCRYPTOFX FULL DATABASE SETUP
-- ==========================================

-- 1. TABLES SETUP
-- ------------------------------------------

-- Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'user',
    demo_balance NUMERIC DEFAULT 10000,
    real_balance NUMERIC DEFAULT 0,
    active_account TEXT DEFAULT 'DEMO',
    verification_status TEXT DEFAULT 'not_verified',
    verification_submitted_at BIGINT,
    verification_documents JSONB,
    total_profit_real NUMERIC DEFAULT 0,
    total_profit_demo NUMERIC DEFAULT 0,
    daily_profit_real NUMERIC DEFAULT 0,
    daily_profit_demo NUMERIC DEFAULT 0,
    last_profit_reset_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist (for existing tables)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS demo_balance NUMERIC DEFAULT 10000;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS real_balance NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active_account TEXT DEFAULT 'DEMO';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'not_verified';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_submitted_at BIGINT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verification_documents JSONB;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_profit_real NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_profit_demo NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_profit_real NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_profit_demo NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_trades_real NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_trades_demo NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_profit_reset_date TEXT;

-- Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- DEPOSIT, WITHDRAW
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'rejected', 'cancelled')),
    account_type TEXT DEFAULT 'REAL', -- REAL, DEMO
    method TEXT,
    external_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist (for existing tables)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'REAL';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON public.transactions(external_id);

-- Trades Table
CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    coin TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL, -- BUY, SELL
    price NUMERIC NOT NULL,
    status TEXT DEFAULT 'OPEN', -- OPEN, CLOSED
    profit NUMERIC DEFAULT 0,
    target_profit NUMERIC DEFAULT 0,
    account_type TEXT DEFAULT 'DEMO', -- REAL, DEMO
    duration INTEGER,
    source TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot Settings Table
CREATE TABLE IF NOT EXISTS public.bot_settings (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    scalping_active BOOLEAN DEFAULT FALSE,
    trend_active BOOLEAN DEFAULT FALSE,
    ai_active BOOLEAN DEFAULT FALSE,
    custom_active BOOLEAN DEFAULT FALSE,
    custom_config JSONB,
    bot_stats JSONB,
    bot_logs JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS & POLICIES
-- ------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin or marketer
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (role = 'admin' OR role = 'marketer')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- USERS POLICIES
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id OR is_staff());

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id OR is_staff());

-- TRANSACTIONS POLICIES
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id OR is_staff());

DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff can update transactions" ON public.transactions;
CREATE POLICY "Staff can update transactions" ON public.transactions FOR UPDATE USING (is_staff());

-- TRADES POLICIES
DROP POLICY IF EXISTS "Users can view own trades" ON public.trades;
CREATE POLICY "Users can view own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id OR is_staff());

DROP POLICY IF EXISTS "Users can insert own trades" ON public.trades;
CREATE POLICY "Users can insert own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff can update trades" ON public.trades;
CREATE POLICY "Staff can update trades" ON public.trades FOR UPDATE USING (is_staff());

-- BOT SETTINGS POLICIES
DROP POLICY IF EXISTS "Users can manage own bot settings" ON public.bot_settings;
CREATE POLICY "Users can manage own bot settings" ON public.bot_settings FOR ALL USING (auth.uid() = user_id);

-- 3. AUTOMATION FUNCTIONS
-- ------------------------------------------

-- Auto-Verification Engine
CREATE OR REPLACE FUNCTION public.auto_process_verification()
RETURNS void AS $$
BEGIN
  -- Auto-verify after 7.5 minutes (450,000 ms)
  UPDATE public.users
  SET verification_status = 'verified'
  WHERE verification_status = 'pending'
  AND verification_submitted_at IS NOT NULL
  AND (EXTRACT(EPOCH FROM NOW()) * 1000 - verification_submitted_at) > 450000;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Universal Auto-Process (Syncs pending withdrawals for marketers, etc.)
CREATE OR REPLACE FUNCTION public.auto_process_pending()
RETURNS void AS $$
BEGIN
  -- Auto-complete marketer withdrawals that are still pending
  UPDATE public.transactions t
  SET status = 'completed'
  FROM public.users u
  WHERE t.user_id = u.id
  AND u.role = 'marketer'
  AND t.type = 'WITHDRAW'
  AND t.status = 'pending';
  
  -- Run verification check too
  PERFORM public.auto_process_verification();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marketer Auto-Verification Trigger
CREATE OR REPLACE FUNCTION public.auto_verify_marketers()
RETURNS trigger AS $$
BEGIN
  IF (NEW.role = 'marketer' AND (OLD.role IS NULL OR OLD.role != 'marketer')) OR (NEW.role = 'marketer' AND NEW.verification_status != 'verified') THEN
    NEW.verification_status := 'verified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_role_change ON public.users;
CREATE TRIGGER on_user_role_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_verify_marketers();

-- 4. VIEWS
-- ------------------------------------------

CREATE OR REPLACE VIEW public.admin_user_financials AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.role,
    u.verification_status,
    COALESCE(SUM(CASE WHEN t.type = 'DEPOSIT' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_deposited_usd,
    COALESCE(SUM(CASE WHEN t.type = 'WITHDRAW' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_withdrawn_usd,
    u.real_balance,
    u.demo_balance,
    u.created_at
FROM 
    public.users u
LEFT JOIN 
    public.transactions t ON u.id = t.user_id
GROUP BY 
    u.id, u.username, u.email, u.role, u.verification_status, u.real_balance, u.demo_balance, u.created_at;
