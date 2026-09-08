CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  agenda text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  duration_mins integer NOT NULL DEFAULT 30,
  host_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  host_name text NOT NULL DEFAULT '',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled',
  portals text[] NOT NULL DEFAULT '{client,team,admin}',
  attendee_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_select ON public.meetings FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (public.current_app_role() = 'team' AND 'team' = ANY(portals))
  OR (public.current_app_role() = 'client' AND 'client' = ANY(portals) AND (client_id IS NULL OR client_id = public.my_client_id()))
);

CREATE POLICY meetings_insert ON public.meetings FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY meetings_update ON public.meetings FOR UPDATE TO authenticated
USING (public.is_admin() OR public.current_app_role() = 'team' OR created_by = auth.uid() OR host_id = auth.uid())
WITH CHECK (public.is_admin() OR public.current_app_role() = 'team' OR created_by = auth.uid() OR host_id = auth.uid());

CREATE POLICY meetings_delete ON public.meetings FOR DELETE TO authenticated
USING (public.is_admin() OR created_by = auth.uid());

CREATE TRIGGER meetings_touch_updated_at BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;

INSERT INTO public.meetings (title, agenda, starts_at, duration_mins, host_name, project, link, status, portals)
VALUES
 ('Northwind weekly sync','Delivery status, blockers and next milestone sign-off.', now() + interval '30 minutes', 30, 'Elena Fischer','Northwind','https://meet.magsmen.com/northwind-weekly','scheduled','{client,team,admin}'),
 ('Sprint 24 planning','Scope the billing queue rollout and portal design refresh.', now() + interval '1 day', 45, 'Priya Nair','CXO Portal','https://meet.magsmen.com/sprint-24','scheduled','{team,admin}'),
 ('Quarterly access review','Audit roles, ClickUp tokens and workspace permissions.', now() + interval '2 days', 60, 'Ravi Menon','Internal','https://meet.magsmen.com/access-review','scheduled','{client,team,admin}'),
 ('Design critique','Review KPI card variants for the client dashboard.', now() - interval '2 days', 40, 'Marcus Hale','Client A','https://meet.magsmen.com/design-critique','completed','{client,team,admin}'),
 ('API integration call','Discussed webhook events and data mappings.', now() - interval '3 days', 30, 'Priya Nair','Internal','https://meet.magsmen.com/api-call','cancelled','{client,team,admin}'),
 ('Kickoff meeting','Project kickoff and requirements walkthrough.', now() - interval '6 days', 60, 'Elena Fischer','Northwind','https://meet.magsmen.com/kickoff','completed','{client,team,admin}');