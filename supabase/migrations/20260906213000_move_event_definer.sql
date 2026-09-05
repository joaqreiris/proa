-- ── move_event tiene que ser SECURITY DEFINER ──────────────────────────────
--
-- La primera versión era SECURITY INVOKER, que es lo que hay que preferir
-- siempre: corre con los permisos de quien llama y el RLS hace el trabajo.
-- Pero copiar un bloque llama a `clone_event`, y a `clone_event` le sacamos el
-- permiso a `authenticated` a propósito, porque se salta el RLS. Una función
-- invoker corre con los permisos del que llama, así que no la podía ejecutar:
-- mover andaba y copiar fallaba con «permiso denegado».
--
-- O sea: la función necesita un permiso que quien la llama NO tiene. Ese es
-- exactamente el caso en el que corresponde SECURITY DEFINER — y, con él, la
-- obligación de comprobar los permisos a mano, porque el RLS deja de opinar.
--
-- Se comprueba una sola cosa, la que importa: que el bloque sea de un atleta
-- que yo pueda editar. El día y la hora no necesitan permiso; el bloque sí.

create or replace function public.move_event(
  p_event uuid,
  p_date  date,
  p_start time default null,
  p_end   time default null,
  p_copy  boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_athlete uuid;
begin
  if p_start is not null and p_end is not null and p_end <= p_start then
    raise exception 'la hora de fin tiene que ser posterior a la de inicio';
  end if;

  -- El candado. Sin RLS que lo haga por nosotros, se pregunta de frente.
  if not public.can_edit_event(p_event) then
    raise exception 'ese bloque no es tuyo';
  end if;

  select athlete_id into v_athlete from public.events where id = p_event;
  if v_athlete is null then raise exception 'event_not_found'; end if;

  v_id := case when p_copy then public.clone_event(p_event, v_athlete, p_date) else p_event end;

  update public.events
     set date = p_date, start_time = p_start, end_time = p_end
   where id = v_id;

  return v_id;
end $$;

revoke all on function public.move_event(uuid, date, time, time, boolean) from public, anon;
grant execute on function public.move_event(uuid, date, time, time, boolean) to authenticated;
