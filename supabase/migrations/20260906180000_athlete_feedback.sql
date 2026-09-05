-- ── El ida y vuelta: lo que el atleta devuelve ─────────────────────────────
--
-- Hasta acá Proa era de una sola mano: el entrenador escribía y nunca se
-- enteraba de qué había pasado. Esto abre la vuelta.
--
-- Son dos cosas distintas y conviene no mezclarlas:
--
--   1. LO QUE PASÓ CON UNA SESIÓN. Se hizo o no, cuánto duró de verdad, qué
--      tan dura le resultó. Vive en el evento, porque es de esa sesión.
--   2. CÓMO AMANECIÓ. Sueño, piernas, energía, ánimo, cabeza. No es de ninguna
--      sesión: es del día. Por eso es una tabla aparte, con una fila por
--      atleta y día.
--
-- La carga interna (sRPE) sale de multiplicar los minutos por el esfuerzo
-- percibido. Es la medida más barata que existe para saber cuánto le costó
-- algo a alguien: no hace falta ningún aparato, solo preguntarle.

-- ── 1. Lo que el atleta reporta de una sesión ──────────────────────────────
alter table public.events add column if not exists rpe          smallint;
alter table public.events add column if not exists actual_min   int;
alter table public.events add column if not exists athlete_note text;
alter table public.events add column if not exists done_at      timestamptz;

alter table public.events drop constraint if exists events_rpe_check;
alter table public.events add constraint events_rpe_check
  check (rpe is null or rpe between 1 and 10);

alter table public.events drop constraint if exists events_actual_min_check;
alter table public.events add constraint events_actual_min_check
  check (actual_min is null or (actual_min >= 0 and actual_min <= 600));

-- La carga se calcula sola. Que sea una columna generada y no una cuenta de la
-- pantalla significa que vale lo mismo mire quien mire y se pueda sumar,
-- ordenar y comparar desde la base.
alter table public.events add column if not exists au int
  generated always as (
    case when rpe is null or actual_min is null then null else actual_min * rpe end
  ) stored;

comment on column public.events.rpe is 'Esfuerzo percibido 1-10, lo pone el atleta.';
comment on column public.events.actual_min is 'Cuánto duró DE VERDAD, no lo planificado.';
comment on column public.events.au is 'Carga interna (sRPE) = minutos reales × esfuerzo.';

-- ── 2. Cómo amaneció ───────────────────────────────────────────────────────
--
-- Las cinco preguntas van TODAS en la misma dirección: 1 es lo peor y 5 lo
-- mejor. Parece un detalle y no lo es — en la mitad de los cuestionarios que
-- circulan, un 5 en «dolor muscular» es malo y un 5 en «ánimo» es bueno, y
-- entonces nadie puede leer la fila de un vistazo. Por eso las columnas se
-- llaman por lo que guardan («piernas frescas», «tranquilidad») y no por el
-- problema («dolor», «estrés»).
create table if not exists public.wellness (
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  date          date not null,
  sleep_h       numeric(3,1) check (sleep_h is null or (sleep_h >= 0 and sleep_h <= 24)),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  legs          smallint check (legs between 1 and 5),   -- 5 = frescas
  energy        smallint check (energy between 1 and 5),
  mood          smallint check (mood between 1 and 5),
  calm          smallint check (calm between 1 and 5),   -- 5 = tranquilo
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (athlete_id, date)
);

-- Suma de las cinco: de 5 a 25, y más alto es mejor siempre.
alter table public.wellness add column if not exists score smallint
  generated always as (
    case
      when sleep_quality is null or legs is null or energy is null
        or mood is null or calm is null then null
      else sleep_quality + legs + energy + mood + calm
    end
  ) stored;

create index if not exists wellness_date_idx on public.wellness(athlete_id, date desc);

drop trigger if exists wellness_touch on public.wellness;
create trigger wellness_touch before update on public.wellness
  for each row execute function public.touch_updated_at();

alter table public.wellness enable row level security;

-- Las dos puertas de siempre: el entrenador ve las de su espacio, el atleta
-- solo las suyas.
drop policy if exists wellness_select on public.wellness;
create policy wellness_select on public.wellness
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

-- Escriben los dos. El parte es del atleta, pero muchas veces se lo dice al
-- entrenador por mensaje y lo carga él: negárselo obligaría a anotarlo aparte,
-- que es exactamente lo que esta app viene a sacar.
drop policy if exists wellness_write on public.wellness;
create policy wellness_write on public.wellness
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

-- ── 3. La única puerta por la que el atleta toca un evento ─────────────────
--
-- El atleta NO tiene permiso de escritura sobre `events`: no puede cambiar el
-- día, el tipo ni los ejercicios de su plan. Solo puede contar qué pasó.
--
-- Eso no se puede expresar con RLS, que decide por FILA y no por columna. Por
-- eso esta función es SECURITY DEFINER: se salta el RLS a propósito, y a
-- cambio comprueba ella misma dos cosas — que el evento sea de un atleta que
-- soy yo, y que solo se toquen las cuatro columnas del parte.
create or replace function public.athlete_log_event(
  p_event  uuid,
  p_status text default null,
  p_rpe    int  default null,
  p_min    int  default null,
  p_note   text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if p_status is not null and p_status not in ('planned', 'done', 'skipped') then
    raise exception 'estado desconocido: %', p_status;
  end if;

  update public.events e
     set status       = coalesce(p_status, e.status),
         rpe          = p_rpe,
         actual_min   = p_min,
         athlete_note = p_note,
         -- La marca de cuándo lo dio por hecho se pone la primera vez y no se
         -- vuelve a mover; si lo desmarca, se borra.
         done_at      = case when coalesce(p_status, e.status) = 'done'
                             then coalesce(e.done_at, now()) else null end
   where e.id = p_event
     and e.athlete_id in (select public.my_athlete_ids())
  returning e.status into v_status;

  if v_status is null then
    raise exception 'esa sesión no es tuya';
  end if;
end $$;

revoke all on function public.athlete_log_event(uuid, text, int, int, text) from public, anon;
grant execute on function public.athlete_log_event(uuid, text, int, int, text) to authenticated;

comment on function public.athlete_log_event(uuid, text, int, int, text) is
  'La única puerta por la que el atleta escribe en events: solo el parte, solo el suyo.';
