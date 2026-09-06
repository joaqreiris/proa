-- ── Suplementación ─────────────────────────────────────────────────────────
--
-- No son comida y por eso no van en el catálogo de alimentos. Un magnesio no se
-- pesa en gramos ni aporta calorías: tiene una dosis —400 mg, dos cápsulas— y
-- sobre todo un CUÁNDO, que es la mitad de la indicación. El mismo suplemento
-- antes de dormir o antes de entrenar no es lo mismo.
--
-- Meterlos como alimentos de cero calorías habría funcionado y habría estado
-- mal: la cantidad en gramos no significa nada, el momento no se podría
-- escribir, y aparecerían en la búsqueda de comida ensuciándola.
create table if not exists public.athlete_supplements (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  position   int  not null default 0,
  name       text not null,
  -- Texto libre a propósito: las dosis vienen en mg, en UI, en cápsulas, en
  -- gramos y en cucharadas. Un número con unidad fija dejaría afuera la mitad.
  dose       text,
  timing     text check (timing is null or timing in
               ('wake','breakfast','lunch','dinner','pre_training','post_training','bed','anytime')),
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athlete_supplements_idx on public.athlete_supplements(athlete_id, position);

drop trigger if exists athlete_supplements_touch on public.athlete_supplements;
create trigger athlete_supplements_touch before update on public.athlete_supplements
  for each row execute function public.touch_updated_at();

alter table public.athlete_supplements enable row level security;

-- Las dos puertas: el entrenador ve y edita lo de su espacio; el atleta VE lo
-- suyo. Acá no escribe: la suplementación la indica el entrenador, no se
-- autoprescribe.
drop policy if exists athlete_supplements_select on public.athlete_supplements;
create policy athlete_supplements_select on public.athlete_supplements
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

drop policy if exists athlete_supplements_write on public.athlete_supplements;
create policy athlete_supplements_write on public.athlete_supplements
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );
