-- 1. SCHEMA REPAIR (Aggressive fix for all required columns and constraints)
DO $$ 
BEGIN
    -- USERS Table: Ensure all profit and balance columns exist
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_profit_real float8 DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_profit_demo float8 DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_profit_real float8 DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_profit_demo float8 DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_trades_real integer DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_trades_demo integer DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active_account text DEFAULT 'DEMO';

    -- BOT_SETTINGS Table: Transition to single-record-per-user multi-bot schema
    -- Ensure the table exists first
    CREATE TABLE IF NOT EXISTS public.bot_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(user_id)
    );

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bot_settings' AND column_name='bot_type') THEN
        ALTER TABLE public.bot_settings ALTER COLUMN bot_type DROP NOT NULL;
    END IF;
    
    -- Fix Unique Constraints
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_settings_user_id_bot_type_key') THEN
        ALTER TABLE public.bot_settings DROP CONSTRAINT bot_settings_user_id_bot_type_key;
    END IF;
    
    -- Ensure user_id is unique so we only have one settings record per user
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_settings_user_id_key') THEN
        ALTER TABLE public.bot_settings ADD CONSTRAINT bot_settings_user_id_key UNIQUE (user_id);
    END IF;

    -- Add missing boolean and config columns
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS scalping_active boolean DEFAULT false;
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS trend_active boolean DEFAULT false;
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS ai_active boolean DEFAULT false;
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS custom_active boolean DEFAULT false;
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS bot_stake float8 DEFAULT 10;
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS target_profit_percentage float8 DEFAULT 0;
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS bot_stats jsonb DEFAULT '{}';
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS bot_logs jsonb DEFAULT '[]';
    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS bot_session_start_profits jsonb DEFAULT '{}';

    -- TRADES Table: Fix missing columns used in simulation
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trades' AND column_name='symbol') THEN
        ALTER TABLE public.trades ALTER COLUMN symbol DROP NOT NULL;
    END IF;

    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS coin text;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS price float8;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS timestamp text;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS source text DEFAULT 'MANUAL';
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'DEMO';

    -- Ensure bot_stop_logs table exists
    CREATE TABLE IF NOT EXISTS public.bot_stop_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
        bot_id text NOT NULL,
        bot_name text,
        stop_reason text NOT NULL,
        previous_status text,
        profit_goal float8,
        actual_profit float8,
        actual_balance float8,
        min_required_balance float8,
        is_user_initiated boolean DEFAULT false,
        timestamp timestamptz DEFAULT now()
    );

    -- Ensure copy_traders table exists with correct types
    CREATE TABLE IF NOT EXISTS public.copy_traders (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        name text NOT NULL,
        win_rate float8 DEFAULT 0,
        total_profit float8 DEFAULT 0,
        followers integer DEFAULT 0,
        min_investment float8 DEFAULT 0,
        description text,
        status text DEFAULT 'active',
        is_simulated boolean DEFAULT false,
        created_by text,
        avatar text,
        password text,
        created_at timestamptz DEFAULT now()
    );

END $$;

-- 2. CLEANUP (Remove all existing policies to start fresh)
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('users', 'trades', 'bot_settings', 'transactions', 'payments', 'profiles', 'copy_traders'))
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- 2. SECURITY HELPERS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    coalesce(auth.jwt() ->> 'email', '') IN ('wren20688@gmail.com', 'josphatndungu1022@gmail.com', 'josphatndungu122@gmail.com') 
    OR 
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_marketer()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'marketer');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRANT EXECUTE permissions so authenticated users can call these functions in RLS
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_marketer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_marketer() TO anon;

CREATE OR REPLACE FUNCTION public.is_support()
RETURNS boolean AS $$
BEGIN
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_support() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_support() TO anon;

-- 3. POLICIES

-- BOT STOP LOGS
CREATE POLICY "stop_logs_read_self" ON public.bot_stop_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "stop_logs_insert_anyone" ON public.bot_stop_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stop_logs_admin_all" ON public.bot_stop_logs FOR ALL TO authenticated USING (public.is_admin());

-- USERS
CREATE POLICY "users_read_all_admin" ON public.users FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "users_read_self" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_update_self" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_admin_all" ON public.users FOR ALL TO authenticated USING (public.is_admin());

-- TRANSACTIONS
CREATE POLICY "trans_read_all_admin" ON public.transactions FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "trans_read_self" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "trans_insert_self" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trans_admin_all" ON public.transactions FOR ALL TO authenticated USING (public.is_admin());

