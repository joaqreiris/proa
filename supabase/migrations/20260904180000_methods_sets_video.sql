-- =============================================================================
-- Métodos combinados, series por fila, lado y videos
-- =============================================================================

-- ── El MÉTODO es otra cosa que la SECCIÓN ───────────────────────────────────
-- Estaban mezclados: «circuito» convivía con «principal» y «accesorios», que no
-- son lo mismo. La sección dice DÓNDE va el bloque dentro de la sesión; el
-- método dice CÓMO se relacionan los ejercicios de adentro.
-- Un contraste francés es un bloque principal CON método de contraste: pesado →
-- pliométrico → con carga → asistido, repetido N rondas.
alter table public.session_blocks add column if not exists method text;
alter table public.session_blocks add column if not exists rest_s int;   -- entre rondas

update public.session_blocks set method = 'circuit' where kind = 'circuit' and method is null;
update public.session_blocks set kind   = 'main'    where kind = 'circuit';
update public.session_blocks set method = 'single'  where method is null;

alter table public.session_blocks alter column method set default 'single';
alter table public.session_blocks alter column method set not null;

alter table public.session_blocks drop constraint if exists session_blocks_method_check;
alter table public.session_blocks add constraint session_blocks_method_check
  check (method in ('single','superset','complex','contrast','circuit','emom','amrap','cluster'));

alter table public.session_blocks drop constraint if exists session_blocks_kind_check;
alter table public.session_blocks add constraint session_blocks_kind_check
  check (kind in ('warmup','main','accessory','cooldown'));

-- ── Lado y modo por ejercicio ───────────────────────────────────────────────
-- El trabajo unilateral necesita decir de qué lado, y prescribir repeticiones
-- no es lo mismo que prescribir segundos.
alter table public.session_items add column if not exists side text;
alter table public.session_items add column if not exists mode text;

alter table public.session_items drop constraint if exists session_items_side_check;
alter table public.session_items add constraint session_items_side_check
  check (side is null or side in ('both','left','right','alt'));

alter table public.session_items drop constraint if exists session_items_mode_check;
alter table public.session_items add constraint session_items_mode_check
  check (mode is null or mode in ('reps','time','distance'));

