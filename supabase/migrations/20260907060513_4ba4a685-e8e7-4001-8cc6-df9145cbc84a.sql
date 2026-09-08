-- Enums -------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.call_type AS ENUM ('audio','video','screen_share');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.call_status AS ENUM (
    'initiating','ringing','accepted','connecting','connected','reconnecting',
    'declined','cancelled','missed','busy','ended','failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_type public.call_type NOT NULL DEFAULT 'audio',
  status public.call_status NOT NULL DEFAULT 'initiating',
  room_name text NOT NULL UNIQUE,
  end_reason text,
  ended_by uuid,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calls_distinct_parties CHECK (caller_id <> receiver_id)
);

GRANT SELECT ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calls_select_participants ON public.calls;
CREATE POLICY calls_select_participants ON public.calls
  FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE INDEX IF NOT EXISTS calls_caller_idx ON public.calls (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_receiver_idx ON public.calls (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_tenant_idx ON public.calls (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_status_idx ON public.calls (status);
CREATE INDEX IF NOT EXISTS calls_active_idx ON public.calls (status)
  WHERE status IN ('initiating','ringing','accepted','connecting','connected','reconnecting');

DROP TRIGGER IF EXISTS calls_touch_updated_at ON public.calls;
CREATE TRIGGER calls_touch_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Authorization: who may call whom (mirrors chat_directory rules) ------
CREATE OR REPLACE FUNCTION public.can_call_user(_caller uuid, _receiver uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE caller_role public.app_role; receiver_role public.app_role; caller_client uuid;
BEGIN
  IF _caller IS NULL OR _receiver IS NULL OR _caller = _receiver THEN RETURN false; END IF;
  SELECT role INTO caller_role FROM public.users WHERE id = _caller;
  SELECT role INTO receiver_role FROM public.users WHERE id = _receiver;
  IF caller_role IS NULL OR receiver_role IS NULL THEN RETURN false; END IF;

  IF caller_role = 'admin' OR receiver_role = 'admin' THEN RETURN true; END IF;

  IF caller_role = 'team' AND receiver_role = 'team' THEN RETURN true; END IF;

  -- client <-> team: only team members assigned to that client's tasks
  IF caller_role = 'client' AND receiver_role = 'team' THEN
    SELECT id INTO caller_client FROM public.clients WHERE user_id = _caller;
    RETURN EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.team_members tm ON tm.id = t.assigned_to
      WHERE t.client_id = caller_client AND tm.user_id = _receiver
    );
  END IF;

  IF caller_role = 'team' AND receiver_role = 'client' THEN
    SELECT id INTO caller_client FROM public.clients WHERE user_id = _receiver;
    RETURN EXISTS (
      SELECT 1 FROM public.tasks t
      JOIN public.team_members tm ON tm.id = t.assigned_to
      WHERE t.client_id = caller_client AND tm.user_id = _caller
    );
  END IF;

  RETURN false;
END; $$;

REVOKE ALL ON FUNCTION public.can_call_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_call_user(uuid, uuid) TO authenticated, service_role;

-- Busy check ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_active_call(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calls c
    WHERE (c.caller_id = _user OR c.receiver_id = _user)
      AND c.status IN ('initiating','ringing','accepted','connecting','connected','reconnecting')
      AND c.created_at > now() - interval '4 hours'
  )
$$;

REVOKE ALL ON FUNCTION public.has_active_call(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_call(uuid) TO authenticated, service_role;

-- Ring timeout sweep ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_calls(_timeout_seconds integer DEFAULT 45)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  WITH upd AS (
    UPDATE public.calls
       SET status = 'missed',
           ended_at = now(),
           end_reason = 'timeout'
     WHERE status IN ('initiating','ringing')
       AND created_at < now() - make_interval(secs => _timeout_seconds)
    RETURNING 1
  ) SELECT count(*) INTO n FROM upd;

  UPDATE public.calls
     SET status = 'ended',
         ended_at = now(),
         end_reason = 'stale',
         duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(answered_at, created_at)))::int)
   WHERE status IN ('accepted','connecting','connected','reconnecting')
     AND created_at < now() - interval '4 hours';

  RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.expire_stale_calls(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_calls(integer) TO service_role;

-- Realtime -------------------------------------------------------------
ALTER TABLE public.calls REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
