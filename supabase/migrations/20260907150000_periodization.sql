-- ── Periodización: etapas de trabajo ───────────────────────────────────────
--
-- Hasta ahora una semana de gimnasio no sabía de qué parte del año era. Se
-- planificaba bien de a una, pero nada decía si esas cuatro semanas eran base o
-- puesta a punto, ni por qué la de la semana que viene tiene que ser distinta.
--
-- DOS EJES, y esta es la decisión de fondo. Una etapa lleva:
--
--   phase  en qué momento de la temporada está: pretemporada, competencia,
--          transición, vuelta de lesión. Lo pone el calendario del deporte.
--   kind   qué le hace a la carga: acumulación, transformación, realización.
--          Lo pone el modelo de periodización.
--
-- Con un solo eje se pierde la mitad: una acumulación en pretemporada y una en
-- plena competencia se dibujan igual y no se parecen en nada.
create table if not exists public.training_plans (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes(id) on delete cascade,
  name         text not null,
  -- Qué modelo organiza las etapas. Agregar uno nuevo es agregar un valor acá
  -- y su lista de tipos en el navegador: no se toca la estructura.
  model        text not null default 'atr'
               check (model in ('atr', 'linear', 'undulating', 'conjugate', 'free')),
  start_date   date not null,
  end_date     date not null,
  goal         text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists training_plans_athlete_idx on public.training_plans(athlete_id, start_date);

drop trigger if exists training_plans_touch on public.training_plans;
create trigger training_plans_touch before update on public.training_plans
  for each row execute function public.touch_updated_at();

create table if not exists public.training_blocks (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.training_plans(id) on delete cascade,
  name       text not null,
  -- El momento de la temporada. Null significa que al entrenador no le importa
  -- ese eje, que es una respuesta válida.
  phase      text check (phase is null or phase in
               ('preseason', 'inseason', 'postseason', 'offseason', 'return', 'other')),
  -- Qué le hace a la carga. Texto libre con los valores conocidos porque cada
  -- modelo tiene los suyos y el modo libre no tiene ninguno.
  kind       text,
  start_date date not null,
  end_date   date not null,
  focus      text,
  -- Lo que se esperaba de carga, para poder comparar con lo que pasó. Las
  -- unidades son las mismas que events.au: minutos por RPE.
  target_load int,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists training_blocks_plan_idx on public.training_blocks(plan_id, start_date);

drop trigger if exists training_blocks_touch on public.training_blocks;
create trigger training_blocks_touch before update on public.training_blocks
  for each row execute function public.touch_updated_at();

-- Las sesiones NO guardan a qué etapa pertenecen: caen en la que cubre su
-- fecha. Mover una etapa reacomoda todo solo y borrarla no toca ni una sesión.
-- La alternativa —un block_id en events— es más precisa y más frágil: hay que
-- mantenerla al mover fechas, y una sesión puede quedar apuntando a una etapa
-- que ya no la cubre sin que nada lo note.

alter table public.training_plans  enable row level security;
alter table public.training_blocks enable row level security;

-- El entrenador planifica; el atleta ve en qué etapa está. Que sepa que esta
-- semana es de descarga y no de base es la mitad de que la cumpla.
drop policy if exists training_plans_select on public.training_plans;
create policy training_plans_select on public.training_plans
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

drop policy if exists training_plans_write on public.training_plans;
create policy training_plans_write on public.training_plans
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );

drop policy if exists training_blocks_select on public.training_blocks;
create policy training_blocks_select on public.training_blocks
  for select using (
    exists (select 1 from public.training_plans p
            join public.athletes a on a.id = p.athlete_id
            where p.id = plan_id
              and (public.is_workspace_member(a.workspace_id)
                   or a.id in (select public.my_athlete_ids())))
  );

drop policy if exists training_blocks_write on public.training_blocks;
create policy training_blocks_write on public.training_blocks
  for all using (
    exists (select 1 from public.training_plans p
            join public.athletes a on a.id = p.athlete_id
            where p.id = plan_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.training_plans p
            join public.athletes a on a.id = p.athlete_id
            where p.id = plan_id and public.is_workspace_member(a.workspace_id))
  );
