-- Supabase RLS Policies for PreoCryptoFX
-- Run this in your Supabase SQL Editor to fix the "RLS Enabled No Policy" warnings

-- 1. Ensure the 'users' table exists with all required columns
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
  referral_bonus_claimed boolean DEFAULT false,
  last_profit_reset_date text,
  daily_profit_real numeric DEFAULT 0,
  daily_profit_demo numeric DEFAULT 0,
  daily_trades_real integer DEFAULT 0,
  daily_trades_demo integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Handle the 'profiles' table often suggested by Supabase templates
-- Even if not used, defining policies clears the warning
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Define Policies (Using DO blocks to prevent errors if they already exist)

-- Users Table Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can view their own data') THEN
    CREATE POLICY "Users can view their own data" ON public.users FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can update their own data') THEN
    CREATE POLICY "Users can update their own data" ON public.users FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- Bot Settings Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bot_settings' AND policyname = 'Users can manage their own bot settings') THEN
    CREATE POLICY "Users can manage their own bot settings" ON public.bot_settings FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Transactions Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users can view their own transactions') THEN
    CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users can insert their own transactions') THEN
    CREATE POLICY "Users can insert their own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Trades Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trades' AND policyname = 'Users can manage their own trades') THEN
    CREATE POLICY "Users can manage their own trades" ON public.trades FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Profiles Policies (Clear the warning)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view their own profile') THEN
    CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- 4. Auth Trigger (CRITICAL)
-- This ensures that when a user signs up via Supabase Auth, a row is automatically created in public.users
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
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
