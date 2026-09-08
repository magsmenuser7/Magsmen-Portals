UPDATE public.team_members tm
SET user_id = u.id
FROM public.users u
WHERE tm.user_id IS NULL AND lower(tm.email) = lower(u.email) AND u.role IN ('team','admin');

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated
USING (
  is_admin()
  OR current_app_role() = 'team'::app_role
  OR (current_app_role() = 'client'::app_role AND client_id = my_client_id())
)
WITH CHECK (
  is_admin()
  OR current_app_role() = 'team'::app_role
  OR (current_app_role() = 'client'::app_role AND client_id = my_client_id())
);

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated
USING (
  is_admin()
  OR current_app_role() = 'team'::app_role
  OR (current_app_role() = 'client'::app_role AND client_id = my_client_id())
);