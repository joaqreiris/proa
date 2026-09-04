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

-- =============================================================================
-- El atleta completa su propia anamnesis
-- =============================================================================
-- Hasta ahora solo el entrenador podía escribirla: con ocho atletas eso son más
-- de trescientos campos tipeados a mano, con datos que el atleta tiene en la
-- cabeza y el entrenador no. Se le abre la escritura sobre LO SUYO, nada más.
-- =============================================================================

-- Quién la completó. Al entrenador le cambia la lectura: no es lo mismo un dato
-- que puso él de memoria que uno que puso el atleta.
alter table public.athlete_intake add column if not exists completed_by uuid references auth.users(id) on delete set null;

-- ── Anamnesis: el atleta escribe la suya ────────────────────────────────────
drop policy if exists intake_write_athlete on public.athlete_intake;
create policy intake_write_athlete on public.athlete_intake
  for insert with check (athlete_id in (select public.my_athlete_ids()));

drop policy if exists intake_update_athlete on public.athlete_intake;
create policy intake_update_athlete on public.athlete_intake
  for update using (athlete_id in (select public.my_athlete_ids()))
  with check (athlete_id in (select public.my_athlete_ids()));

-- Borrarla no: si el atleta se arrepiente, edita. Perder la anamnesis entera
-- de un toque no le sirve a nadie.

-- ── Horarios fijos: el atleta también carga los suyos ───────────────────────
-- Acá sí puede borrar: son filas sueltas y las va a corregir seguido (cambió
-- el horario de la facultad, dejó el trabajo).
drop policy if exists slots_write_athlete on public.availability_slots;
create policy slots_write_athlete on public.availability_slots
  for insert with check (athlete_id in (select public.my_athlete_ids()));

drop policy if exists slots_update_athlete on public.availability_slots;
create policy slots_update_athlete on public.availability_slots
  for update using (athlete_id in (select public.my_athlete_ids()))
  with check (athlete_id in (select public.my_athlete_ids()));

drop policy if exists slots_delete_athlete on public.availability_slots;
create policy slots_delete_athlete on public.availability_slots
  for delete using (athlete_id in (select public.my_athlete_ids()));

-- La política del entrenador era FOR ALL, que ya cubre insert/update/delete.
-- Postgres suma las políticas permisivas con OR, así que conviven sin pisarse.

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

-- =============================================================================
-- Tramo 3 — biblioteca de ejercicios y contenido de las sesiones
-- =============================================================================

