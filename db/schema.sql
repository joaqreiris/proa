-- =============================================================================
-- Proa — esquema de la base de datos
-- =============================================================================
-- Este archivo es la FUENTE DE VERDAD del esquema. No se crean migraciones
-- sueltas: se edita este archivo y se aplica lo que cambió.
--
-- Idea central: la unidad de tenencia es el WORKSPACE (el espacio del
-- entrenador), no el club. Y hay DOS puertas de acceso en cada tabla:
--   · el entrenador ve todo lo de su workspace
--   · el atleta ve únicamente sus propias filas
-- Cualquier tabla nueva tiene que declarar las dos.
--
-- Tramo 0: cuentas, espacios de trabajo y el alta de atletas.
-- =============================================================================

-- =============================================================================
-- 1. Utilidades
-- =============================================================================

create extension if not exists "pgcrypto";

-- Marca de tiempo de última modificación.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 2. Perfiles
-- =============================================================================
-- Una fila por usuario de auth. El rol decide a qué aplicación entra:
--   'coach'   → el panel del entrenador
--   'athlete' → la app del atleta
-- El rol se fija al registrarse y no cambia solo.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  full_name    text,
  role         text not null default 'coach' check (role in ('coach','athlete')),
  avatar_url   text,
  language     text,
  timezone     text,
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Al crearse un usuario en auth, se crea su perfil. El rol y el nombre viajan
-- en los metadatos del registro (options.data del signUp).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.raw_user_meta_data->>'role' = 'athlete' then 'athlete' else 'coach' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 3. Espacios de trabajo
-- =============================================================================
-- Normalmente un entrenador solo. La tabla de miembros existe desde el día uno
-- porque agregarla después obliga a reescribir todas las reglas de acceso.

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  logo_url    text,
  -- Color de marca: se guarda el IDENTIFICADOR de la paleta, no un código de
  -- color. Cada acento son cuatro valores y todos viven juntos en proa.css.
  -- La lista se valida acá también: si el navegador manda cualquier cosa, la
  -- fila no entra. Los colores de los tipos de trabajo NO se eligen.
  accent      text not null default 'orange'
              check (accent in ('orange','red','fuchsia','violet','blue',
                                'teal','green','lime','yellow','graphite')),
  sport       text not null default 'football',
  seat_limit  int  not null default 5,                -- cupos de atletas activos
  language    text,
  timezone    text,
  owner_id    uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists workspaces_touch on public.workspaces;
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();

create table if not exists public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','admin','staff')),
  created_at   timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists workspace_members_ws_idx   on public.workspace_members(workspace_id);

-- Helpers en SECURITY DEFINER. Son imprescindibles: si una política de
-- workspace_members consultara workspace_members, Postgres entra en recursión
-- infinita. Al leer desde una función definer, la consulta interna no vuelve a
-- pasar por RLS y el ciclo se corta.
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

create or replace function public.my_workspace_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

-- Al crear un espacio, su dueño queda registrado como miembro en el acto.
-- Si esto lo hiciera el navegador en una segunda llamada, un corte de red entre
-- las dos dejaría un espacio sin dueño: nadie podría verlo ni borrarlo.
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists workspaces_add_owner on public.workspaces;
create trigger workspaces_add_owner after insert on public.workspaces
  for each row execute function public.add_owner_as_member();

-- =============================================================================
-- 4. Atletas
-- =============================================================================
-- Un atleta pertenece a un espacio de trabajo. Solo los 'active' ocupan cupo.

create table if not exists public.athletes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  first_name   text not null,
  last_name    text not null default '',
  birth_date   date,
  sex          text check (sex in ('m','f','x')),
  sport        text,
  position     text,
  club_name    text,                                  -- el club al que pertenece, si tiene
  email        text,                                  -- a dónde se manda la invitación
  avatar_url   text,
  status       text not null default 'active' check (status in ('active','paused','archived')),
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists athletes_ws_idx     on public.athletes(workspace_id);
create index if not exists athletes_status_idx on public.athletes(workspace_id, status);

drop trigger if exists athletes_touch on public.athletes;
create trigger athletes_touch before update on public.athletes
  for each row execute function public.touch_updated_at();

-- Vincula al atleta con su usuario. La cuenta es del atleta, no del entrenador:
-- por eso es una tabla aparte y no una columna en athletes.
create table if not exists public.athlete_accounts (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  linked_at  timestamptz not null default now(),
  unique (user_id, athlete_id)
);

