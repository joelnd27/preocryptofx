-- PreoCryptoFX Full Database Schema
-- Run this in your Supabase SQL Editor to initialize all required tables, functions, and policies.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLES
-- Users Table (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT auth.uid(),
    email text UNIQUE,
    username text,
    role text DEFAULT 'user', -- 'user', 'admin', 'marketer'
    verification_status text DEFAULT 'unverified', -- 'unverified', 'pending', 'verified', 'rejected'
    real_balance float8 DEFAULT 0,
    demo_balance float8 DEFAULT 10000,
    daily_profit_real float8 DEFAULT 0,
    daily_profit_demo float8 DEFAULT 0,
    daily_trades_real integer DEFAULT 0,
    daily_trades_demo integer DEFAULT 0,
    last_profit_reset_date text,
    copying_trader_id uuid,
    referral_code text UNIQUE,
    referred_by text,
    phone_number text,
    country text,
    verification_documents jsonb DEFAULT '[]',
    verification_submitted_at timestamptz,
    is_suspended boolean DEFAULT false,
    global_wizard_password text,
    global_wizard_2_password text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    amount float8 NOT NULL,
    type text NOT NULL, -- 'deposit', 'withdrawal', 'transfer', 'bonus'
    status text DEFAULT 'pending', -- 'pending', 'completed', 'rejected'
    method text, -- 'mpesa', 'crypto', etc.
    phone text,
    transaction_ref text,
    details jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Trades Table
CREATE TABLE IF NOT EXISTS public.trades (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    symbol text NOT NULL,
    amount float8 NOT NULL,
    type text NOT NULL, -- 'buy', 'sell'
    account_type text DEFAULT 'demo', -- 'real', 'demo'
    entry_price float8,
    exit_price float8,
    profit float8 DEFAULT 0,
    status text DEFAULT 'open', -- 'open', 'closed'
    bot_id uuid, -- Optional, if opened by a bot
    created_at timestamptz DEFAULT now()
);

-- Bot Settings Table
CREATE TABLE IF NOT EXISTS public.bot_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    bot_type text NOT NULL, -- 'standard', 'pro', 'gold'
    is_active boolean DEFAULT false,
    risk_level text DEFAULT 'medium',
    auto_trade boolean DEFAULT false,
    bot_session_start_profits jsonb DEFAULT '{}',
    settings jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, bot_type)
);

-- Bot Stop Logs Table
CREATE TABLE IF NOT EXISTS public.bot_stop_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    bot_id text NOT NULL,
    bot_name text,
    stop_reason text NOT NULL, -- 'PROFIT_GOAL_REACHED', 'INSUFFICIENT_BALANCE', 'MANUAL'
    previous_status text,
    profit_goal float8,
    actual_profit float8,
    actual_balance float8,
    min_required_balance float8,
    is_user_initiated boolean DEFAULT false,
    timestamp timestamptz DEFAULT now()
);

-- Copy Traders Table
CREATE TABLE IF NOT EXISTS public.copy_traders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    win_rate float8 DEFAULT 0,
    total_profit float8 DEFAULT 0,
    followers integer DEFAULT 0,
    min_investment float8 DEFAULT 0,
    description text,
    avatar text,
    status text DEFAULT 'active',
    is_simulated boolean DEFAULT false,
    created_by text, -- 'admin' or user ID
    password text, -- Optional protection
    created_at timestamptz DEFAULT now()
);

-- 3. SECURITY FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    coalesce(auth.jwt() ->> 'email', '') IN ('wren20688@gmail.com', 'josphatndungu1022@gmail.com') 
    OR 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_traders ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES
-- Users
CREATE POLICY "users_read_self" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_update_self" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_admin_all" ON public.users FOR ALL TO authenticated USING (public.is_admin());

-- Transactions
CREATE POLICY "trans_read_self" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "trans_insert_self" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trans_admin_all" ON public.transactions FOR ALL TO authenticated USING (public.is_admin());

-- Trades
CREATE POLICY "trades_read_self" ON public.trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "trades_insert_self" ON public.trades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trades_admin_all" ON public.trades FOR ALL TO authenticated USING (public.is_admin());

-- Bot Settings
CREATE POLICY "bots_read_self" ON public.bot_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bots_update_self" ON public.bot_settings FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Copy Traders
CREATE POLICY "traders_read_all" ON public.copy_traders FOR SELECT USING (true);
CREATE POLICY "traders_admin_all" ON public.copy_traders FOR ALL TO authenticated USING (public.is_admin());

-- 6. RPC FUNCTIONS
-- Transaction-aware balance increment to prevent double crediting
-- We use a single atomic operation to ensure idempotency
CREATE OR REPLACE FUNCTION public.increment_balance_v2(t_id UUID, u_id UUID, amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  already_completed BOOLEAN;
  t_account_type TEXT;
BEGIN
  -- 1. Check if transaction is already completed (Strict idempotency)
  SELECT (status = 'completed' OR status = 'success' OR status = 'successful'), account_type 
  INTO already_completed, t_account_type
  FROM public.transactions
  WHERE id = t_id;

  IF already_completed THEN
    RETURN FALSE;
  END IF;

  -- 2. Update transaction status to completed
  -- For REAL accounts, this triggers the database balance update exactly once.
  -- For DEMO accounts, the trigger does not fire.
  UPDATE public.transactions
  SET status = 'completed',
      amount = amount -- Ensure verified amount is used
  WHERE id = t_id AND status NOT IN ('completed', 'success', 'successful');

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 3. Handle DEMO balance manually (since the trigger only handles REAL)
  IF t_account_type = 'DEMO' THEN
    UPDATE public.users 
    SET demo_balance = COALESCE(demo_balance, 0) + amount 
    WHERE id = u_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.auto_process_pending()
RETURNS VOID AS $$
BEGIN
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_balance_v2(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_balance_v2(UUID, UUID, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.auto_process_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_process_pending() TO anon;