-- ── Biblioteca ───────────────────────────────────────────────────────────────
-- workspace_id NULL = catálogo de Proa, lo ve todo el mundo.
-- workspace_id con valor = ejercicio propio del entrenador, solo suyo.
-- Una biblioteca vacía es un callejón sin salida: por eso el catálogo viene
-- cargado desde el primer día.
create table if not exists public.exercises (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  key          text,                       -- solo los del catálogo
  name         text not null,              -- inglés, canónico
  name_es      text,
  name_pt      text,
  category     text,
  muscle_group text,
  equipment    text,
  complexity   text check (complexity is null or complexity in ('low','medium','high')),
  purpose      text,
  video_url    text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- La clave solo tiene que ser única dentro del catálogo: un entrenador puede
-- tener su propia versión de «back squat» sin chocar con la de fábrica.
create unique index if not exists exercises_key_catalog_idx
  on public.exercises(key) where workspace_id is null;
create index if not exists exercises_ws_idx  on public.exercises(workspace_id);
create index if not exists exercises_cat_idx on public.exercises(category);

drop trigger if exists exercises_touch on public.exercises;
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

-- ── Contenido de una sesión ──────────────────────────────────────────────────
-- Bloques con ejercicios dentro, colgando de un evento del calendario. Sirve
-- igual para gimnasio y para campo: un trabajo de campo también son bloques.
create table if not exists public.session_blocks (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  position   int  not null default 0,
  title      text,
  kind       text not null default 'main'
             check (kind in ('warmup','main','accessory','circuit','cooldown')),
  rounds     int,                          -- para circuitos
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists session_blocks_event_idx on public.session_blocks(event_id, position);

create table if not exists public.session_items (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.session_blocks(id) on delete cascade,
  position    int  not null default 0,
  exercise_id uuid references public.exercises(id) on delete set null,
  -- El nombre se copia al agregar: si mañana se borra el ejercicio de la
  -- biblioteca, la sesión que ya se hizo no puede quedarse sin decir qué era.
  name        text not null,
  sets        int,
  -- Texto y no número a propósito: un preparador escribe «6-8», «30 s», «máx».
  reps        text,
  load        text,                        -- «80%», «40 kg», «RPE 8»
  rest_s      int,
  tempo       text,                        -- «3-1-1-0»
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists session_items_block_idx on public.session_items(block_id, position);

-- =============================================================================
-- Reglas de acceso
-- =============================================================================
alter table public.exercises      enable row level security;
alter table public.session_blocks enable row level security;
alter table public.session_items  enable row level security;

-- Biblioteca: el catálogo lo ve cualquiera con sesión; lo propio, su dueño.
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));

drop policy if exists exercises_write on public.exercises;
create policy exercises_write on public.exercises
  for all using (workspace_id is not null and public.is_workspace_member(workspace_id))
  with check (workspace_id is not null and public.is_workspace_member(workspace_id));

-- Quién puede tocar el contenido de un evento. Va en una función para no
-- repetir el doble salto (evento → atleta → espacio) en cada política.
create or replace function public.can_edit_event(p_event uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.events e
      join public.athletes a on a.id = e.athlete_id
     where e.id = p_event and public.is_workspace_member(a.workspace_id)
  );
$$;

create or replace function public.can_see_event(p_event uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.events e
      join public.athletes a on a.id = e.athlete_id
     where e.id = p_event
       and (public.is_workspace_member(a.workspace_id)
            or a.id in (select public.my_athlete_ids()))
  );
$$;

drop policy if exists blocks_select on public.session_blocks;
create policy blocks_select on public.session_blocks
  for select using (public.can_see_event(event_id));

drop policy if exists blocks_write on public.session_blocks;
create policy blocks_write on public.session_blocks
  for all using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

drop policy if exists items_select on public.session_items;
create policy items_select on public.session_items
  for select using (
    exists (select 1 from public.session_blocks b
            where b.id = block_id and public.can_see_event(b.event_id))
  );

drop policy if exists items_write on public.session_items;
create policy items_write on public.session_items
  for all using (
    exists (select 1 from public.session_blocks b
            where b.id = block_id and public.can_edit_event(b.event_id))
  ) with check (
    exists (select 1 from public.session_blocks b
            where b.id = block_id and public.can_edit_event(b.event_id))
  );
-- Catálogo de ejercicios de Proa: 120 entradas.
-- Vienen del catálogo por defecto de ClavaMetrics, traducidas a español y
-- portugués. Los ejercicios que crearon clubes clientes NO se copian.
insert into public.exercises (key, name, name_es, name_pt, category, muscle_group, equipment, complexity, purpose)
values
  ('5_10_5_pro_agility', '5-10-5 Pro Agility', '5-10-5 Pro Agility', '5-10-5 Pro Agility', 'speed', 'Tren inferior', 'Conos', 'medium', 'power'),
  ('90_90_hip_switch', '90/90 Hip Switch', 'Cambio de cadera 90/90', 'Troca de quadril 90/90', 'mobility', 'Caderas', null, 'low', 'warmup'),
  ('a_skip', 'A-Skip', 'A-Skip', 'A-Skip', 'speed', 'Tren inferior', null, 'low', 'power'),
  ('ab_wheel_rollout', 'Ab Wheel Rollout', 'Rueda abdominal', 'Roda abdominal', 'core', 'Core', 'Rueda', 'high', 'strength'),
  ('acceleration_sprint_10_20_m', 'Acceleration Sprint (10–20 m)', 'Sprint de aceleración (10–20 m)', 'Sprint de aceleração (10–20 m)', 'speed', 'Tren inferior', null, 'medium', 'power'),
  ('airplane_single_leg', 'Airplane (single-leg)', 'Avión (a una pierna)', 'Avião (uma perna)', 'balance', 'Glúteos / Cadena posterior', null, 'medium', 'prevention'),
  ('ankle_dorsiflexion_rock', 'Ankle Dorsiflexion Rock', 'Balanceo de dorsiflexión de tobillo', 'Balanço de dorsiflexão de tornozelo', 'mobility', 'Tobillo', null, 'low', 'warmup'),
  ('atg_split_squat', 'ATG Split Squat', 'Zancada ATG', 'Afundo ATG', 'prehab', 'Cuádriceps / Rodilla', null, 'medium', 'prevention'),
  ('b_skip', 'B-Skip', 'B-Skip', 'B-Skip', 'speed', 'Tren inferior', null, 'medium', 'power'),
  ('back_squat', 'Back Squat', 'Sentadilla trasera', 'Agachamento com barra atrás', 'strength', 'Cuádriceps / Glúteos', 'Barra', 'high', 'strength'),
  ('banded_ankle_mobilization', 'Banded Ankle Mobilization', 'Movilización de tobillo con banda', 'Mobilização de tornozelo com elástico', 'mobility', 'Tobillo', 'Banda', 'low', 'warmup'),
  ('banded_external_rotation', 'Banded External Rotation', 'Rotación externa con banda', 'Rotação externa com elástico', 'prehab', 'Manguito rotador', 'Banda', 'low', 'prevention'),
  ('banded_lateral_walk', 'Banded Lateral Walk', 'Caminata lateral con banda', 'Caminhada lateral com elástico', 'activation', 'Glúteo medio', 'Mini-banda', 'low', 'activation'),
  ('banded_pull_apart', 'Banded Pull-apart', 'Apertura con banda', 'Abertura com elástico', 'activation', 'Espalda alta', 'Banda', 'low', 'activation'),
  ('barbell_row', 'Barbell Row', 'Remo con barra', 'Remada com barra', 'strength', 'Espalda alta / Dorsales', 'Barra', 'medium', 'strength'),
  ('battle_ropes', 'Battle Ropes', 'Cuerdas de batalla', 'Cordas navais', 'conditioning', 'Tren superior / Core', 'Cuerdas', 'low', 'conditioning'),
  ('bear_crawl', 'Bear Crawl', 'Marcha del oso', 'Marcha do urso', 'core', 'Core / Hombros', null, 'low', 'strength'),
  ('bench_press', 'Bench Press', 'Press de banca', 'Supino reto', 'strength', 'Pectoral / Tríceps', 'Barra', 'medium', 'strength'),
  ('bike_intervals', 'Bike Intervals', 'Intervalos en bici', 'Intervalos na bike', 'conditioning', 'Cuerpo completo', 'Bici', 'medium', 'conditioning'),
  ('bike_steady_state', 'Bike Steady-State', 'Bici continua', 'Bike contínua', 'conditioning', 'Cuerpo completo', 'Bici', 'low', 'conditioning'),
  ('bird_dog', 'Bird Dog', 'Bird dog', 'Bird dog', 'activation', 'Core / Glúteos', null, 'low', 'activation'),
  ('bosu_squat', 'Bosu Squat', 'Sentadilla en Bosu', 'Agachamento no Bosu', 'balance', 'Tren inferior', 'Bosu', 'medium', 'prevention'),
  ('box_jump', 'Box Jump', 'Salto al cajón', 'Salto na caixa', 'power', 'Tren inferior', 'Cajón', 'medium', 'power'),
  ('broad_jump', 'Broad Jump', 'Salto horizontal', 'Salto horizontal', 'power', 'Tren inferior', null, 'medium', 'power'),
  ('bulgarian_split_squat', 'Bulgarian Split Squat', 'Sentadilla búlgara', 'Agachamento búlgaro', 'strength', 'Cuádriceps / Glúteos', 'Mancuernas', 'medium', 'strength'),
  ('cable_woodchop', 'Cable Woodchop', 'Leñador en polea', 'Lenhador na polia', 'core', 'Oblicuos', 'Polea', 'low', 'strength'),
  ('calf_raise_bent_knee_soleus', 'Calf Raise (bent knee / soleus)', 'Elevación de talón (rodilla flexionada)', 'Elevação de panturrilha (joelho fletido)', 'prehab', 'Sóleo', 'Escalón', 'low', 'prevention'),
  ('calf_raise_straight_knee', 'Calf Raise (straight knee)', 'Elevación de talón (rodilla extendida)', 'Elevação de panturrilha (joelho estendido)', 'prehab', 'Gemelos', 'Escalón', 'low', 'prevention'),
  ('calf_stretch_wall', 'Calf Stretch (wall)', 'Estiramiento de gemelos (pared)', 'Alongamento de panturrilha (parede)', 'cooldown', 'Gemelos', 'Pared', 'low', 'cooldown'),
  ('cat_camel', 'Cat-Camel', 'Gato-camello', 'Gato-camelo', 'mobility', 'Columna', null, 'low', 'warmup'),
  ('child_s_pose', 'Child''s Pose', 'Postura del niño', 'Postura da criança', 'cooldown', 'Columna / Dorsales', null, 'low', 'cooldown'),
  ('clamshell', 'Clamshell', 'Almeja', 'Concha', 'activation', 'Glúteo medio', 'Mini-banda', 'low', 'activation'),
  ('clean_pull', 'Clean Pull', 'Tirón de cargada', 'Puxada de clean', 'olympic', 'Cadena posterior', 'Barra', 'medium', 'power'),
  ('conventional_deadlift', 'Conventional Deadlift', 'Peso muerto convencional', 'Levantamento terra convencional', 'strength', 'Cadena posterior', 'Barra', 'high', 'strength'),
  ('copenhagen_plank', 'Copenhagen Plank', 'Plancha Copenhague', 'Prancha Copenhague', 'prehab', 'Aductores', 'Banco', 'medium', 'prevention'),
  ('couch_stretch', 'Couch Stretch', 'Estiramiento de sofá', 'Alongamento do sofá', 'cooldown', 'Flexores de cadera / Cuádriceps', 'Pared', 'low', 'cooldown'),
  ('countermovement_jump', 'Countermovement Jump', 'Salto con contramovimiento', 'Salto com contramovimento', 'power', 'Tren inferior', null, 'low', 'power'),
  ('dead_bug', 'Dead Bug', 'Dead bug', 'Dead bug', 'activation', 'Core', null, 'low', 'activation'),
  ('deceleration_drill', 'Deceleration Drill', 'Ejercicio de desaceleración', 'Exercício de desaceleração', 'speed', 'Tren inferior', 'Conos', 'medium', 'prevention'),
  ('deep_squat_hold_prying', 'Deep Squat Hold (prying)', 'Sentadilla profunda sostenida', 'Agachamento profundo sustentado', 'mobility', 'Caderas / Tobillos', null, 'low', 'warmup'),
  ('depth_jump', 'Depth Jump', 'Salto en profundidad', 'Salto em profundidade', 'power', 'Tren inferior', 'Cajón', 'high', 'power'),
  ('diaphragmatic_breathing', 'Diaphragmatic Breathing', 'Respiración diafragmática', 'Respiração diafragmática', 'cooldown', 'Recuperación', null, 'low', 'cooldown'),
  ('drop_stick_landing', 'Drop & Stick Landing', 'Caída y frenado', 'Queda e aterrissagem firme', 'power', 'Tren inferior', 'Cajón', 'low', 'prevention'),
  ('eccentric_heel_drop', 'Eccentric Heel Drop', 'Descenso excéntrico de talón', 'Descida excêntrica de calcanhar', 'prehab', 'Aquiles / Gemelo', 'Escalón', 'low', 'prevention'),
  ('flying_sprint_max_velocity', 'Flying Sprint (max velocity)', 'Sprint lanzado (velocidad máxima)', 'Sprint lançado (velocidade máxima)', 'speed', 'Tren inferior', null, 'high', 'power'),
  ('foam_roll_it_band_glutes', 'Foam Roll IT Band / Glutes', 'Rodillo: banda iliotibial y glúteos', 'Rolo: banda iliotibial e glúteos', 'cooldown', 'Glúteos / Cara lateral del muslo', 'Rodillo', 'low', 'release'),
  ('foam_roll_quads', 'Foam Roll Quads', 'Rodillo: cuádriceps', 'Rolo: quadríceps', 'cooldown', 'Cuádriceps', 'Rodillo', 'low', 'release'),
  ('front_plank', 'Front Plank', 'Plancha frontal', 'Prancha frontal', 'core', 'Core', null, 'low', 'strength'),
  ('front_squat', 'Front Squat', 'Sentadilla frontal', 'Agachamento frontal', 'strength', 'Cuádriceps', 'Barra', 'high', 'strength'),
  ('glute_bridge', 'Glute Bridge', 'Puente de glúteos', 'Ponte de glúteos', 'activation', 'Glúteos', null, 'low', 'activation'),
  ('goblet_squat', 'Goblet Squat', 'Sentadilla goblet', 'Agachamento goblet', 'strength', 'Cuádriceps / Glúteos', 'Kettlebell / Mancuerna', 'low', 'strength'),
  ('hamstring_slider_curl', 'Hamstring Slider Curl', 'Curl de isquios con deslizadores', 'Flexão de isquiotibiais com sliders', 'prehab', 'Isquiotibiales', 'Deslizadores', 'medium', 'prevention'),
  ('hang_power_clean', 'Hang Power Clean', 'Cargada de potencia desde suspensión', 'Clean de potência suspenso', 'olympic', 'Cuerpo completo', 'Barra', 'high', 'power'),
  ('hang_power_snatch', 'Hang Power Snatch', 'Arranque de potencia desde suspensión', 'Snatch de potência suspenso', 'olympic', 'Cuerpo completo', 'Barra', 'high', 'power'),
  ('hanging_leg_raise', 'Hanging Leg Raise', 'Elevación de piernas colgado', 'Elevação de pernas suspenso', 'core', 'Flexores de cadera / Core', 'Barra fija', 'medium', 'strength'),
  ('hip_flexor_rock_back', 'Hip Flexor Rock-back', 'Balanceo de flexores de cadera', 'Balanço de flexores de quadril', 'mobility', 'Caderas', null, 'low', 'warmup'),
  ('hip_flexor_stretch', 'Hip Flexor Stretch', 'Estiramiento de flexores de cadera', 'Alongamento de flexores de quadril', 'cooldown', 'Flexores de cadera', null, 'low', 'cooldown'),
  ('hip_thrust', 'Hip Thrust', 'Empuje de cadera', 'Elevação pélvica', 'strength', 'Glúteos', 'Barra', 'low', 'strength'),
  ('hollow_hold', 'Hollow Hold', 'Hollow hold', 'Hollow hold', 'core', 'Core', null, 'low', 'strength'),
  ('hurdle_hops', 'Hurdle Hops', 'Saltos sobre vallas', 'Saltos sobre barreiras', 'power', 'Tren inferior', 'Vallas', 'medium', 'power'),
  ('incline_dumbbell_press', 'Incline Dumbbell Press', 'Press inclinado con mancuernas', 'Supino inclinado com halteres', 'strength', 'Pectoral / Hombros', 'Mancuernas', 'medium', 'strength'),
  ('incline_treadmill_walk', 'Incline Treadmill Walk', 'Caminata en cinta inclinada', 'Caminhada na esteira inclinada', 'conditioning', 'Tren inferior', 'Cinta', 'low', 'conditioning'),
  ('kettlebell_clean', 'Kettlebell Clean', 'Cargada con kettlebell', 'Clean com kettlebell', 'olympic', 'Cuerpo completo', 'Kettlebell', 'medium', 'power'),
  ('kettlebell_swing', 'Kettlebell Swing', 'Balanceo con kettlebell', 'Swing com kettlebell', 'olympic', 'Glúteos / Isquiotibiales', 'Kettlebell', 'low', 'power'),
  ('ladder_quick_feet', 'Ladder Quick Feet', 'Escalera de agilidad: pies rápidos', 'Escada de agilidade: pés rápidos', 'speed', 'Tren inferior', 'Escalera', 'low', 'power'),
  ('lateral_bound', 'Lateral Bound', 'Salto lateral', 'Salto lateral', 'power', 'Tren inferior', null, 'medium', 'power'),
  ('medicine_ball_rotational_throw', 'Medicine Ball Rotational Throw', 'Lanzamiento rotacional con balón medicinal', 'Arremesso rotacional com bola medicinal', 'power', 'Core', 'Balón medicinal', 'low', 'power'),
  ('medicine_ball_slam', 'Medicine Ball Slam', 'Golpe con balón medicinal', 'Arremesso ao solo com bola medicinal', 'power', 'Core / Cuerpo completo', 'Balón medicinal', 'low', 'power'),
  ('monster_walk', 'Monster Walk', 'Caminata monster', 'Caminhada monster', 'activation', 'Glúteos', 'Mini-banda', 'low', 'activation'),
  ('nordic_hamstring_curl', 'Nordic Hamstring Curl', 'Curl nórdico de isquios', 'Flexão nórdica de isquiotibiais', 'prehab', 'Isquiotibiales', 'Compañero', 'high', 'prevention'),
  ('open_book', 'Open Book', 'Libro abierto', 'Livro aberto', 'mobility', 'Columna dorsal', null, 'low', 'warmup'),
  ('overhead_press', 'Overhead Press', 'Press militar', 'Desenvolvimento militar', 'strength', 'Hombros', 'Barra', 'medium', 'strength'),
  ('pallof_press', 'Pallof Press', 'Press Pallof', 'Press Pallof', 'core', 'Core', 'Polea / Banda', 'low', 'strength'),
  ('pigeon_stretch', 'Pigeon Stretch', 'Estiramiento de paloma', 'Alongamento do pombo', 'cooldown', 'Glúteos / Caderas', null, 'low', 'cooldown'),
  ('pogo_hops', 'Pogo Hops', 'Saltos pogo', 'Saltos pogo', 'power', 'Gemelos / Tobillo', null, 'low', 'power'),
  ('power_clean', 'Power Clean', 'Cargada de potencia', 'Clean de potência', 'olympic', 'Cuerpo completo', 'Barra', 'high', 'power'),
  ('prone_y_t_w', 'Prone Y-T-W', 'Y-T-W en prono', 'Y-T-W em prono', 'activation', 'Trapecio inferior / Manguito', null, 'low', 'activation'),
  ('pull_up', 'Pull-up', 'Dominada', 'Barra fixa', 'strength', 'Dorsales / Espalda alta', 'Barra fija', 'high', 'strength'),
  ('push_jerk', 'Push Jerk', 'Envión de fuerza', 'Push jerk', 'olympic', 'Hombros / Piernas', 'Barra', 'high', 'power'),
  ('push_press', 'Push Press', 'Press de empuje', 'Push press', 'olympic', 'Hombros / Piernas', 'Barra', 'medium', 'power'),
  ('quadruped_t_spine_reach', 'Quadruped T-spine Reach', 'Alcance torácico en cuadrupedia', 'Alcance torácico em quatro apoios', 'mobility', 'Columna dorsal', null, 'low', 'warmup'),
  ('resisted_sprint_band_sled', 'Resisted Sprint (band / sled)', 'Sprint resistido (banda / trineo)', 'Sprint resistido (elástico / trenó)', 'speed', 'Tren inferior', 'Banda / Trineo', 'medium', 'power'),
  ('reverse_crunch', 'Reverse Crunch', 'Crunch invertido', 'Abdominal invertido', 'core', 'Abdomen inferior', null, 'low', 'strength'),
  ('reverse_nordic', 'Reverse Nordic', 'Nórdico inverso', 'Nórdico invertido', 'prehab', 'Cuádriceps', 'Colchoneta', 'medium', 'prevention'),
  ('romanian_deadlift', 'Romanian Deadlift', 'Peso muerto rumano', 'Levantamento terra romeno', 'strength', 'Isquiotibiales / Glúteos', 'Barra', 'medium', 'strength'),
  ('rowing_intervals', 'Rowing Intervals', 'Intervalos en remo', 'Intervalos no remo', 'conditioning', 'Cuerpo completo', 'Remo', 'medium', 'conditioning'),
  ('russian_twist', 'Russian Twist', 'Giro ruso', 'Giro russo', 'core', 'Oblicuos', 'Balón medicinal', 'low', 'strength'),
  ('scapular_push_up', 'Scapular Push-up', 'Flexión escapular', 'Flexão escapular', 'prehab', 'Serrato', null, 'low', 'prevention'),
  ('scapular_wall_slide', 'Scapular Wall Slide', 'Deslizamiento escapular en pared', 'Deslizamento escapular na parede', 'activation', 'Hombros', 'Pared', 'low', 'activation'),
  ('shuttle_runs', 'Shuttle Runs', 'Carreras de ida y vuelta', 'Corridas de vai e vem', 'conditioning', 'Cuerpo completo', 'Conos', 'medium', 'conditioning'),
  ('side_plank', 'Side Plank', 'Plancha lateral', 'Prancha lateral', 'core', 'Core lateral', null, 'low', 'strength'),
  ('single_arm_dumbbell_row', 'Single-Arm Dumbbell Row', 'Remo a una mano con mancuerna', 'Remada unilateral com halter', 'strength', 'Dorsales / Espalda alta', 'Mancuerna', 'low', 'strength'),
  ('single_leg_balance', 'Single-Leg Balance', 'Equilibrio a una pierna', 'Equilíbrio em uma perna', 'balance', 'Tobillo / Cadera', null, 'low', 'prevention'),
  ('single_leg_balance_perturbation', 'Single-Leg Balance + Perturbation', 'Equilibrio a una pierna con perturbación', 'Equilíbrio em uma perna com perturbação', 'balance', 'Tobillo / Cadera', 'Banda / Compañero', 'medium', 'prevention'),
  ('single_leg_glute_bridge', 'Single-Leg Glute Bridge', 'Puente de glúteos a una pierna', 'Ponte de glúteos em uma perna', 'activation', 'Glúteos', null, 'low', 'activation'),
  ('single_leg_hop_stick', 'Single-Leg Hop & Stick', 'Salto a una pierna con frenado', 'Salto em uma perna com aterrissagem firme', 'power', 'Tren inferior', null, 'medium', 'power'),
  ('single_leg_rdl', 'Single-Leg RDL', 'Peso muerto rumano a una pierna', 'Levantamento terra romeno unilateral', 'balance', 'Isquiotibiales / Glúteos', 'Mancuerna', 'medium', 'prevention'),
  ('skierg_intervals', 'SkiErg Intervals', 'Intervalos en SkiErg', 'Intervalos no SkiErg', 'conditioning', 'Cuerpo completo', 'SkiErg', 'medium', 'conditioning'),
  ('sled_drag_backward', 'Sled Drag (backward)', 'Arrastre de trineo hacia atrás', 'Arrasto de trenó para trás', 'conditioning', 'Cuádriceps / Rodilla', 'Trineo', 'low', 'prevention'),
  ('sled_push', 'Sled Push', 'Empuje de trineo', 'Empurrada de trenó', 'conditioning', 'Cuerpo completo', 'Trineo', 'medium', 'conditioning'),
  ('spiderman_lunge', 'Spiderman Lunge', 'Zancada spiderman', 'Afundo spiderman', 'mobility', 'Caderas / Ingle', null, 'low', 'warmup'),
  ('squat_jump', 'Squat Jump', 'Salto desde sentadilla', 'Salto a partir do agachamento', 'power', 'Tren inferior', null, 'low', 'power'),
  ('standing_hamstring_stretch', 'Standing Hamstring Stretch', 'Estiramiento de isquios de pie', 'Alongamento de isquiotibiais em pé', 'cooldown', 'Isquiotibiales', null, 'low', 'cooldown'),
  ('step_up', 'Step-up', 'Subida al cajón', 'Subida no banco', 'strength', 'Cuádriceps / Glúteos', 'Mancuernas / Cajón', 'low', 'strength'),
  ('stir_the_pot', 'Stir the Pot', 'Revolver la olla', 'Mexer a panela', 'core', 'Core', 'Fitball', 'medium', 'strength'),
  ('suitcase_carry', 'Suitcase Carry', 'Transporte maleta', 'Carregamento maleta', 'core', 'Core / Agarre', 'Mancuerna / Kettlebell', 'low', 'strength'),
  ('t_drill', 'T-Drill', 'Test en T', 'Teste em T', 'speed', 'Tren inferior', 'Conos', 'medium', 'power'),
  ('tandem_stance_hold', 'Tandem Stance Hold', 'Apoyo en tándem', 'Apoio em tandem', 'balance', 'Tobillo / Cadera', null, 'low', 'prevention'),
  ('tempo_run', 'Tempo Run', 'Carrera a ritmo', 'Corrida em ritmo', 'conditioning', 'Cuerpo completo', null, 'low', 'conditioning'),
  ('thoracic_foam_roll', 'Thoracic Foam Roll', 'Rodillo torácico', 'Rolo torácico', 'cooldown', 'Columna dorsal', 'Rodillo', 'low', 'release'),
  ('thoracic_spine_rotation', 'Thoracic Spine Rotation', 'Rotación torácica', 'Rotação torácica', 'mobility', 'Columna dorsal', null, 'low', 'warmup'),
  ('tibialis_raise', 'Tibialis Raise', 'Elevación de tibial', 'Elevação de tibial', 'prehab', 'Tibial', 'Pared', 'low', 'prevention'),
  ('trap_bar_deadlift', 'Trap-Bar Deadlift', 'Peso muerto con barra hexagonal', 'Levantamento terra com barra hexagonal', 'strength', 'Cadena posterior / Cuádriceps', 'Barra hexagonal', 'medium', 'strength'),
  ('walking_lunge', 'Walking Lunge', 'Zancada caminando', 'Afundo caminhando', 'strength', 'Cuádriceps / Glúteos', 'Mancuernas', 'low', 'strength'),
  ('wall_slides_shoulder', 'Wall Slides (shoulder)', 'Deslizamiento en pared (hombro)', 'Deslizamento na parede (ombro)', 'mobility', 'Hombros', 'Pared', 'low', 'warmup'),
  ('wicket_runs', 'Wicket Runs', 'Carreras entre vallas bajas', 'Corridas entre barreiras baixas', 'speed', 'Tren inferior', 'Vallas bajas', 'medium', 'power'),
  ('wobble_board_hold', 'Wobble Board Hold', 'Sostén en plato de equilibrio', 'Sustentação na prancha de equilíbrio', 'balance', 'Tobillo', 'Plato de equilibrio', 'low', 'prevention'),
  ('world_s_greatest_stretch', 'World''s Greatest Stretch', 'El mejor estiramiento del mundo', 'O melhor alongamento do mundo', 'mobility', 'Cuerpo completo', null, 'low', 'warmup'),
  ('wrist_flexor_extensor_eccentrics', 'Wrist Flexor/Extensor Eccentrics', 'Excéntricos de muñeca', 'Excêntricos de punho', 'prehab', 'Antebrazo', 'Mancuerna', 'low', 'prevention'),
  ('y_balance_reach', 'Y-Balance Reach', 'Alcance Y-Balance', 'Alcance Y-Balance', 'balance', 'Tren inferior', null, 'low', 'prevention')
on conflict (key) where workspace_id is null do update set
  name = excluded.name, name_es = excluded.name_es, name_pt = excluded.name_pt,
  category = excluded.category, muscle_group = excluded.muscle_group,
  equipment = excluded.equipment, complexity = excluded.complexity,
  purpose = excluded.purpose;

-- =============================================================================
-- Copiar la semana también copia el CONTENIDO de cada sesión
-- =============================================================================
-- Antes solo duplicaba los eventos: la semana copiada quedaba con los bloques
-- vacíos, que es justo lo que un entrenador NO quiere copiar a mano.
create or replace function public.copy_week(
  p_athlete_id uuid, p_from date, p_to date, p_replace boolean default false
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ws    uuid;
  v_shift int;
  v_count int := 0;
  r       record;
  b       record;
  v_new   uuid;
  v_blk   uuid;
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

  for r in
    select * from public.events
     where athlete_id = p_athlete_id and date >= p_from and date < p_from + 7
     order by date, start_time
  loop
    insert into public.events (athlete_id, date, start_time, end_time, type, title, notes, location, created_by)
    values (r.athlete_id, r.date + v_shift, r.start_time, r.end_time, r.type, r.title, r.notes, r.location, auth.uid())
    returning id into v_new;
    v_count := v_count + 1;

    for b in select * from public.session_blocks where event_id = r.id order by position loop
      insert into public.session_blocks (event_id, position, title, kind, rounds, notes)
      values (v_new, b.position, b.title, b.kind, b.rounds, b.notes)
      returning id into v_blk;

      insert into public.session_items (block_id, position, exercise_id, name, sets, reps, load, rest_s, tempo, notes)
      select v_blk, position, exercise_id, name, sets, reps, load, rest_s, tempo, notes
        from public.session_items where block_id = b.id order by position;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.copy_week(uuid, date, date, boolean) from public;
grant execute on function public.copy_week(uuid, date, date, boolean) to authenticated;


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
