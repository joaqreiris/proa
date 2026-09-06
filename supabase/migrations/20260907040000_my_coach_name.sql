-- ── El nombre del entrenador, para el atleta ───────────────────────────────
--
-- El atleta veía el nombre del ESPACIO DE TRABAJO arriba de su ficha y de su
-- semana. Pero el espacio se llama como el entrenador quiso, y muchas veces se
-- llama como el club donde juega el atleta: entonces su propia ficha parecía
-- del club, cuando en Proa no hay institución, hay una persona entrenando a
-- otra.
--
-- No alcanza con leer profiles: la política deja ver ÚNICAMENTE el perfil
-- propio, y está bien que así sea. Por eso una función definer que devuelve una
-- sola cosa, el nombre, y nada más: ni el correo, ni el id, ni la foto.
--
-- Si el entrenador no tiene nombre cargado, queda el del espacio, que es lo
-- único que se puede decir sin inventar.
create or replace function public.my_coach_name()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(nullif(trim(p.full_name), ''), w.name)
    from public.athlete_accounts aa
    join public.athletes   a on a.id = aa.athlete_id
    join public.workspaces w on w.id = a.workspace_id
    left join public.profiles p on p.id = w.owner_id
   where aa.user_id = auth.uid()
   limit 1;
$$;

revoke all on function public.my_coach_name() from public, anon;
grant execute on function public.my_coach_name() to authenticated;
