-- SQL FIX FOR TRADE BALANCES AND PROFITS
-- This allows trade results to save correctly to the database.

-- 1. Ensure the protection trigger allows balance and profit updates
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- A. PROTECT ROLES: Only master admins can change user roles
  IF NOT public.is_admin() THEN
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;

  -- B. AUTO-VERIFY: Marketers are verified automatically
  IF (NEW.role = 'marketer' AND OLD.role != 'marketer') THEN
    NEW.verification_status := 'verified';
  END IF;

  -- C. BALANCES & PROFITS: 
  -- We allow users to update their own profits and balances so trades work correctly.
  -- This fixes the issue of trade history and balances "resetting".

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Re-attach the trigger just in case
DROP TRIGGER IF EXISTS tr_protect_user_fields ON public.users;
CREATE TRIGGER tr_protect_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_fields();

-- 3. Optimization: Ensure indexes exist for faster trade history recall
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
