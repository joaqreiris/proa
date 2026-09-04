-- =============================================================================
-- Clonar: una sola función que sabe copiar un evento con todo lo que cuelga
-- =============================================================================
-- Copiar una semana, copiar un día y aplicar una sesión a varios atletas hacen
-- exactamente lo mismo sobre distintos conjuntos. Si cada una enumerara las
-- columnas, serían tres lugares donde olvidarse de una — y ya pasó: copy_week
-- perdió la duración y el RPE en silencio.
--
-- Ahora la lista de columnas vive UNA sola vez, acá.

create or replace function public.clone_event(
  p_event   uuid,
  p_athlete uuid,
  p_date    date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r record; b record; i record;
  v_new uuid; v_blk uuid; v_item uuid;
begin
  select * into r from public.events where id = p_event;
  if r.id is null then raise exception 'event_not_found'; end if;

  -- El estado no se copia: lo clonado arranca planificado aunque el original
  -- ya estuviera hecho.
  insert into public.events
    (athlete_id, date, start_time, end_time, type, title, notes, location, status, created_by)
  values
    (p_athlete, p_date, r.start_time, r.end_time, r.type, r.title,
     r.notes, r.location, 'planned', auth.uid())
  returning id into v_new;

  for b in select * from public.session_blocks where event_id = r.id order by position loop
    insert into public.session_blocks
      (event_id, position, title, kind, method, rounds, rest_s, duration_min, rpe, notes)
    values
      (v_new, b.position, b.title, b.kind, b.method, b.rounds, b.rest_s,
       b.duration_min, b.rpe, b.notes)
    returning id into v_blk;

    for i in select * from public.session_items where block_id = b.id order by position loop
      insert into public.session_items
        (block_id, position, exercise_id, name, sets, reps, load, rest_s, tempo, side, mode, notes)
      values
        (v_blk, i.position, i.exercise_id, i.name, i.sets, i.reps, i.load,
         i.rest_s, i.tempo, i.side, i.mode, i.notes)
      returning id into v_item;

      insert into public.session_sets (item_id, position, reps, load, rest_s, tempo, note)
      select v_item, position, reps, load, rest_s, tempo, note
        from public.session_sets where item_id = i.id order by position;
    end loop;
  end loop;

  insert into public.meal_items
    (event_id, position, food_id, name, qty_g, qty_text, kcal, protein_g, carbs_g, fats_g, fiber_g, notes)
  select v_new, position, food_id, name, qty_g, qty_text, kcal, protein_g, carbs_g, fats_g, fiber_g, notes
    from public.meal_items where event_id = r.id order by position;

  insert into public.recovery_items
    (event_id, position, method, duration_min, temp_c, temp_hot_c, cycles, pressure, notes)
  select v_new, position, method, duration_min, temp_c, temp_hot_c, cycles, pressure, notes
    from public.recovery_items where event_id = r.id order by position;

  return v_new;
end;
$$;

-- ── Copiar una semana ───────────────────────────────────────────────────────
create or replace function public.copy_week(
  p_athlete_id uuid, p_from date, p_to date, p_replace boolean default false
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid; v_shift int; v_count int := 0; r record;
begin
  select workspace_id into v_ws from public.athletes where id = p_athlete_id;
  if v_ws is null then raise exception 'athlete_not_found'; end if;
  if not public.is_workspace_member(v_ws) then raise exception 'not_allowed'; end if;
  if p_from = p_to then raise exception 'same_week'; end if;

  v_shift := p_to - p_from;

  if p_replace then
    delete from public.events
     where athlete_id = p_athlete_id and date >= p_to and date < p_to + 7;
  end if;

  for r in select id, date from public.events
            where athlete_id = p_athlete_id and date >= p_from and date < p_from + 7
            order by date, start_time loop
    perform public.clone_event(r.id, p_athlete_id, r.date + v_shift);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── Copiar un día a otro ────────────────────────────────────────────────────
-- Martes y jueves suelen ser el mismo trabajo. Rehacerlo a mano es el tipo de
-- tarea que hace que un entrenador vuelva a la planilla de siempre.
create or replace function public.copy_day(
  p_athlete_id uuid, p_from date, p_to date, p_replace boolean default false
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid; v_count int := 0; r record;
begin
  select workspace_id into v_ws from public.athletes where id = p_athlete_id;
  if v_ws is null then raise exception 'athlete_not_found'; end if;
  if not public.is_workspace_member(v_ws) then raise exception 'not_allowed'; end if;
  if p_from = p_to then raise exception 'same_day'; end if;

  if p_replace then
    delete from public.events where athlete_id = p_athlete_id and date = p_to;
  end if;

  for r in select id from public.events
            where athlete_id = p_athlete_id and date = p_from
            order by start_time loop
    perform public.clone_event(r.id, p_athlete_id, p_to);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── Aplicar una sesión a varios atletas ─────────────────────────────────────
-- Un preparador con ocho jugadores les da a varios el mismo trabajo de fuerza.
-- Cargarlo ocho veces es el trabajo que esta app existe para sacar.
create or replace function public.copy_event_to_athletes(
  p_event uuid, p_athletes uuid[], p_date date default null
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_src_ws uuid; v_date date; v_count int := 0; a uuid; v_ws uuid;
begin
  select ath.workspace_id, e.date into v_src_ws, v_date
    from public.events e join public.athletes ath on ath.id = e.athlete_id
   where e.id = p_event;
  if v_src_ws is null then raise exception 'event_not_found'; end if;
  if not public.is_workspace_member(v_src_ws) then raise exception 'not_allowed'; end if;

  if p_date is not null then v_date := p_date; end if;

  foreach a in array p_athletes loop
    select workspace_id into v_ws from public.athletes where id = a;
    -- Nunca a un atleta de otro espacio de trabajo, aunque llegue el id.
    if v_ws is null or v_ws <> v_src_ws then
      raise exception 'athlete_not_in_workspace';
    end if;
    perform public.clone_event(p_event, a, v_date);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── Los ejercicios que más usa este entrenador ──────────────────────────────
-- El buscador arranca mostrando lo de siempre: un preparador vuelve una y otra
-- vez sobre los mismos veinte ejercicios.
create or replace function public.my_top_exercises(p_limit int default 20)
returns table (exercise_id uuid, uses bigint)
language sql security definer stable set search_path = public as $$
  select i.exercise_id, count(*) as uses
    from public.session_items i
    join public.session_blocks b on b.id = i.block_id
    join public.events e         on e.id = b.event_id
    join public.athletes a       on a.id = e.athlete_id
   where i.exercise_id is not null
     and public.is_workspace_member(a.workspace_id)
   group by i.exercise_id
   order by uses desc
   limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.clone_event(uuid, uuid, date)                      from public;
revoke all on function public.copy_week(uuid, date, date, boolean)               from public;
revoke all on function public.copy_day(uuid, date, date, boolean)                from public;
revoke all on function public.copy_event_to_athletes(uuid, uuid[], date)         from public;
revoke all on function public.my_top_exercises(int)                              from public;

-- clone_event no se expone: siempre se llama desde una de las de arriba, que
-- son las que verifican los permisos.
grant execute on function public.copy_week(uuid, date, date, boolean)       to authenticated;
grant execute on function public.copy_day(uuid, date, date, boolean)        to authenticated;
grant execute on function public.copy_event_to_athletes(uuid, uuid[], date) to authenticated;
grant execute on function public.my_top_exercises(int)                      to authenticated;
