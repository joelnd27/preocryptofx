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
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

    -- BOT_SETTINGS Table: Transition to single-record-per-user multi-bot schema
    -- Ensure the table exists first
    CREATE TABLE IF NOT EXISTS public.bot_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
        bot_type text DEFAULT 'multi',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(user_id)
    );

    ALTER TABLE public.bot_settings ADD COLUMN IF NOT EXISTS bot_type text DEFAULT 'multi';

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

    -- Ensure coin and price exist as these are preferred by the simulation
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS coin text;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS price float8;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS target_profit float8 DEFAULT 0;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS duration integer DEFAULT 60;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS exit_price float8;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS timestamp text;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS source text DEFAULT 'MANUAL';
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'DEMO';
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS exit_time timestamptz;
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

    -- Ensure transactions table has correct columns
    CREATE TABLE IF NOT EXISTS public.transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
        type text NOT NULL,
        amount float8 NOT NULL,
        status text DEFAULT 'pending',
        account_type text,
        method text,
        timestamp timestamptz DEFAULT now(),
        external_id text,
        metadata jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
    );

    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_type text;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS method text;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS timestamp timestamptz DEFAULT now();
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_id text;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_trades_status_timestamp ON public.trades(status, timestamp);
    CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
    CREATE INDEX IF NOT EXISTS idx_bot_settings_active_lookup ON public.bot_settings(scalping_active, trend_active, ai_active, custom_active);
    CREATE INDEX IF NOT EXISTS idx_bot_settings_updated_at ON public.bot_settings(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id_status ON public.transactions(user_id, status);

    -- Cleanup duplicate bot settings to ensure unique constraint can be applied
    DELETE FROM public.bot_settings a
    USING public.bot_settings b
    WHERE a.user_id = b.user_id 
      AND a.updated_at < b.updated_at;

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

-- 5. CLEANUP OLD TRIGGERS (Prevent double crediting, double withdrawal deductions, AND trade-close balance constraint crashes)
-- Dynamically drop ALL non-internal triggers on public.transactions and public.trades so no hidden/legacy trigger
-- can modify users.real_balance or users.demo_balance behind the scenes.
DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.transactions'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.transactions;', trig.tgname);
  END LOOP;

  FOR trig IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.trades'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.trades;', trig.tgname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.handle_transaction_completion();
DROP FUNCTION IF EXISTS public.handle_trade_completion();
DROP FUNCTION IF EXISTS public.update_balance_on_trade();

-- Clamp any existing negative balances to 0 and enforce DB-level non-negative constraints
UPDATE public.users
SET real_balance = GREATEST(0, COALESCE(real_balance, 0)),
    demo_balance = GREATEST(0, COALESCE(demo_balance, 0))
WHERE real_balance IS NULL
   OR real_balance < 0
   OR demo_balance IS NULL
   OR demo_balance < 0;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_real_balance_non_negative;
ALTER TABLE public.users ADD CONSTRAINT users_real_balance_non_negative CHECK (real_balance >= 0);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_demo_balance_non_negative;
ALTER TABLE public.users ADD CONSTRAINT users_demo_balance_non_negative CHECK (demo_balance >= 0);

