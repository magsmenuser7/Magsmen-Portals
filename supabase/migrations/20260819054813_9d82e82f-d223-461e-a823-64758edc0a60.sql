REVOKE EXECUTE ON FUNCTION public.is_chat_participant(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_join_chat_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_chat_channel(uuid) TO authenticated;