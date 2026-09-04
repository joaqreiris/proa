-- =============================================================================
-- clone_event: cerrarla de verdad
-- =============================================================================
-- Un `revoke all ... from public` NO alcanza en Supabase: al rol `authenticated`
-- se le conceden los permisos sobre las funciones del esquema por separado, así
-- que la función quedaba llamable desde el navegador — y sin comprobar nada,
-- porque las comprobaciones estaban en las funciones de arriba.
--
-- Resultado: se podía clonar un evento al atleta de OTRO entrenador.
--
-- Dos arreglos, y hacen falta los dos:
--   1. Quitar el permiso a los roles concretos, no solo a «public».
--   2. Comprobar los permisos DENTRO de clone_event. Confiar en que nadie la
--      llame de frente es confiar en una puerta sin cerradura.

create or replace function public.clone_event(
  p_event   uuid,
  p_athlete uuid,
  p_date    date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r record; b record; i record;
  v_new uuid; v_blk uuid; v_item uuid; v_ws uuid;
begin
  -- Poder leer y editar el evento de origen.
  if not public.can_edit_event(p_event) then raise exception 'not_allowed'; end if;

  -- Y ser del espacio de trabajo del atleta de destino.
  select workspace_id into v_ws from public.athletes where id = p_athlete;
  if v_ws is null or not public.is_workspace_member(v_ws) then
    raise exception 'not_allowed';
  end if;

  select * into r from public.events where id = p_event;
  if r.id is null then raise exception 'event_not_found'; end if;

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

revoke all on function public.clone_event(uuid, uuid, date) from public, anon, authenticated;
