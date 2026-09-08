ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS zoom_meeting_id text,
  ADD COLUMN IF NOT EXISTS zoom_join_url text,
  ADD COLUMN IF NOT EXISTS zoom_start_url text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'attendee',
  response_status text NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_participants TO authenticated;
GRANT ALL ON public.meeting_participants TO service_role;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'meeting',
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_meeting_participant(_meeting uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants p
    WHERE p.meeting_id = _meeting AND p.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_meeting(_meeting uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin()
     OR public.is_meeting_participant(_meeting)
     OR EXISTS (
          SELECT 1 FROM public.meetings m
          WHERE m.id = _meeting
            AND (
              m.host_id = auth.uid()
              OR m.created_by = auth.uid()
              OR (public.current_app_role() = 'client' AND m.client_id IS NOT NULL AND m.client_id = public.my_client_id())
            )
        )
$$;

DROP POLICY IF EXISTS meetings_select ON public.meetings;
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
DROP POLICY IF EXISTS meetings_update ON public.meetings;
DROP POLICY IF EXISTS meetings_delete ON public.meetings;

CREATE POLICY meetings_select ON public.meetings FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.is_meeting_participant(id)
  OR host_id = auth.uid()
  OR created_by = auth.uid()
  OR (public.current_app_role() = 'client' AND client_id IS NOT NULL AND client_id = public.my_client_id())
);

CREATE POLICY meetings_insert_admin ON public.meetings FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY meetings_update_admin ON public.meetings FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY meetings_delete_admin ON public.meetings FOR DELETE TO authenticated
USING (public.is_admin());

CREATE POLICY meeting_participants_select ON public.meeting_participants FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_view_meeting(meeting_id));

CREATE POLICY meeting_participants_insert_admin ON public.meeting_participants FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY meeting_participants_update ON public.meeting_participants FOR UPDATE TO authenticated
USING (public.is_admin() OR user_id = auth.uid())
WITH CHECK (public.is_admin() OR user_id = auth.uid());

CREATE POLICY meeting_participants_delete_admin ON public.meeting_participants FOR DELETE TO authenticated
USING (public.is_admin());

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.is_admin() OR user_id = auth.uid());

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER meeting_participants_touch_updated_at
BEFORE UPDATE ON public.meeting_participants
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS meeting_participants_user_idx ON public.meeting_participants(user_id);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.meeting_participants REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;