-- Drop all existing policies completely
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;
DROP POLICY IF EXISTS "Users can view profiles in their company" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view policies in their company" ON public.policies;
DROP POLICY IF EXISTS "Users can insert policies in their company" ON public.policies;
DROP POLICY IF EXISTS "Users can update policies in their company" ON public.policies;
DROP POLICY IF EXISTS "Users can delete policies in their company" ON public.policies;
DROP POLICY IF EXISTS "Users can view settings in their company" ON public.settings;
DROP POLICY IF EXISTS "Users can update settings in their company" ON public.settings;
DROP POLICY IF EXISTS "Users can insert settings in their company" ON public.settings;

-- Create security definer function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Recreate RLS policies using the security definer function
CREATE POLICY "Users can view their own company"
  ON public.companies
  FOR SELECT
  USING (id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can view profiles in their company"
  ON public.profiles
  FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view policies in their company"
  ON public.policies
  FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert policies in their company"
  ON public.policies
  FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update policies in their company"
  ON public.policies
  FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete policies in their company"
  ON public.policies
  FOR DELETE
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can view settings in their company"
  ON public.settings
  FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update settings in their company"
  ON public.settings
  FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert settings in their company"
  ON public.settings
  FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));