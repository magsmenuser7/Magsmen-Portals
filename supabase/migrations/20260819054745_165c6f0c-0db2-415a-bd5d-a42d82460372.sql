-- Participant-scoped chat privacy
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE TABLE IF NOT EXISTS public.chat_participants (
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.chat_participants TO authenticated;
GRANT ALL ON public.chat_participants TO service_role;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_chat_participant(_channel uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_participants p WHERE p.channel_id = _channel AND p.user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.can_join_chat_channel(_channel uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_chat_participant(_channel)
      OR EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = _channel AND c.created_by = auth.uid())
$$;

DROP POLICY IF EXISTS chat_participants_select ON public.chat_participants;
CREATE POLICY chat_participants_select ON public.chat_participants FOR SELECT TO authenticated
  USING (public.is_chat_participant(channel_id) OR user_id = auth.uid());
DROP POLICY IF EXISTS chat_participants_insert ON public.chat_participants;
CREATE POLICY chat_participants_insert ON public.chat_participants FOR INSERT TO authenticated
  WITH CHECK (public.can_join_chat_channel(channel_id));
DROP POLICY IF EXISTS chat_participants_delete ON public.chat_participants;
CREATE POLICY chat_participants_delete ON public.chat_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Backfill participants from legacy member_ids (map team_member ids to their auth user)
INSERT INTO public.chat_participants (channel_id, user_id)
SELECT c.id, u.id
FROM public.chat_channels c
CROSS JOIN LATERAL unnest(c.member_ids) AS m(mid)
JOIN auth.users u ON u.id = m.mid
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_participants (channel_id, user_id)
SELECT c.id, tm.user_id
FROM public.chat_channels c
CROSS JOIN LATERAL unnest(c.member_ids) AS m(mid)
JOIN public.team_members tm ON tm.id = m.mid AND tm.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_participants (channel_id, user_id)
SELECT DISTINCT m.channel_id, m.author_id
FROM public.chat_messages m WHERE m.author_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Lock down channels and messages to participants only
DROP POLICY IF EXISTS chat_channels_select ON public.chat_channels;
CREATE POLICY chat_channels_select ON public.chat_channels FOR SELECT TO authenticated
  USING (public.is_chat_participant(id) OR created_by = auth.uid());
DROP POLICY IF EXISTS chat_channels_insert ON public.chat_channels;
CREATE POLICY chat_channels_insert ON public.chat_channels FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS chat_channels_update ON public.chat_channels;
CREATE POLICY chat_channels_update ON public.chat_channels FOR UPDATE TO authenticated
  USING (public.is_chat_participant(id)) WITH CHECK (public.is_chat_participant(id));

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_chat_participant(channel_id));
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_chat_participant(channel_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;