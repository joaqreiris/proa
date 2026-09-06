-- ── El peso en el tiempo ────────────────────────────────────────────────────
--
-- Sin esto, el objetivo nutricional es una cuenta y nada más. El gasto se
-- ESTIMA con una fórmula, y las fórmulas se equivocan: dos personas del mismo
-- peso y altura pueden gastar cuatrocientas calorías distintas. La única forma
-- de saber si el número estaba bien es mirar qué pasó con el peso.
--
-- Una fila por día como mucho: pesarse dos veces el mismo día no agrega
-- información, agrega ruido.
create table if not exists public.body_weights (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  date       date not null,
  weight_kg  numeric(5,1) not null check (weight_kg > 20 and weight_kg < 400),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, date)
);

create index if not exists body_weights_athlete_idx on public.body_weights(athlete_id, date desc);

drop trigger if exists body_weights_touch on public.body_weights;
create trigger body_weights_touch before update on public.body_weights
  for each row execute function public.touch_updated_at();

alter table public.body_weights enable row level security;

-- Las dos puertas de siempre: el entrenador ve lo de su espacio, el atleta lo
-- suyo.
drop policy if exists body_weights_select on public.body_weights;
create policy body_weights_select on public.body_weights
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

-- Escriben los dos. El que se pesa es el atleta, pero muchas veces lo dice por
-- mensaje y lo anota el entrenador; negárselo obligaría a llevarlo aparte.
drop policy if exists body_weights_write on public.body_weights;
create policy body_weights_write on public.body_weights
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );
