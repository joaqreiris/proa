-- =============================================================================
-- Recuperación
-- =============================================================================
-- No son bloques de ejercicios: son MÉTODOS con sus parámetros. Un baño de
-- contraste tiene ciclos y temperaturas; unas botas compresivas, presión y
-- minutos; la crioterapia, tres minutos a menos ciento diez grados. Meterlos en
-- la estructura de series y repeticiones sería forzarlos.
--
-- Se resuelve dentro de la semana, en un modal: son dos o tres datos y no
-- justifican salir de la pantalla.

create table if not exists public.recovery_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  position   int  not null default 0,
  method     text not null
             check (method in ('mobility','stretching','foam_roll','massage','physio',
                               'contrast','cold','sauna','cryo','compression',
                               'electro','active','breathing','nap')),
  duration_min int,
  -- Parámetros que solo tienen sentido en algunos métodos. Cada uno declara
  -- cuáles muestra; el resto quedan nulos.
  temp_c       numeric(4,1),   -- sauna, frío, contraste, crioterapia
  temp_hot_c   numeric(4,1),   -- solo el contraste, que tiene dos
  cycles       int,            -- contraste
  pressure     text,           -- botas: «60 mmHg», «nivel 4»
  notes        text,
  created_at   timestamptz not null default now(),
  check (duration_min is null or duration_min between 0 and 300),
  check (cycles is null or cycles between 1 and 20)
);
create index if not exists recovery_items_event_idx on public.recovery_items(event_id, position);

alter table public.recovery_items enable row level security;

drop policy if exists recovery_select on public.recovery_items;
create policy recovery_select on public.recovery_items
  for select using (public.can_see_event(event_id));

drop policy if exists recovery_write on public.recovery_items;
create policy recovery_write on public.recovery_items
  for all using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

-- ── Copiar la semana se lleva también la recuperación ───────────────────────
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

    insert into public.meal_items
      (event_id, position, food_id, name, qty_g, qty_text, kcal, protein_g, carbs_g, fats_g, fiber_g, notes)
    select v_new, position, food_id, name, qty_g, qty_text, kcal, protein_g, carbs_g, fats_g, fiber_g, notes
      from public.meal_items where event_id = r.id order by position;

    insert into public.recovery_items
      (event_id, position, method, duration_min, temp_c, temp_hot_c, cycles, pressure, notes)
    select v_new, position, method, duration_min, temp_c, temp_hot_c, cycles, pressure, notes
      from public.recovery_items where event_id = r.id order by position;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.copy_week(uuid, date, date, boolean) from public;
grant execute on function public.copy_week(uuid, date, date, boolean) to authenticated;
