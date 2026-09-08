REVOKE EXECUTE ON FUNCTION public.is_meeting_participant(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_meeting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meeting_participant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_meeting(uuid) TO authenticated, service_role;