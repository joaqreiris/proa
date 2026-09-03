-- =============================================================================
-- Tramo 1 — el atleta y su cuenta
-- =============================================================================
-- Tres tablas nuevas (invitaciones, anamnesis, grilla de horarios) y tres
-- funciones que hacen el trabajo delicado del alta del atleta.
--
-- Por qué funciones y no consultas sueltas desde el navegador: la pantalla que
-- abre el atleta con el enlace de invitación NO tiene sesión todavía, así que
-- necesita leer «quién te invitó» sin poder leer nada más. Eso no se puede
-- expresar en una regla de acceso sin abrir la tabla entera. Una función en
-- SECURITY DEFINER devuelve exactamente los dos datos que la pantalla muestra.
-- =============================================================================

-- ── Invitaciones ─────────────────────────────────────────────────────────────
create table if not exists public.athlete_invites (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes(id) on delete cascade,
  token       text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create index if not exists athlete_invites_athlete_idx on public.athlete_invites(athlete_id);
create index if not exists athlete_invites_token_idx   on public.athlete_invites(token);

-- ── Anamnesis ────────────────────────────────────────────────────────────────
-- Una fila por atleta. Es lo que hace que el calendario sea inteligente: sin
-- esto, Proa es una agenda más.
create table if not exists public.athlete_intake (
  athlete_id        uuid primary key references public.athletes(id) on delete cascade,

  -- Objetivo y contexto
  main_goal         text check (main_goal in ('performance','return','body','health','other')),
  goals             text,
  injury_history    text,
  current_issues    text,

  -- Hábitos
  sleep_hours       numeric(3,1),
  sleep_quality     int check (sleep_quality between 1 and 5),
  diet_notes        text,
  supplements       text,

  -- Entrenamiento
  training_years    numeric(4,1),
  gym_access        text check (gym_access in ('full','basic','home','none')),
  equipment         text,
  sessions_per_week int check (sessions_per_week between 0 and 21),

  -- Medidas de partida
  height_cm         numeric(5,1),
  weight_kg         numeric(5,1),

  notes             text,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists athlete_intake_touch on public.athlete_intake;
create trigger athlete_intake_touch before update on public.athlete_intake
  for each row execute function public.touch_updated_at();

-- ── Grilla de horarios fijos ────────────────────────────────────────────────
-- Lo que ya ocupa la semana del atleta y el entrenador no controla: estudio,
-- trabajo, el entrenamiento con su club. De acá salen los huecos donde de
-- verdad se puede meter carga.
create table if not exists public.availability_slots (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  weekday    int  not null check (weekday between 0 and 6),   -- 0 = lunes
  start_time time not null,
  end_time   time not null,
  kind       text not null default 'commitment'
             check (kind in ('commitment','team_training','match','unavailable')),
  label      text,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists availability_slots_athlete_idx on public.availability_slots(athlete_id, weekday);

-- =============================================================================
-- Reglas de acceso — las dos puertas de siempre
-- =============================================================================

alter table public.athlete_invites    enable row level security;
alter table public.athlete_intake     enable row level security;
alter table public.availability_slots enable row level security;

-- Invitaciones: solo el entrenador. El atleta nunca las lee directo — pasa por
-- las funciones de abajo.
drop policy if exists invites_coach_all on public.athlete_invites;
create policy invites_coach_all on public.athlete_invites
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

-- Anamnesis: el entrenador la escribe, el atleta puede leer la suya.
drop policy if exists intake_select on public.athlete_intake;
create policy intake_select on public.athlete_intake
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

drop policy if exists intake_write_coach on public.athlete_intake;
create policy intake_write_coach on public.athlete_intake
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

-- Horarios fijos: igual.
drop policy if exists slots_select on public.availability_slots;
create policy slots_select on public.availability_slots
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

drop policy if exists slots_write_coach on public.availability_slots;
create policy slots_write_coach on public.availability_slots
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

-- =============================================================================
-- Funciones del alta del atleta
-- =============================================================================

-- 1. El entrenador genera (o regenera) el enlace de su atleta.
--    Regenerar invalida el anterior: si un enlace se filtró, se pide otro.
create or replace function public.create_athlete_invite(p_athlete_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ws    uuid;
  v_token text;
begin
  select workspace_id into v_ws from public.athletes where id = p_athlete_id;
  if v_ws is null then
    raise exception 'athlete_not_found';
  end if;
  if not public.is_workspace_member(v_ws) then
    raise exception 'not_allowed';
  end if;
  if exists (select 1 from public.athlete_accounts where athlete_id = p_athlete_id) then
    raise exception 'already_linked';
  end if;

  delete from public.athlete_invites
   where athlete_id = p_athlete_id and accepted_at is null;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.athlete_invites (athlete_id, token, created_by)
  values (p_athlete_id, v_token, auth.uid());

  return v_token;
end;
$$;

-- 2. La pantalla del enlace, SIN sesión. Devuelve lo justo para que el atleta
--    sepa que la invitación es real: quién lo invita y su propio nombre. Nada
--    más: ni identificadores, ni correo, ni el resto del plantel.
create or replace function public.invite_preview(p_token text)
returns json language plpgsql security definer stable set search_path = public as $$
declare
  v json;
begin
  select json_build_object(
           'athlete_name', a.first_name,
           'workspace',    w.name,
           'accent',       w.accent,
           'status',       case
                             when i.accepted_at is not null then 'accepted'
                             when i.expires_at < now()      then 'expired'
                             else 'ok'
                           end
         )
    into v
    from public.athlete_invites i
    join public.athletes   a on a.id = i.athlete_id
    join public.workspaces w on w.id = a.workspace_id
   where i.token = p_token;

  if v is null then
    return json_build_object('status', 'not_found');
  end if;
  return v;
end;
$$;

-- 3. El atleta, ya con sesión, reclama su invitación.
create or replace function public.accept_athlete_invite(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv   public.athlete_invites%rowtype;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  -- Una cuenta de entrenador no puede convertirse en atleta: perdería el
  -- acceso a su propio espacio de trabajo.
  if exists (select 1 from public.workspace_members where user_id = v_uid) then
    raise exception 'coach_account';
  end if;

  select * into v_inv from public.athlete_invites where token = p_token;
  if v_inv.id is null      then raise exception 'invite_not_found'; end if;
  if v_inv.accepted_at is not null then raise exception 'invite_used'; end if;
  if v_inv.expires_at < now()      then raise exception 'invite_expired'; end if;

  if exists (select 1 from public.athlete_accounts where athlete_id = v_inv.athlete_id) then
    raise exception 'already_linked';
  end if;

  insert into public.athlete_accounts (athlete_id, user_id)
  values (v_inv.athlete_id, v_uid);

  update public.athlete_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  update public.profiles set role = 'athlete' where id = v_uid;

  return json_build_object('ok', true, 'athlete_id', v_inv.athlete_id);
end;
$$;

-- La pantalla del enlace la abre alguien sin sesión: hay que dejar que la
-- llame el rol anónimo. Las otras dos exigen sesión.
revoke all on function public.invite_preview(text)         from public;
revoke all on function public.create_athlete_invite(uuid)   from public;
revoke all on function public.accept_athlete_invite(text)   from public;

grant execute on function public.invite_preview(text)       to anon, authenticated;
grant execute on function public.create_athlete_invite(uuid) to authenticated;
grant execute on function public.accept_athlete_invite(text) to authenticated;
