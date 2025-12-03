-- Update handle_new_user trigger to work with new organization structure
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
BEGIN
  -- Check if company_id/organization_id is provided in metadata (for invited users)
  IF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    new_org_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  ELSE
    -- Create a new organization for this user
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Company'))
    RETURNING id INTO new_org_id;
    
    -- Also insert into legacy companies table for backward compatibility
    INSERT INTO public.companies (id, name)
    VALUES (new_org_id, COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Company'))
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  -- Create user profile
  INSERT INTO public.profiles (user_id, company_id, name, email)
  VALUES (
    NEW.id,
    new_org_id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  );
  
  -- Add user to organization_members (as admin for new orgs, role from metadata for invited users)
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (
    new_org_id,
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'admin'::app_role)
  );
  
  -- Add role to user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'admin'::app_role)
  );
  
  RETURN NEW;
END;
$function$;