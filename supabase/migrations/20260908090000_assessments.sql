-- ── Los tests ──────────────────────────────────────────────────────────────
--
-- Hasta ahora Proa medía lo que el atleta HACÍA —minutos, esfuerzo, carga— y
-- nada de lo que el atleta ES. Sin un número que se repita en el tiempo, «está
-- mejor» es una impresión, y la ficha ya prometía evaluaciones: el selector de
-- sexo dice desde el primer día que se usa para sus valores de referencia.
--
-- UNA FILA ES UNA MEDICIÓN. El sprint de 10, 20 y 30 metros se toma en una
-- sola carrera pero se guarda en tres filas, una por distancia. Guardarlo como
-- un solo registro con tres columnas obligaría a una columna nueva cada vez
-- que alguien quiera medir a los 5 metros, y dejaría los 20 metros sin poder
-- graficarse solos, que es justo lo que se mira.
--
-- El lado (izquierdo/derecho) es una columna y no dos tests distintos: la
-- asimetría entre lados es una de las cosas que más dice, y con dos claves
-- separadas habría que adivinar cuáles se comparan entre sí.
create table if not exists public.assessments (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  test_key   text not null,
  date       date not null,
  -- Sin unidad acá: la pone el catálogo del navegador, que es donde vive la
  -- definición del test. Guardarla por fila permitiría que dos mediciones del
  -- mismo test estuvieran en unidades distintas, y entonces la serie no se
  -- puede ni graficar ni promediar.
  value      numeric(10,3) not null,
  side       text check (side is null or side in ('L', 'R')),
  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- El mismo test, el mismo día y el mismo lado es la misma medición. Repetir
  -- no agrega información: el mejor de tres intentos se anota una vez.
  unique (athlete_id, test_key, date, side)
);

create index if not exists assessments_athlete_idx on public.assessments(athlete_id, test_key, date desc);

drop trigger if exists assessments_touch on public.assessments;
create trigger assessments_touch before update on public.assessments
  for each row execute function public.touch_updated_at();

alter table public.assessments enable row level security;

-- Las dos puertas de siempre: el entrenador ve lo de su espacio, el atleta lo
-- suyo. Que el atleta vea su propia evolución es la mitad del sentido de
-- medirlo.
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

-- Escriben los dos, como el peso. Un test a distancia lo toma el atleta con su
-- teléfono: obligarlo a mandarlo por mensaje para que el entrenador lo copie
-- es el paso que sobra.
drop policy if exists assessments_write on public.assessments;
create policy assessments_write on public.assessments
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );
