-- =============================================================================
-- Tramo 2 — la semana
-- =============================================================================
-- Los eventos son de FECHA, no de día de la semana. Esa es la diferencia con
-- availability_slots: aquellos son lo fijo que se repite todas las semanas
-- (facultad, trabajo, el entrenamiento con su club) y estos son lo que el
-- entrenador planifica para un día concreto.
--
-- Un partido es un evento, no una franja fija: se juega un sábado puntual.
-- =============================================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes(id) on delete cascade,
  date        date not null,
  start_time  time,
  end_time    time,
  type        text not null default 'gym'
              check (type in ('match','team_training','gym','field','recovery','meal','travel','rest','other')),
  title       text,
  notes       text,
  location    text,
  status      text not null default 'planned'
              check (status in ('planned','done','skipped')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Si hay dos horas, la de fin va después. Un evento sin hora es válido:
  -- «descanso» o «comida libre» no necesitan horario.
  check (start_time is null or end_time is null or end_time > start_time)
);

create index if not exists events_athlete_date_idx on public.events(athlete_id, date);
create index if not exists events_date_idx         on public.events(date);

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Reglas de acceso — las dos puertas de siempre
-- =============================================================================
alter table public.events enable row level security;

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

-- Por ahora solo el entrenador planifica. Cuando llegue el ida y vuelta, el
-- atleta va a poder marcar el estado de SUS eventos, no crearlos.
drop policy if exists events_write_coach on public.events;
create policy events_write_coach on public.events
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

-- =============================================================================
-- Copiar una semana a otra
-- =============================================================================
-- Se eligió copiar en vez de repetición automática: un sistema de eventos
-- recurrentes se convierte enseguida en un problema de excepciones («esta
-- semana el martes no»), y copiar cubre casi todos los casos reales.
--
-- Va en la base y no en el navegador porque son muchas filas de una: si se
-- cortara la red a mitad de camino, la semana quedaría copiada por la mitad.
create or replace function public.copy_week(
  p_athlete_id uuid,
  p_from       date,     -- lunes de la semana que se copia
  p_to         date,     -- lunes de la semana destino
  p_replace    boolean default false
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ws    uuid;
  v_shift int;
  v_count int;
begin
  select workspace_id into v_ws from public.athletes where id = p_athlete_id;
  if v_ws is null then raise exception 'athlete_not_found'; end if;
  if not public.is_workspace_member(v_ws) then raise exception 'not_allowed'; end if;
  if p_from = p_to then raise exception 'same_week'; end if;

  v_shift := p_to - p_from;

  if p_replace then
    delete from public.events
     where athlete_id = p_athlete_id
       and date >= p_to and date < p_to + 7;
  end if;

  insert into public.events (athlete_id, date, start_time, end_time, type, title, notes, location, created_by)
  select athlete_id, date + v_shift, start_time, end_time, type, title, notes, location, auth.uid()
    from public.events
   where athlete_id = p_athlete_id
     and date >= p_from and date < p_from + 7;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.copy_week(uuid, date, date, boolean) from public;
grant execute on function public.copy_week(uuid, date, date, boolean) to authenticated;
