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
  accent      text,                                   -- color de marca del entrenador
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
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
  for select using (public.is_workspace_member(id));

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
