-- 1. Task updates: owners (clients) can update their own tasks; team can update assigned; admin all
DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR (current_app_role() = 'team'::app_role AND assigned_to = my_team_member_id())
    OR (current_app_role() = 'client'::app_role AND client_id = my_client_id())
  )
  WITH CHECK (
    is_admin()
    OR (current_app_role() = 'team'::app_role AND assigned_to = my_team_member_id())
    OR (current_app_role() = 'client'::app_role AND client_id = my_client_id())
  );

-- Clients may delete their own tasks too
DROP POLICY IF EXISTS tasks_delete_admin ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR (current_app_role() = 'client'::app_role AND client_id = my_client_id())
  );

-- 2. PRIVACY: clients may only read team members assigned to one of their own tasks
DROP POLICY IF EXISTS team_members_select ON public.team_members;
CREATE POLICY team_members_select ON public.team_members
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR current_app_role() = 'team'::app_role
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.assigned_to = team_members.id
        AND t.client_id = my_client_id()
    )
  );

-- 3. Configurable ClickUp status mapping
CREATE TABLE IF NOT EXISTS public.clickup_status_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_status public.task_status NOT NULL UNIQUE,
  clickup_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.clickup_status_map TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.clickup_status_map TO authenticated;
GRANT ALL ON public.clickup_status_map TO service_role;

ALTER TABLE public.clickup_status_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY clickup_status_map_select ON public.clickup_status_map
  FOR SELECT TO authenticated
  USING (is_admin() OR current_app_role() = 'team'::app_role);
CREATE POLICY clickup_status_map_write ON public.clickup_status_map
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE TRIGGER clickup_status_map_touch_updated_at
  BEFORE UPDATE ON public.clickup_status_map
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.clickup_status_map (internal_status, clickup_status) VALUES
  ('todo', 'to do'),
  ('in_progress', 'in progress'),
  ('in_review', 'review'),
  ('completed', 'complete'),
  ('rejected', 'closed')
ON CONFLICT (internal_status) DO NOTHING;

-- 4. Sync log readable/writable by service role for background sync
GRANT ALL ON public.clickup_sync_log TO service_role;
GRANT ALL ON public.tasks TO service_role;
GRANT ALL ON public.task_activity TO service_role;
GRANT ALL ON public.team_members TO service_role;
GRANT ALL ON public.clients TO service_role;
GRANT ALL ON public.users TO service_role;