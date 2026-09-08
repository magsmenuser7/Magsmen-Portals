DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
FOR SELECT TO authenticated
USING (
  is_admin()
  OR (current_app_role() = 'team'::app_role AND assigned_to IS NOT NULL)
  OR client_id = my_client_id()
);