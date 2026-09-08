
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS zoom_uuid text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_zoom_event text,
  ADD COLUMN IF NOT EXISTS last_zoom_event_at timestamptz;

CREATE INDEX IF NOT EXISTS meetings_zoom_meeting_id_idx ON public.meetings (zoom_meeting_id);

ALTER TABLE public.meeting_participants
  ADD COLUMN IF NOT EXISTS joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

CREATE TABLE IF NOT EXISTS public.zoom_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  zoom_meeting_id text,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.zoom_webhook_events TO service_role;
ALTER TABLE public.zoom_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.zoom_webhook_events REPLICA IDENTITY FULL;
ALTER TABLE public.meetings REPLICA IDENTITY FULL;
ALTER TABLE public.meeting_participants REPLICA IDENTITY FULL;
