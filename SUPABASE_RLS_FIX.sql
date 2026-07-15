-- 1. SCHEMA REPAIR (Ensures the table has all required columns)
-- This fixes the "Could not find column" errors and ensures data consistency
DO $$ 
BEGIN
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
        created_by text, -- Changed to text to support 'admin' string
        created_at timestamptz DEFAULT now()
    );

    -- Ensure created_by is text (if table existed with uuid before)
    ALTER TABLE public.copy_traders ALTER COLUMN created_by TYPE text USING created_by::text;

    -- Add missing columns individually if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='copy_traders' AND column_name='avatar') THEN
        ALTER TABLE public.copy_traders ADD COLUMN avatar text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='copy_traders' AND column_name='password') THEN
        ALTER TABLE public.copy_traders ADD COLUMN password text;
    END IF;

    -- Ensure correct types for numeric columns
    ALTER TABLE public.copy_traders ALTER COLUMN total_profit TYPE float8 USING total_profit::float8;
    ALTER TABLE public.copy_traders ALTER COLUMN win_rate TYPE float8 USING win_rate::float8;
    ALTER TABLE public.copy_traders ALTER COLUMN min_investment TYPE float8 USING min_investment::float8;

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
DROP TRIGGER IF EXISTS on_transaction_completed ON public.transactions;
DROP TRIGGER IF EXISTS tr_on_transaction_completed ON public.transactions;
DROP FUNCTION IF EXISTS public.handle_transaction_completion();

-- 6. RPC FUNCTIONS
-- Transaction-aware balance increment to prevent double crediting
CREATE OR REPLACE FUNCTION public.increment_balance_v2(t_id UUID, u_id UUID, amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  already_completed BOOLEAN;
BEGIN
  -- 1. Check if transaction is already completed
  SELECT (status = 'completed') INTO already_completed
  FROM public.transactions
  WHERE id = t_id;

  IF already_completed THEN
    RETURN FALSE;
  END IF;

  -- 2. Update transaction status to completed
  UPDATE public.transactions
  SET status = 'completed',
      updated_at = NOW()
  WHERE id = t_id AND status != 'completed';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 3. Increment user balance
  UPDATE public.users 
  SET real_balance = COALESCE(real_balance, 0) + amount 
  WHERE id = u_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep old version for backward compatibility but redirect logic if possible
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