-- ── Series con valores distintos ────────────────────────────────────────────
-- Lo normal es «4 x 6 al 80 por ciento», y para eso alcanzan sets/reps/load del
-- propio ejercicio. Pero una progresión real suele ser 1x8@70, 1x6@80, 2x4@85.
-- Cuando hay filas acá, mandan ellas; si no hay, manda la prescripción pareja.
-- Dos formas de decir lo mismo sería un problema; una simple y una detallada,
-- con precedencia clara, es lo que se usa de verdad.
create table if not exists public.session_sets (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.session_items(id) on delete cascade,
  position   int  not null default 0,
  reps       text,
  load       text,
  rest_s     int,
  tempo      text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists session_sets_item_idx on public.session_sets(item_id, position);

alter table public.session_sets enable row level security;

drop policy if exists sets_select on public.session_sets;
create policy sets_select on public.session_sets
  for select using (
    exists (select 1 from public.session_items i
              join public.session_blocks b on b.id = i.block_id
             where i.id = item_id and public.can_see_event(b.event_id))
  );

drop policy if exists sets_write on public.session_sets;
create policy sets_write on public.session_sets
  for all using (
    exists (select 1 from public.session_items i
              join public.session_blocks b on b.id = i.block_id
             where i.id = item_id and public.can_edit_event(b.event_id))
  ) with check (
    exists (select 1 from public.session_items i
              join public.session_blocks b on b.id = i.block_id
             where i.id = item_id and public.can_edit_event(b.event_id))
  );

-- Videos del catálogo. El atleta entrena solo: sin ver cómo se hace, la
-- mitad de la prescripción se pierde. 61 de los 120 tienen video.
update public.exercises set video_url = 'https://www.youtube.com/watch?v=_2WxsATAgq0' where key = '90_90_hip_switch' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/6qSYlrN4XO4' where key = 'a_skip' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/kISuoI7QCYk' where key = 'ab_wheel_rollout' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/cAkg6YNh-mU' where key = 'airplane_single_leg' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/7jOwuwNk8OM' where key = 'ankle_dorsiflexion_rock' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/z6kvxJFkth8' where key = 'atg_split_squat' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/aViZ2grILmk' where key = 'b_skip' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/D7n4RPns6ec' where key = 'back_squat' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/5jgUBrI-CpM' where key = 'banded_ankle_mobilization' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/7DqYesMRkzU' where key = 'banded_external_rotation' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/3tHXjTlKX0g' where key = 'banded_lateral_walk' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/SuvO4TBwSu4' where key = 'banded_pull_apart' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/Nqh7q3zDCoQ' where key = 'barbell_row' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/JwepS5QiAzs' where key = 'battle_ropes' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/iuR17xUXLeA' where key = 'bear_crawl' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/_FkbD0FhgVE' where key = 'bench_press' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/jN3HeMMvB5o' where key = 'bike_intervals' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/HXVioQc2Z44' where key = 'bike_steady_state' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/Tjo5oYHoS8M' where key = 'bird_dog' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/Fwhb31CT-CM' where key = 'bosu_squat' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/7EfeTsHZ5vk' where key = 'box_jump' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/v0yrBWA3eEs' where key = 'broad_jump' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/VLyt8xraMLA' where key = 'bulgarian_split_squat' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/8OZImYISmSg' where key = 'cable_woodchop' and workspace_id is null;
update public.exercises set video_url = 'https://youtu.be/llFEJinfIgY' where key = 'calf_raise_bent_knee_soleus' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/wlqTemUXPXY' where key = 'calf_raise_straight_knee' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/KxliHPOmsTY' where key = 'calf_stretch_wall' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/aHZ2O2lM8Zs' where key = 'cat_camel' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/PAbO12_3Ouw' where key = 'child_s_pose' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/us39nzaFu9Q' where key = 'clamshell' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/yz4KXzZHAE8' where key = 'clean_pull' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/xNwpvDuZJ3k' where key = 'conventional_deadlift' and workspace_id is null;
update public.exercises set video_url = 'https://www.youtube.com/watch?v=PnFJIqzJ0j8' where key = 'copenhagen_plank' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/TIJu5aWPke0' where key = 'couch_stretch' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/zWeR8sNZEF8' where key = 'countermovement_jump' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/DqLL45uk2Tk' where key = 'dead_bug' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/oHeuENnePzo' where key = 'deep_squat_hold_prying' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/V2e-wz6AIhk' where key = 'depth_jump' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/AmBLhzLX2KE' where key = 'diaphragmatic_breathing' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/UMCRjkiOjWs' where key = 'drop_stick_landing' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/epgJdM2muzI' where key = 'eccentric_heel_drop' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/qdEf876Esn0' where key = 'flying_sprint_max_velocity' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/Sr9RWVMzyi8' where key = 'foam_roll_it_band_glutes' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/KibUgcGXMTY' where key = 'foam_roll_quads' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/_uBAvfZobXw' where key = 'front_plank' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/7ricdrto2gs' where key = 'front_squat' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/mSuDY5J0Fwo' where key = 'glute_bridge' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/yTDROg8zZsU' where key = 'goblet_squat' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/vWg6217Wsqc' where key = 'hamstring_slider_curl' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/_q0dkHb89us' where key = 'hang_power_clean' and workspace_id is null;
update public.exercises set video_url = 'https://youtu.be/z1j2QMBJF6c' where key = 'hang_power_snatch' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/menMCCf0PbE' where key = 'hanging_leg_raise' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/ekTIuX4TkiY' where key = 'hip_flexor_rock_back' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/7lGIfjasuNo' where key = 'hip_flexor_stretch' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/CvuVYMFd11g' where key = 'hip_thrust' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/YHBp6fvXYcI' where key = 'hollow_hold' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/MRieBuzWWG8' where key = 'hurdle_hops' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/G1mCi5idEbk' where key = 'incline_dumbbell_press' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/36jLkEgquKs' where key = 'incline_treadmill_walk' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/xQb9Tc3iQpI' where key = 'kettlebell_clean' and workspace_id is null;
update public.exercises set video_url = 'https://youtube.com/shorts/fXpsPyo-vlw' where key = 'ladder_quick_feet' and workspace_id is null;

-- ── Copiar la semana se lleva también las series detalladas ─────────────────
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
    insert into public.events (athlete_id, date, start_time, end_time, type, title, notes, location, created_by)
    values (r.athlete_id, r.date + v_shift, r.start_time, r.end_time, r.type, r.title, r.notes, r.location, auth.uid())
    returning id into v_new;
    v_count := v_count + 1;

    for b in select * from public.session_blocks where event_id = r.id order by position loop
      insert into public.session_blocks (event_id, position, title, kind, method, rounds, rest_s, notes)
      values (v_new, b.position, b.title, b.kind, b.method, b.rounds, b.rest_s, b.notes)
      returning id into v_blk;

      for i in select * from public.session_items where block_id = b.id order by position loop
        insert into public.session_items (block_id, position, exercise_id, name, sets, reps, load, rest_s, tempo, side, mode, notes)
        values (v_blk, i.position, i.exercise_id, i.name, i.sets, i.reps, i.load, i.rest_s, i.tempo, i.side, i.mode, i.notes)
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
