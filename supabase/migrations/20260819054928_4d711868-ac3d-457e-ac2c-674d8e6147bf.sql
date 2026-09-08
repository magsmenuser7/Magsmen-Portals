CREATE OR REPLACE FUNCTION public.chat_directory()
RETURNS TABLE (user_id uuid, name text, email text, role public.app_role, company text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT u.role INTO me_role FROM public.users u WHERE u.id = auth.uid();

  IF me_role = 'admin' THEN
    RETURN QUERY
      SELECT u.id, u.name, u.email, u.role, COALESCE(c.company_name, '')
      FROM public.users u
      LEFT JOIN public.clients c ON c.user_id = u.id
      WHERE u.id <> auth.uid();
  ELSIF me_role = 'team' THEN
    RETURN QUERY
      SELECT u.id, u.name, u.email, u.role, ''::text
      FROM public.users u
      WHERE u.id <> auth.uid() AND u.role IN ('admin','team');
  ELSE
    RETURN QUERY
      SELECT u.id, u.name, u.email, u.role, ''::text
      FROM public.users u
      WHERE u.id <> auth.uid() AND u.role = 'admin'
    UNION
      SELECT u.id, u.name, u.email, u.role, ''::text
      FROM public.users u
      JOIN public.team_members tm ON tm.user_id = u.id
      JOIN public.tasks t ON t.assigned_to = tm.id
      WHERE t.client_id = public.my_client_id();
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.chat_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_directory() TO authenticated;