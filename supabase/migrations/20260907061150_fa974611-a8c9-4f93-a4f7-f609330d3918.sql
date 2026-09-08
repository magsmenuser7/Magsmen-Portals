REVOKE EXECUTE ON FUNCTION public.has_active_call(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_calls(integer) FROM authenticated;