create index if not exists athlete_accounts_user_idx on public.athlete_accounts(user_id);

create or replace function public.my_athlete_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select athlete_id from public.athlete_accounts where user_id = auth.uid();
$$;

-- =============================================================================
-- 5. Reglas de acceso (RLS)
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.athletes          enable row level security;
alter table public.athlete_accounts  enable row level security;

-- ── Perfiles: cada quien el suyo ────────────────────────────────────────────
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- ── Espacios de trabajo ─────────────────────────────────────────────────────
-- El dueño va PRIMERO y por owner_id, no por la tabla de miembros. Motivo: al
-- hacer «insert ... returning», Postgres exige que la fila nueva pase también
-- la regla de lectura, y en ese instante la fila de miembro todavía no existe.
-- Sin esta condición, crear un espacio falla siempre.
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select using (owner_id = auth.uid() or public.is_workspace_member(id));

drop policy if exists workspaces_insert_own on public.workspaces;
create policy workspaces_insert_own on public.workspaces
  for insert with check (owner_id = auth.uid());

drop policy if exists workspaces_update_owner on public.workspaces;
create policy workspaces_update_owner on public.workspaces
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
  for delete using (owner_id = auth.uid());

-- ── Miembros ────────────────────────────────────────────────────────────────
-- El select se resuelve contra la función definer, nunca contra la tabla.
drop policy if exists members_select_mine on public.workspace_members;
create policy members_select_mine on public.workspace_members
  for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

-- Alta: uno se agrega a sí mismo al crear su espacio, o el dueño agrega a otro.
drop policy if exists members_insert on public.workspace_members;
create policy members_insert on public.workspace_members
  for insert with check (
    user_id = auth.uid()
    or exists (select 1 from public.workspaces w
               where w.id = workspace_id and w.owner_id = auth.uid())
  );

drop policy if exists members_delete_owner on public.workspace_members;
create policy members_delete_owner on public.workspace_members
  for delete using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.owner_id = auth.uid())
  );

-- ── Atletas: las dos puertas ────────────────────────────────────────────────
-- Puerta 1: el entrenador, por espacio de trabajo.
-- Puerta 2: el atleta, por su propia vinculación.
drop policy if exists athletes_select on public.athletes;
create policy athletes_select on public.athletes
  for select using (
    public.is_workspace_member(workspace_id)
    or id in (select public.my_athlete_ids())
  );

drop policy if exists athletes_write_coach on public.athletes;
create policy athletes_write_coach on public.athletes
  for insert with check (public.is_workspace_member(workspace_id));

drop policy if exists athletes_update_coach on public.athletes;
create policy athletes_update_coach on public.athletes
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists athletes_delete_coach on public.athletes;
create policy athletes_delete_coach on public.athletes
  for delete using (public.is_workspace_member(workspace_id));

-- ── Vinculación de cuentas ──────────────────────────────────────────────────
drop policy if exists athlete_accounts_select on public.athlete_accounts;
create policy athlete_accounts_select on public.athlete_accounts
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.athletes a
               where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

drop policy if exists athlete_accounts_insert on public.athlete_accounts;
create policy athlete_accounts_insert on public.athlete_accounts
  for insert with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

drop policy if exists athlete_accounts_delete on public.athlete_accounts;
create policy athlete_accounts_delete on public.athlete_accounts
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.athletes a
               where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

-- =============================================================================
-- 6. Tope de cupos
-- =============================================================================
-- El límite se controla en la base, no solo en la pantalla: si el navegador se
-- saltea la validación, la fila igual no entra.

create or replace function public.enforce_seat_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim int;
  used int;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;                              -- ya contaba, no suma uno nuevo
  end if;

  select seat_limit into lim from public.workspaces where id = new.workspace_id;
  select count(*)  into used from public.athletes
    where workspace_id = new.workspace_id and status = 'active'
      and (tg_op = 'INSERT' or id <> new.id);

  if used >= coalesce(lim, 0) then
    raise exception 'seat_limit_reached'
      using hint = 'El espacio de trabajo llegó a su límite de atletas activos.';
  end if;
  return new;
end;
$$;

drop trigger if exists athletes_seat_limit on public.athletes;
create trigger athletes_seat_limit before insert or update on public.athletes
  for each row execute function public.enforce_seat_limit();

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

