-- El catálogo propio del entrenador también lo lee su atleta.
--
-- «Cada tabla tiene DOS puertas»: el entrenador ve lo de su espacio, el atleta
-- ve lo suyo. En `foods` solo estaba declarada la primera, y el síntoma no es
-- un error sino algo peor — el menú del atleta se veía, pero un alimento que
-- el entrenador había creado en su propio catálogo llegaba sin unidad: «2» en
-- vez de «2 huevos». Los macros nunca dependieron de esto (se guardan en
-- meal_items), así que la falta se disimulaba.
--
-- La función va en SECURITY DEFINER por lo de siempre: si la policy consultara
-- `athletes` directamente, se evaluarían las policies de `athletes` dentro de
-- las de `foods`, y eso es una cadena que no hace falta pagar en cada fila.

create or replace function public.my_athlete_workspaces()
returns setof uuid language sql security definer stable set search_path = public as $$
  select distinct a.workspace_id
    from public.athletes a
   where a.id in (select public.my_athlete_ids());
$$;

drop policy if exists foods_select on public.foods;
create policy foods_select on public.foods
  for select using (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
    or workspace_id in (select public.my_athlete_workspaces())
  );
