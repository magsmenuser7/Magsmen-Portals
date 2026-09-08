
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.chat_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false,
  ALTER COLUMN receiver_id DROP NOT NULL;

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_distinct_parties;
ALTER TABLE public.calls ADD CONSTRAINT calls_distinct_parties
  CHECK (receiver_id IS NULL OR caller_id <> receiver_id);
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_target_present;
ALTER TABLE public.calls ADD CONSTRAINT calls_target_present
  CHECK ((is_group AND channel_id IS NOT NULL) OR (NOT is_group AND receiver_id IS NOT NULL));

DO $$ BEGIN
  CREATE TYPE public.call_participant_status AS ENUM
    ('ringing','accepted','declined','joined','left','missed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.call_participants (
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.call_participant_status NOT NULL DEFAULT 'ringing',
  is_host boolean NOT NULL DEFAULT false,
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  left_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

GRANT SELECT ON public.call_participants TO authenticated;
GRANT ALL ON public.call_participants TO service_role;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_call_member(_call uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = _call AND (c.caller_id = _user OR c.receiver_id = _user)
  ) OR EXISTS (
    SELECT 1 FROM public.call_participants p
    WHERE p.call_id = _call AND p.user_id = _user
  )
$$;
REVOKE ALL ON FUNCTION public.is_call_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_call_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS call_participants_select ON public.call_participants;
CREATE POLICY call_participants_select ON public.call_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_call_member(call_id, auth.uid()));

DROP POLICY IF EXISTS calls_select_participants ON public.calls;
CREATE POLICY calls_select_participants ON public.calls
  FOR SELECT TO authenticated
  USING (
    auth.uid() = caller_id
    OR auth.uid() = receiver_id
    OR EXISTS (
      SELECT 1 FROM public.call_participants p
      WHERE p.call_id = calls.id AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS call_participants_user_idx
  ON public.call_participants (user_id, invited_at DESC);
CREATE INDEX IF NOT EXISTS calls_channel_idx ON public.calls (channel_id, created_at DESC);

DROP TRIGGER IF EXISTS call_participants_touch_updated_at ON public.call_participants;
CREATE TRIGGER call_participants_touch_updated_at BEFORE UPDATE ON public.call_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Can this user start/join a group call in this conversation room? --------
CREATE OR REPLACE FUNCTION public.can_join_group_call(_user uuid, _channel uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants cp
    WHERE cp.channel_id = _channel AND cp.user_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.chat_channels ch
    WHERE ch.id = _channel AND _user = ANY (ch.member_ids)
  )
$$;
REVOKE ALL ON FUNCTION public.can_join_group_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_join_group_call(uuid, uuid) TO authenticated, service_role;

-- Busy check now covers group participation -------------------------------
CREATE OR REPLACE FUNCTION public.has_active_call(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calls c
    WHERE (c.caller_id = _user OR c.receiver_id = _user)
      AND c.status IN ('initiating','ringing','accepted','connecting','connected','reconnecting')
      AND c.created_at > now() - interval '4 hours'
  ) OR EXISTS (
    SELECT 1 FROM public.call_participants p
    JOIN public.calls c ON c.id = p.call_id
    WHERE p.user_id = _user
      AND p.status IN ('ringing','accepted','joined')
      AND c.status IN ('initiating','ringing','accepted','connecting','connected','reconnecting')
      AND c.created_at > now() - interval '4 hours'
  )
$$;
REVOKE ALL ON FUNCTION public.has_active_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_call(uuid) TO service_role;

-- Sweep also resolves stale participant rows -------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_calls(_timeout_seconds integer DEFAULT 45)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.call_participants p
     SET status = 'missed'
    FROM public.calls c
   WHERE c.id = p.call_id
     AND p.status = 'ringing'
     AND c.created_at < now() - make_interval(secs => _timeout_seconds);

  WITH upd AS (
    UPDATE public.calls c
       SET status = 'missed', ended_at = now(), end_reason = 'timeout'
     WHERE c.status IN ('initiating','ringing')
       AND c.created_at < now() - make_interval(secs => _timeout_seconds)
       AND NOT EXISTS (
         SELECT 1 FROM public.call_participants p
         WHERE p.call_id = c.id AND p.status IN ('accepted','joined')
       )
    RETURNING 1
  ) SELECT count(*) INTO n FROM upd;

  UPDATE public.calls
     SET status = 'ended', ended_at = now(), end_reason = 'stale',
         duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(answered_at, created_at)))::int)
   WHERE status IN ('accepted','connecting','connected','reconnecting')
     AND created_at < now() - interval '4 hours';

  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.expire_stale_calls(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_calls(integer) TO service_role;

ALTER TABLE public.call_participants REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
