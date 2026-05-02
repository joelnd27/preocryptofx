-- =======================================================
-- MASTER CLEANUP & SALIM TRANSACTION FIX
-- =======================================================

-- 1. Fix Salim's Transaction and Balance
DO $$ 
DECLARE 
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM public.users WHERE email = 'salimlahmed123@gmail.com';
    
    IF target_user_id IS NOT NULL THEN
        -- Mark the $20 deposit as completed
        UPDATE public.transactions 
        SET status = 'completed' 
        WHERE user_id = target_user_id 
          AND type = 'DEPOSIT' 
          AND amount = 20.00;
          
        -- Set balance to 5.78 as requested
        -- We use 5.78 to match the user's specific request
        -- The field is 'real_balance' based on schema
        UPDATE public.users SET real_balance = 5.78 WHERE id = target_user_id;
        
        RAISE NOTICE 'Fixed Salim Lahmed (%): Transaction set to completed, balance set to 5.78', target_user_id;
    ELSE
        RAISE NOTICE 'User salimlahmed123@gmail.com not found.';
    END IF;
END $$;

-- 2. Housekeeping: Remove ghost triggers that cause errors
-- These are common legacy trigger names that might still be in your DB
DROP TRIGGER IF EXISTS on_user_verify_change ON public.users;
DROP TRIGGER IF EXISTS tr_auto_verify_users ON public.users;
DROP TRIGGER IF EXISTS on_user_role_change ON public.users;

-- Re-create the verified fields cleanup function
CREATE OR REPLACE FUNCTION public.auto_verify_marketers()
RETURNS trigger AS $$
BEGIN
  -- We only use verification_status now. 
  -- If you see "record new has no field is_verified", this function is now clean.
  IF (NEW.role = 'marketer') THEN
    NEW.verification_status := 'verified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-attach the trigger
CREATE TRIGGER on_user_role_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_verify_marketers();

-- 3. Fix the Security Warnings & Search Path
-- This stops the "Security Definer" and "Search Path" errors in your screenshots
ALTER FUNCTION public.is_staff() SET search_path = public;
ALTER FUNCTION public.auto_process_pending() SET search_path = public;
ALTER FUNCTION public.auto_process_verification() SET search_path = public;

-- 4. Re-grant permissions just in case
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_process_pending() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_process_verification() TO authenticated, service_role;

-- 5. Final Stats refresh (Optional, stats are calculated on load usually)
-- This just ensures the view is clean
DROP VIEW IF EXISTS public.admin_user_financials;
CREATE VIEW public.admin_user_financials AS
SELECT 
    u.id, u.username, u.email, u.role, u.verification_status,
    COALESCE(SUM(CASE WHEN t.type = 'DEPOSIT' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_deposited_usd,
    COALESCE(SUM(CASE WHEN t.type = 'WITHDRAW' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_withdrawn_usd,
    u.real_balance, u.demo_balance, u.created_at
FROM public.users u
LEFT JOIN public.transactions t ON u.id = t.user_id
GROUP BY u.id, u.username, u.email, u.role, u.verification_status, u.real_balance, u.demo_balance, u.created_at;
