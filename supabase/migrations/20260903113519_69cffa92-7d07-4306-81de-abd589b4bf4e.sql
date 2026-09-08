-- 1) Least-privilege EXECUTE on public functions
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_team_member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_chat_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_meeting_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_meeting(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_directory() TO authenticated;
-- handle_new_user() and touch_updated_at() stay trigger-only: no API role may execute them.

-- 2) Chat attachments: ownership or channel membership required
DROP POLICY IF EXISTS chat_media_read ON storage.objects;
CREATE POLICY chat_media_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.attachment_url = storage.objects.name
        AND public.is_chat_participant(m.channel_id)
    )
  )
);

-- 3) Team members: clients only see members assigned to their own tasks
DROP POLICY IF EXISTS team_members_select ON public.team_members;
CREATE POLICY team_members_select ON public.team_members
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.current_app_role() = 'team'
  OR user_id = auth.uid()
  OR (
    public.current_app_role() = 'client'
    AND public.my_client_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.assigned_to = team_members.id
        AND t.client_id = public.my_client_id()
    )
  )
);

-- 4) Meetings: explicit client scoping (no null-matching edge case)
DROP POLICY IF EXISTS meetings_select ON public.meetings;
CREATE POLICY meetings_select ON public.meetings
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.is_meeting_participant(id)
  OR host_id = auth.uid()
  OR created_by = auth.uid()
  OR (
    public.current_app_role() = 'client'
    AND public.my_client_id() IS NOT NULL
    AND client_id IS NOT NULL
    AND client_id = public.my_client_id()
  )
);

CREATE OR REPLACE FUNCTION public.can_view_meeting(_meeting uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_admin()
     OR public.is_meeting_participant(_meeting)
     OR EXISTS (
          SELECT 1 FROM public.meetings m
          WHERE m.id = _meeting
            AND (
              m.host_id = auth.uid()
              OR m.created_by = auth.uid()
              OR (
                public.current_app_role() = 'client'
                AND public.my_client_id() IS NOT NULL
                AND m.client_id IS NOT NULL
                AND m.client_id = public.my_client_id()
              )
            )
        )
$function$;

REVOKE EXECUTE ON FUNCTION public.can_view_meeting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_meeting(uuid) TO authenticated;