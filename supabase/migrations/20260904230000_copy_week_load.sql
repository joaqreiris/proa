-- copy_week no copiaba duration_min ni rpe: se agregaron a session_blocks
-- DESPUÉS de escribir la función y no se actualizó la lista de columnas.
-- Copiar una semana perdía toda la carga sin avisar, que es peor que fallar.
--
-- Para que no vuelva a pasar: la inserción no enumera columna por columna.
-- Se clona la fila entera y solo se pisa lo que tiene que cambiar. Así una
-- columna nueva viaja sola.
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

    -- Clonar la fila entera y pisar solo id, fecha y autor.
    insert into public.events
    select (jsonb_populate_record(null::public.events,
             to_jsonb(r) || jsonb_build_object(
               'id', gen_random_uuid(),
               'date', (r.date + v_shift),
               'created_by', auth.uid(),
               'created_at', now(),
               'updated_at', now()
             ))).*
    returning id into v_new;
    v_count := v_count + 1;

    for b in select * from public.session_blocks where event_id = r.id order by position loop
      -- au es una columna generada: no se puede insertar, hay que sacarla.
      insert into public.session_blocks
      select (jsonb_populate_record(null::public.session_blocks,
               (to_jsonb(b) - 'au') || jsonb_build_object(
                 'id', gen_random_uuid(), 'event_id', v_new, 'created_at', now()
               ))).*
      returning id into v_blk;

      for i in select * from public.session_items where block_id = b.id order by position loop
        insert into public.session_items
        select (jsonb_populate_record(null::public.session_items,
                 to_jsonb(i) || jsonb_build_object(
                   'id', gen_random_uuid(), 'block_id', v_blk, 'created_at', now()
                 ))).*
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