-- =============================================================================
-- Anamnesis completa
-- =============================================================================
-- La primera versión se quedaba corta: faltaban los datos personales del alta y
-- toda la parte de salud, que en un trabajo uno a uno es lo primero que hay que
-- saber. Un preparador que no sabe que su atleta es asmático o que está tomando
-- algo, planifica a ciegas.
-- =============================================================================

-- ── Datos del alta ───────────────────────────────────────────────────────────
alter table public.athletes add column if not exists phone text;
alter table public.athletes add column if not exists level text;
alter table public.athletes add column if not exists dominant_side text;

alter table public.athletes drop constraint if exists athletes_level_check;
alter table public.athletes add constraint athletes_level_check
  check (level is null or level in ('youth','amateur','semipro','pro','other'));

alter table public.athletes drop constraint if exists athletes_dominant_side_check;
alter table public.athletes add constraint athletes_dominant_side_check
  check (dominant_side is null or dominant_side in ('right','left','both'));

-- ── Anamnesis ────────────────────────────────────────────────────────────────

-- Contacto de emergencia. Trabajando uno a uno, muchas veces el entrenador es
-- la única persona presente si algo pasa.
alter table public.athlete_intake add column if not exists emergency_name     text;
alter table public.athlete_intake add column if not exists emergency_phone    text;
alter table public.athlete_intake add column if not exists emergency_relation text;

-- Salud. Esto es lo que más faltaba.
alter table public.athlete_intake add column if not exists conditions       text;  -- diagnósticos
alter table public.athlete_intake add column if not exists medication       text;
alter table public.athlete_intake add column if not exists allergies        text;
alter table public.athlete_intake add column if not exists surgeries        text;
alter table public.athlete_intake add column if not exists family_history   text;  -- antecedentes cardiovasculares
alter table public.athlete_intake add column if not exists medical_clearance      boolean;
alter table public.athlete_intake add column if not exists medical_clearance_date date;
alter table public.athlete_intake add column if not exists smokes  text;
alter table public.athlete_intake add column if not exists alcohol text;

alter table public.athlete_intake drop constraint if exists athlete_intake_smokes_check;
alter table public.athlete_intake add constraint athlete_intake_smokes_check
  check (smokes is null or smokes in ('no','occasional','yes'));

alter table public.athlete_intake drop constraint if exists athlete_intake_alcohol_check;
alter table public.athlete_intake add constraint athlete_intake_alcohol_check
  check (alcohol is null or alcohol in ('no','occasional','frequent'));

-- Lesiones, con más detalle
alter table public.athlete_intake add column if not exists pain_areas     text;
alter table public.athlete_intake add column if not exists longest_layoff text;

-- Entrenamiento
alter table public.athlete_intake add column if not exists lifting_experience text;
alter table public.athlete_intake add column if not exists current_training   text;
alter table public.athlete_intake add column if not exists avoid_exercises    text;
alter table public.athlete_intake add column if not exists preferences        text;

alter table public.athlete_intake drop constraint if exists athlete_intake_lifting_check;
alter table public.athlete_intake add constraint athlete_intake_lifting_check
  check (lifting_experience is null or lifting_experience in ('none','beginner','intermediate','advanced'));

-- Nutrición
alter table public.athlete_intake add column if not exists meals_per_day     int;
alter table public.athlete_intake add column if not exists food_restrictions text;
alter table public.athlete_intake add column if not exists hydration         text;
alter table public.athlete_intake add column if not exists target_weight     numeric(5,1);

alter table public.athlete_intake drop constraint if exists athlete_intake_meals_check;
alter table public.athlete_intake add constraint athlete_intake_meals_check
  check (meals_per_day is null or meals_per_day between 1 and 10);

-- Sueño y recuperación
alter table public.athlete_intake add column if not exists bedtime          time;
alter table public.athlete_intake add column if not exists waketime         time;
alter table public.athlete_intake add column if not exists naps             text;
alter table public.athlete_intake add column if not exists recovery_methods text;
alter table public.athlete_intake add column if not exists stress_level     int;

alter table public.athlete_intake drop constraint if exists athlete_intake_stress_check;
alter table public.athlete_intake add constraint athlete_intake_stress_check
  check (stress_level is null or stress_level between 1 and 5);

-- Objetivo con fecha
alter table public.athlete_intake add column if not exists target_date date;
alter table public.athlete_intake add column if not exists key_event   text;
