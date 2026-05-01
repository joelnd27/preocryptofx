-- ==========================================================
-- PREOCRYPTOFX SECURITY HARDENING SCRIPT
-- Resolves "Mutable Search Path" and "Public Can Execute" warnings
-- ==========================================================

DO $$ 
DECLARE 
    func_record RECORD;
    func_signature TEXT;
BEGIN
    -- 1. Automate Search Path & Execution Revocation for ALL public functions
    -- This fixes the "Mutable Search Path" security warning for every function at once.
    FOR func_record IN 
        SELECT n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    LOOP
        func_signature := format('%I.%I(%s)', func_record.schema, func_record.name, func_record.args);
        
        -- A. Fix Search Path (Security Best Practice)
        EXECUTE format('ALTER FUNCTION %s SET search_path = public', func_signature);
        
        -- B. Revoke Public access (fixes "Public Can Execute" warning)
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', func_signature);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', func_signature);
        
        -- C. Ensure Service Role (Supabase Dashboard/Background Tasks) can always run them
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', func_signature);
    END LOOP;
END $$;

-- 2. Restore essential permissions for Web App features
-- These functions MUST be executable by logged-in users for the site to work properly.

-- Grant access to is_admin for RLS checks
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Grant access to is_staff for RLS checks
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'is_staff') THEN
        GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
    END IF;
END $$;

-- Grant access to is_marketer for RLS checks
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'is_marketer') THEN
        GRANT EXECUTE ON FUNCTION public.is_marketer() TO authenticated;
    END IF;
END $$;

-- Grant access to check_admin for RLS checks
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'check_admin') THEN
        GRANT EXECUTE ON FUNCTION public.check_admin() TO authenticated;
    END IF;
END $$;

-- Grant access to auto_process_pending (called from useStore.ts)
GRANT EXECUTE ON FUNCTION public.auto_process_pending() TO authenticated;

-- Grant access to auto_process_verification (called by auto_process_pending)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND pg_proc.proname = 'auto_process_verification') THEN
        GRANT EXECUTE ON FUNCTION public.auto_process_verification() TO authenticated;
    END IF;
END $$;

-- 3. Verify Admin access for wren20688@gmail.com
-- This ensures you never lose access to your dashboard.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Allow Service Role (Backend)
  IF (auth.role() = 'service_role') THEN
    RETURN TRUE;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND email = 'wren20688@gmail.com'
      AND id = '304020c9-3695-4f8f-85fe-9ee12eda8152' -- Your specific UID
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Success Message
SELECT 'Security hardening complete. All mutable search path warnings resolved and sensitive functions protected.' as status;