-- Helper to list triggers for debugging
CREATE OR REPLACE FUNCTION public.get_all_triggers()
RETURNS TABLE (trigger_name TEXT, event_table TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT tgname::TEXT, relname::TEXT
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND NOT t.tgisinternal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC FUNCTIONS
-- Transaction-aware balance increment to prevent double crediting
-- Handles both REAL and DEMO balances atomically without relying on external triggers
CREATE OR REPLACE FUNCTION public.increment_balance_v2(t_id UUID, u_id UUID, amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  t_row RECORD;
  safe_amount NUMERIC;
BEGIN
  safe_amount := GREATEST(0, COALESCE(amount, 0));

  -- 1. Lock the transaction row for strict idempotency
  SELECT id, status, account_type
  INTO t_row
  FROM public.transactions
  WHERE id = t_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF LOWER(COALESCE(t_row.status, '')) IN ('completed', 'success', 'successful') THEN
    RETURN FALSE;
  END IF;

  -- 2. Mark transaction as successful atomically
  UPDATE public.transactions
  SET status = 'successful',
      amount = safe_amount,
      updated_at = now()
  WHERE id = t_id
    AND LOWER(COALESCE(status, '')) NOT IN ('completed', 'success', 'successful');

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 3. Explicitly credit the target balance once (external triggers are dropped)
  IF UPPER(COALESCE(t_row.account_type, 'REAL')) = 'DEMO' THEN
    UPDATE public.users
    SET demo_balance = GREATEST(0, ROUND((COALESCE(demo_balance, 0) + safe_amount)::numeric, 2)),
        updated_at = now()
    WHERE id = u_id;
  ELSE
    UPDATE public.users
    SET real_balance = GREATEST(0, ROUND((COALESCE(real_balance, 0) + safe_amount)::numeric, 2)),
        updated_at = now()
    WHERE id = u_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.5 PROCESS WITHDRAWAL RPC (Atomic & Protected Against Negative Balances)
CREATE OR REPLACE FUNCTION public.process_withdrawal(
  u_id UUID,
  u_amount NUMERIC,
  u_account_type TEXT,
  u_method TEXT,
  u_timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB AS $$
DECLARE
  current_bal NUMERIC;
  new_bal NUMERIC;
  safe_amount NUMERIC;
  balance_col TEXT;
  tx_id UUID;
  user_v_status TEXT;
  recent_count INTEGER;
BEGIN
  -- Validate withdrawal amount is strictly positive
  IF u_amount IS NULL OR u_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid withdrawal amount');
  END IF;

  safe_amount := ROUND(u_amount::numeric, 2);

  -- 0. Anti-double-spend / Idempotency check: Reject if a withdrawal of the same amount exists within the last 5 seconds
  SELECT COUNT(*) INTO recent_count
  FROM public.transactions
  WHERE user_id = u_id
    AND type = 'WITHDRAW'
    AND amount = safe_amount
    AND status IN ('pending', 'successful', 'completed')
    AND created_at >= (now() - interval '5 seconds');

  IF recent_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate withdrawal request detected. Please wait a moment.');
  END IF;

  -- 1. Identify balance column (only REAL accounts can withdraw)
  IF UPPER(COALESCE(u_account_type, 'REAL')) = 'REAL' THEN
    balance_col := 'real_balance';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawals are only available for REAL accounts.');
  END IF;

  -- 2. Fetch current balance and verification status with Row Lock (FOR UPDATE)
  EXECUTE format('SELECT COALESCE(%I, 0), verification_status FROM public.users WHERE id = $1 FOR UPDATE', balance_col)
  INTO current_bal, user_v_status
  USING u_id;

  IF current_bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- 3. Check verification limits
  IF COALESCE(user_v_status, 'not_verified') != 'verified' AND safe_amount > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unverified accounts have a withdrawal limit of $500.');
  END IF;

  -- 4. Strict sufficient funds check (never allow balance < 0)
  IF current_bal < safe_amount OR (current_bal - safe_amount) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- 5. Calculate new balance
  new_bal := ROUND((current_bal - safe_amount)::numeric, 2);

  IF new_bal < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- 6. Update user balance atomically with non-negative guard
  EXECUTE format('UPDATE public.users SET %I = $1, updated_at = now() WHERE id = $2 AND COALESCE(%I, 0) >= $3', balance_col, balance_col)
  USING new_bal, u_id, safe_amount;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- 7. Insert transaction record (no external trigger on transactions will deduct again)
  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    status,
    account_type,
    method,
    timestamp
  ) VALUES (
    u_id,
    'WITHDRAW',
    safe_amount,
    'pending',
    'REAL',
    u_method,
    u_timestamp
  ) RETURNING id INTO tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'newBalance', new_bal,
    'transactionId', tx_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_withdrawal(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_withdrawal(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.process_withdrawal(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- Simple increment for manual or legacy calls (protected against going negative)
CREATE OR REPLACE FUNCTION public.increment_balance(user_id UUID, amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE public.users 
  SET real_balance = GREATEST(0, ROUND((COALESCE(real_balance, 0) + COALESCE(amount, 0))::numeric, 2)),
      updated_at = now()
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

-- RPC for optimized admin stats
CREATE OR REPLACE FUNCTION public.get_total_deposited()
RETURNS float8 AS $$
BEGIN
  RETURN COALESCE((
    SELECT SUM(amount)
    FROM public.transactions
    WHERE status IN ('completed', 'success', 'successful')
      AND type = 'DEPOSIT'
  ), 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_total_deposited() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_deposited() TO service_role;

-- 7. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

