-- COMPLETE SUPABASE REPAIR SCRIPT
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. CLEANUP (Remove any potentially broken or recursive policies)
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('users', 'trades', 'bot_settings', 'transactions', 'payments', 'profiles'))
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
  END LOOP;
END $$;

-- 2. ENSURE TABLES & COLUMNS EXIST
-- This ensures all columns needed by the app are present
CREATE TABLE IF NOT EXISTS public.users (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text,
  username text,
  role text DEFAULT 'user',
  verification_status text DEFAULT 'unverified',
  real_balance numeric DEFAULT 0,
  demo_balance numeric DEFAULT 10000,
  active_account text DEFAULT 'DEMO',
  referral_code text,
  referred_by text,
  total_profit_real numeric DEFAULT 0,
  total_profit_demo numeric DEFAULT 0,
  daily_profit_real numeric DEFAULT 0,
  daily_profit_demo numeric DEFAULT 0,
  daily_trades_real integer DEFAULT 0,
  daily_trades_demo integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure bot_settings exists
CREATE TABLE IF NOT EXISTS public.bot_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  scalping_active boolean DEFAULT false,
  trend_active boolean DEFAULT false,
  ai_active boolean DEFAULT false,
  custom_active boolean DEFAULT false,
  bot_logs jsonb DEFAULT '[]',
  bot_stats jsonb DEFAULT '{}',
  updated_at timestamp with time zone DEFAULT now()
);

-- Ensure trades exists
CREATE TABLE IF NOT EXISTS public.trades (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  coin text,
  amount numeric,
  type text,
  price numeric,
  status text DEFAULT 'OPEN',
  profit numeric DEFAULT 0,
  target_profit numeric DEFAULT 0,
  account_type text,
  timestamp timestamp with time zone DEFAULT now(),
  duration integer,
  source text DEFAULT 'MANUAL',
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure transactions exists
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  type text,
  amount numeric,
  status text DEFAULT 'pending',
  method text,
  external_id text,
  account_type text DEFAULT 'REAL',
  timestamp timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- 3. ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 4. NON-RECURSIVE SECURITY HELPERS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  -- We check the raw JWT or the users table without recursion
  -- SECURITY DEFINER makes this run as the owner (admin)
  RETURN (
    auth.jwt() ->> 'email' IN ('wren20688@gmail.com', 'josphatndungu1022@gmail.com', 'josphatndungu122@gmail.com') OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RE-CREATE POLICIES (Simple & Strong)

-- USERS
CREATE POLICY "user_self_access" ON public.users FOR ALL TO authenticated USING (auth.uid() = id);
CREATE POLICY "admin_all_users" ON public.users FOR ALL TO authenticated USING (public.is_admin());

-- BOT SETTINGS
CREATE POLICY "user_bot_access" ON public.bot_settings FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin_all_bot" ON public.bot_settings FOR ALL TO authenticated USING (public.is_admin());

-- TRADES
CREATE POLICY "user_trades_access" ON public.trades FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin_all_trades" ON public.trades FOR ALL TO authenticated USING (public.is_admin());

-- TRANSACTIONS
CREATE POLICY "user_trans_access" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin_all_trans" ON public.transactions FOR ALL TO authenticated USING (public.is_admin());

-- 6. RPCs FOR ATOMIC UPDATES
CREATE OR REPLACE FUNCTION public.increment_balance(user_id uuid, amount numeric)
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET real_balance = real_balance + amount
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. AUTH TRIGGER (Fixes User Creation)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, username, referral_code)
  VALUES (
    new.id, 
    new.email, 
    split_part(new.email, '@', 1),
    'MKT-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );
  
  -- Create default bot settings too
  INSERT INTO public.bot_settings (user_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- FINAL STEP: Reset any broken sequences or constraints if needed (optional)
-- This script covers the core fixes for trading and admin access.
