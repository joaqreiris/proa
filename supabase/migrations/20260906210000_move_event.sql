-- ── Mover o copiar un bloque a otro hueco ──────────────────────────────────
--
-- Arrastrar un bloque en la semana cambia dos cosas a la vez: el día y la
-- hora. Y con Option apretado no lo mueve: lo copia, con todo su contenido.
--
-- Podría hacerse desde la pantalla con dos llamadas —clonar y después
-- corregirle la hora— pero entonces un corte en el medio dejaría una copia
-- a la hora del original, en el día equivocado, sin que nadie se entere.
-- Acá es una sola operación: sale entera o no sale.
--
-- Devuelve el id del bloque que quedó en el destino: el mismo si se movió, el
-- nuevo si se copió. La pantalla lo usa para dejarlo seleccionado.

create or replace function public.move_event(
  p_event uuid,
  p_date  date,
  p_start time default null,
  p_end   time default null,
  p_copy  boolean default false
) returns uuid
language plpgsql
security invoker              -- manda el RLS de events, como con cualquier edición
set search_path = public
as $$
declare v_id uuid; v_athlete uuid;
begin
  if p_start is not null and p_end is not null and p_end <= p_start then
    raise exception 'la hora de fin tiene que ser posterior a la de inicio';
  end if;

  if p_copy then
    -- clone_event ya sabe copiar el evento entero con sus bloques, ejercicios
    -- y series. Se le pide la copia en el día nuevo y después se le ajusta la
    -- hora, todo dentro de la misma transacción.
    select athlete_id into v_athlete from public.events where id = p_event;
    if v_athlete is null then raise exception 'event_not_found'; end if;
    v_id := public.clone_event(p_event, v_athlete, p_date);
  else
    v_id := p_event;
  end if;

  update public.events
     set date = p_date, start_time = p_start, end_time = p_end
   where id = v_id;

  if not found then raise exception 'no se pudo mover ese bloque'; end if;
  return v_id;
end $$;

revoke all on function public.move_event(uuid, date, time, time, boolean) from public, anon;
grant execute on function public.move_event(uuid, date, time, time, boolean) to authenticated;

comment on function public.move_event(uuid, date, time, time, boolean) is
  'Mueve (o copia) un bloque a otro día y hora en una sola operación.';
