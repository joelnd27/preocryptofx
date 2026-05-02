-- Ensure the admin user exists in the users table with the correct role
-- Replace the ID and Email if they are different from what's in your app.ts
INSERT INTO public.users (id, email, username, role)
VALUES ('304020c9-3695-4f8f-85fe-9ee12eda8152', 'wren20688@gmail.com', 'Admin', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Fix potential recursion or performance issues with is_staff
-- Sometimes using the same table in a policy can be slow or tricky
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update policies to be more explicit
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users 
FOR SELECT USING (auth.uid() = id OR is_staff());

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users 
FOR UPDATE USING (auth.uid() = id OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin');

-- Ensure admins can see and update ALL transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions 
FOR SELECT USING (auth.uid() = user_id OR is_staff());

DROP POLICY IF EXISTS "Staff can update transactions" ON public.transactions;
CREATE POLICY "Staff can update transactions" ON public.transactions 
FOR UPDATE USING (is_staff());
