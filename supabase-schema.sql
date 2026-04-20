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

-- 6. Trigger to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := 'user';

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

-- RLs IS DISABLED FOR SIMPLICITY AS PER MORNING STATE
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings DISABLE ROW LEVEL SECURITY;
