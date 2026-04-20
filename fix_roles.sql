-- 1. Improved is_admin function
-- This version checks both hardcoded credentials AND the 'admin' role in public.users
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  requester_role TEXT;
BEGIN
  -- Always allow the service role (the backend server)
  IF (auth.role() = 'service_role') THEN
    RETURN TRUE;
  END IF;

  -- Check if the current user is a master admin (hardcoded)
  IF (EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = auth.uid() 
    AND (
      email = 'wren20688@gmail.com' 
      OR id = '304020c9-3695-4f8f-85fe-9ee12eda8152'
    )
  )) THEN
    RETURN TRUE;
  END IF;

  -- Check if the current user has the 'admin' role in the public.users table
  SELECT role INTO requester_role FROM public.users WHERE id = auth.uid();
  IF (requester_role = 'admin') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update the protection trigger to be more explicit
CREATE OR REPLACE FUNCTION public.protect_user_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If not an admin, prevent changing sensitive fields
  IF NOT public.is_admin() THEN
    -- Prevent role hacking
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
      NEW.role := OLD.role;
    END IF;
    -- Prevent balance hacking
    IF (OLD.real_balance IS DISTINCT FROM NEW.real_balance AND auth.uid() = NEW.id) THEN
      NEW.real_balance := OLD.real_balance;
    END IF;
  END IF;

  -- Ensure verification_status is set to verified if role becomes marketer
  IF (NEW.role = 'marketer' AND OLD.role != 'marketer') THEN
    NEW.verification_status := 'verified';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure the trigger is attached correctly
DROP TRIGGER IF EXISTS tr_protect_user_fields ON public.users;
CREATE TRIGGER tr_protect_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_fields();

-- 4. Audit: Ensure all existing admins (by email) are correctly marked in the DB
UPDATE public.users SET role = 'admin' WHERE email = 'wren20688@gmail.com';