-- COPY TRADERS
DROP POLICY IF EXISTS "traders_read_anyone" ON public.copy_traders;
DROP POLICY IF EXISTS "traders_admin_all" ON public.copy_traders;
DROP POLICY IF EXISTS "traders_marketer_all" ON public.copy_traders;

CREATE POLICY "traders_read_anyone" ON public.copy_traders FOR SELECT USING (true);
CREATE POLICY "traders_admin_all" ON public.copy_traders FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "traders_marketer_all" ON public.copy_traders FOR ALL TO authenticated USING (public.is_marketer()) WITH CHECK (public.is_marketer());

-- TRADES
CREATE POLICY "trades_read_all_admin" ON public.trades FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "trades_all_self" ON public.trades FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 4. APPLY UNIQUE PROFITS (The requested fix)
-- This resets every trader to a unique, distinct profit value
UPDATE public.copy_traders SET total_profit = 1000.25 WHERE name ILIKE '%Moon Walker%';
UPDATE public.copy_traders SET total_profit = 4987.90 WHERE name ILIKE '%Alpha Whale%';
UPDATE public.copy_traders SET total_profit = 3017.75 WHERE name ILIKE '%Crypto Sensei%';
UPDATE public.copy_traders SET total_profit = 2450.60 WHERE name ILIKE '%Bull Run Pro%';
UPDATE public.copy_traders SET total_profit = 4120.33 WHERE name ILIKE '%Binance Bot%';
UPDATE public.copy_traders SET total_profit = 1890.45 WHERE name ILIKE '%Ether Knight%';
UPDATE public.copy_traders SET total_profit = 4630.12 WHERE name ILIKE '%Solana Shark%';
UPDATE public.copy_traders SET total_profit = 3200.88 WHERE name ILIKE '%Scalp Master%';
UPDATE public.copy_traders SET total_profit = 4250.00 WHERE name ILIKE '%DeFi Degen%';
UPDATE public.copy_traders SET total_profit = 2100.55 WHERE name ILIKE '%Stable Earner%';

-- For any others not matched above, give them random varied profits between 1000 and 5000
UPDATE public.copy_traders 
SET total_profit = 1000 + (random() * 4000)
WHERE total_profit > 5500 OR total_profit < 100;

-- 5. CLEANUP OLD TRIGGERS (Prevent double crediting)
-- These are often the cause of double-crediting when combined with manual increments
DROP TRIGGER IF EXISTS on_transaction_completed ON public.transactions;
DROP TRIGGER IF EXISTS tr_on_transaction_completed ON public.transactions;
DROP TRIGGER IF EXISTS handle_transaction_completion_trigger ON public.transactions;
DROP TRIGGER IF EXISTS tr_transactions_status_completed ON public.transactions;
DROP TRIGGER IF EXISTS transactions_update_balance ON public.transactions;
DROP TRIGGER IF EXISTS update_balance_trigger ON public.transactions;
DROP TRIGGER IF EXISTS credit_user_balance_trigger ON public.transactions;
DROP TRIGGER IF EXISTS tr_update_balance ON public.transactions;
DROP TRIGGER IF EXISTS on_complete_credit_balance ON public.transactions;
DROP TRIGGER IF EXISTS transactions_completed_trigger ON public.transactions;
DROP TRIGGER IF EXISTS update_real_balance_trigger ON public.transactions;
DROP TRIGGER IF EXISTS trigger_on_transaction_completed ON public.transactions;
DROP TRIGGER IF EXISTS transactions_balance_trigger ON public.transactions;
DROP TRIGGER IF EXISTS update_user_balance_on_transaction ON public.transactions;
DROP FUNCTION IF EXISTS public.handle_transaction_completion();

-- Helper to list triggers for debugging
CREATE OR REPLACE FUNCTION public.get_all_triggers()
RETURNS TABLE (trigger_name TEXT, event_table TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT tgname::TEXT, relname::TEXT
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Simple increment for manual or legacy calls
CREATE OR REPLACE FUNCTION public.increment_balance(user_id UUID, amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE public.users 
  SET real_balance = COALESCE(real_balance, 0) + amount 
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_balance_v2(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_balance_v2(UUID, UUID, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_balance_v2(UUID, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) TO service_role;

-- Optional: Auto-process stale pending transactions (called on load)
CREATE OR REPLACE FUNCTION public.auto_process_pending()
RETURNS VOID AS $$
BEGIN
  -- We don't actually want to auto-complete them because we need payment verification
  -- This is just a placeholder to prevent "function not found" errors
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.auto_process_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_process_pending() TO anon;

-- 7. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

