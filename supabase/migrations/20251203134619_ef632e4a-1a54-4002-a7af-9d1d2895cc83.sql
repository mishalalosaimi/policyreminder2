-- Phase 1: Create new multi-tenant organization structure

-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'broker');

-- 2. Organizations table (replacing companies)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'active',
  max_seats INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Organization members (links users to orgs with roles)
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'broker',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- 4. User roles table (for security definer function)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- 5. Invitations table
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'broker',
  invited_by UUID REFERENCES auth.users(id) NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, email)
);

-- 6. Enable RLS on all new tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- 7. Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id 
    AND organization_id = _org_id 
    AND role = 'admin'
  )
$$;

-- 8. RLS Policies for organizations
CREATE POLICY "Members can view their organization"
ON public.organizations FOR SELECT
TO authenticated
USING (id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins can update their organization"
ON public.organizations FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), id));

-- 9. RLS Policies for organization_members
CREATE POLICY "Members can view org members"
ON public.organization_members FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins can insert org members"
ON public.organization_members FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update org members"
ON public.organization_members FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete org members"
ON public.organization_members FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- 10. RLS Policies for invitations
CREATE POLICY "Admins can view invitations"
ON public.invitations FOR SELECT
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can insert invitations"
ON public.invitations FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update invitations"
ON public.invitations FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete invitations"
ON public.invitations FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Users can view invitations by token"
ON public.invitations FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- 11. RLS for user_roles (read-only for users)
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 12. Add organization_id and user_id to policies table
ALTER TABLE public.policies 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id),
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 13. Migrate existing companies to organizations
INSERT INTO public.organizations (id, name, created_at)
SELECT id, name, created_at FROM public.companies;

-- 14. Migrate existing profiles to organization_members as admins
INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
SELECT company_id, user_id, 'admin'::app_role, created_at FROM public.profiles;

-- 15. Add admin role for existing users
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'admin'::app_role FROM public.profiles;

-- 16. Update policies with organization_id from company_id
UPDATE public.policies 
SET organization_id = company_id
WHERE company_id IS NOT NULL AND organization_id IS NULL;

-- 17. Update policies RLS to use new organization model
DROP POLICY IF EXISTS "Users can view policies in their company" ON public.policies;
DROP POLICY IF EXISTS "Users can insert policies in their company" ON public.policies;
DROP POLICY IF EXISTS "Users can update policies in their company" ON public.policies;
DROP POLICY IF EXISTS "Users can delete policies in their company" ON public.policies;

-- Brokers see only their own policies, admins see all in org
CREATE POLICY "Users can view policies"
ON public.policies FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.is_org_admin(auth.uid(), organization_id)
  OR (organization_id = public.get_user_organization(auth.uid()) AND user_id IS NULL)
);

CREATE POLICY "Users can insert policies"
ON public.policies FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
);

CREATE POLICY "Users can update policies"
ON public.policies FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.is_org_admin(auth.uid(), organization_id)
);

CREATE POLICY "Users can delete policies"
ON public.policies FOR DELETE
TO authenticated
USING (
  user_id = auth.uid() 
  OR public.is_org_admin(auth.uid(), organization_id)
);

-- 18. Update settings RLS for organizations
DROP POLICY IF EXISTS "Users can view settings in their company" ON public.settings;
DROP POLICY IF EXISTS "Users can insert settings in their company" ON public.settings;
DROP POLICY IF EXISTS "Users can update settings in their company" ON public.settings;

ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Migrate settings company_id to organization_id
UPDATE public.settings 
SET organization_id = company_id
WHERE company_id IS NOT NULL AND organization_id IS NULL;

CREATE POLICY "Users can view org settings"
ON public.settings FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins can insert org settings"
ON public.settings FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update org settings"
ON public.settings FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));