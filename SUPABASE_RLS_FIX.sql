-- 1. CLEANUP (Remove all existing policies to start fresh)
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
CREATE POLICY "traders_read_anyone" ON public.copy_traders FOR SELECT USING (true);
CREATE POLICY "traders_admin_all" ON public.copy_traders FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "traders_marketer_all" ON public.copy_traders FOR ALL TO authenticated USING (public.is_marketer());

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

-- 5. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

