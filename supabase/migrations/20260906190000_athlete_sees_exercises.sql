-- ── El atleta tiene que poder ver el video del ejercicio ───────────────────
--
-- Los ejercicios que crea un entrenador quedan con su `workspace_id`, y el
-- atleta no es miembro del espacio de trabajo: es del otro lado del mostrador.
-- Con la regla anterior podía leer el catálogo general de Proa pero no los
-- ejercicios que su propio entrenador había creado — o sea que justo los que
-- llevan la explicación en video de la casa se le veían sin video, en silencio
-- y sin ningún error.
--
-- Se le abre la lectura del catálogo de SU espacio. No es una filtración: un
-- ejercicio es un nombre, una categoría y un video. No hay nada de los demás
-- atletas ahí adentro.

drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select using (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
    or exists (
      select 1 from public.athletes a
       where a.workspace_id = exercises.workspace_id
         and a.id in (select public.my_athlete_ids()))
  );
