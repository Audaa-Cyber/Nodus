-- These SECURITY DEFINER functions are only invoked by their auth.users triggers.
-- They must not be callable through PostgREST's RPC interface.
revoke execute on function public.create_business_profile_for_user() from public, anon, authenticated;
revoke execute on function public.sync_business_profile_email() from public, anon, authenticated;
