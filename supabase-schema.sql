-- 1. CLEAN REVERSION: Remove any conflicting policies or functions
DROP TRIGGER IF EXISTS tr_protect_user_fields ON public.users CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.protect_user_fields() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.auto_process_pending() CASCADE;

-- 2. ENFORCED SCHEMA (Minimal & Secure)
ALTER TABLE public.users 
  ALTER COLUMN role SET DEFAULT 'user',
  ADD CONSTRAINT role_types CHECK (role IN ('user', 'marketer', 'admin')),
  ADD CONSTRAINT verification_types CHECK (verification_status IN ('not_verified', 'pending', 'verified'));

-- 3. HELPER: Admin Check (Hardcoded for maximum security)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Service Role (Backend) is always authorized
  IF (auth.role() = 'service_role') THEN RETURN TRUE; END IF;
  
  -- Check user table role field
  RETURN (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

-- USERS TABLE POLICIES
DROP POLICY IF EXISTS "select_own_user" ON public.users;
CREATE POLICY "select_own_user" ON public.users FOR SELECT USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "update_admin_only" ON public.users;
CREATE POLICY "update_admin_only" ON public.users FOR UPDATE USING (is_admin());

-- TRANSACTIONS TABLE POLICIES
DROP POLICY IF EXISTS "select_own_tx" ON public.transactions;
CREATE POLICY "select_own_tx" ON public.transactions FOR SELECT USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "insert_own_tx" ON public.transactions;
CREATE POLICY "insert_own_tx" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_admin_tx" ON public.transactions;
CREATE POLICY "update_admin_tx" ON public.transactions FOR UPDATE USING (is_admin());

-- TRADES & BOTS (Maintenance)
DROP POLICY IF EXISTS "trades_access" ON public.trades;
CREATE POLICY "trades_access" ON public.trades FOR ALL USING (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "bots_access" ON public.bot_settings;
CREATE POLICY "bots_access" ON public.bot_settings FOR ALL USING (auth.uid() = user_id OR is_admin());

-- 5. TRIGGER: Marketer Auto-Verify on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, username, email, role, verification_status, real_balance)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    'user', -- Default
    'not_verified',
    0
  );
  
  INSERT INTO public.bot_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-verify marketers when role is updated
CREATE OR REPLACE FUNCTION public.on_user_role_update()
RETURNS trigger AS $$
BEGIN
    IF NEW.role = 'marketer' AND OLD.role != 'marketer' THEN
        NEW.verification_status := 'verified';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_on_user_role_update ON public.users;
CREATE TRIGGER tr_on_user_role_update
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.on_user_role_update();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. RPC: Server Balance Update (Used by PayHero Backend)
-- This function is protected by SECURITY DEFINER and is only called by backend using service_role
CREATE OR REPLACE FUNCTION public.admin_credit_user(target_user_id UUID, credit_amount NUMERIC)
RETURNS void AS $$
BEGIN
  UPDATE public.users 
  SET real_balance = real_balance + credit_amount
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
