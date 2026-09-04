-- copy_week, con las columnas nombradas una por una.
--
-- El intento anterior clonaba la fila entera para que una columna nueva viajara
-- sola. No se puede: `au` es una columna calculada y Postgres rechaza cualquier
-- inserción sobre ella, aunque el valor sea el correcto.
--
-- Así que vuelve la lista explícita. AL AGREGAR UNA COLUMNA A ESTAS TABLAS HAY
-- QUE AGREGARLA ACÁ. El guardián no es la astucia sino la prueba: el test de
-- copiar semana compara campo por campo y falla si alguno se queda atrás.
create or replace function public.copy_week(
  p_athlete_id uuid, p_from date, p_to date, p_replace boolean default false
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid; v_shift int; v_count int := 0;
  r record; b record; i record;
  v_new uuid; v_blk uuid; v_item uuid;
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

  for r in select * from public.events
            where athlete_id = p_athlete_id and date >= p_from and date < p_from + 7
            order by date, start_time loop

    -- El estado NO se copia: una semana nueva arranca planificada, aunque la
    -- original ya estuviera hecha.
    insert into public.events
      (athlete_id, date, start_time, end_time, type, title, notes, location, status, created_by)
    values
      (r.athlete_id, r.date + v_shift, r.start_time, r.end_time, r.type, r.title,
       r.notes, r.location, 'planned', auth.uid())
    returning id into v_new;
    v_count := v_count + 1;

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
  end loop;

  return v_count;
end;
$$;

revoke all on function public.copy_week(uuid, date, date, boolean) from public;
grant execute on function public.copy_week(uuid, date, date, boolean) to authenticated;
