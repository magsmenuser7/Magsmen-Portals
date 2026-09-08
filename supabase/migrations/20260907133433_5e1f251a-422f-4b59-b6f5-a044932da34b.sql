-- Lock down the calling helper functions: only the roles that genuinely need
-- them keep EXECUTE. RLS predicates still work because policy functions are
-- SECURITY DEFINER and executed by the querying role.
REVOKE ALL ON FUNCTION public.is_call_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_join_group_call(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_call(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_calls(integer) FROM PUBLIC, anon, authenticated;

-- Needed by the call_participants / calls RLS policies.
GRANT EXECUTE ON FUNCTION public.is_call_member(uuid, uuid) TO authenticated;

-- Server-side (service role) usage only.
GRANT EXECUTE ON FUNCTION public.can_join_group_call(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_call(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_calls(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_call_member(uuid, uuid) TO service_role;