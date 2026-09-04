-- =============================================================================
-- Tipos de bloque, duración y RPE
-- =============================================================================
-- Cuatro secciones genéricas (entrada en calor / principal / accesorios /
-- vuelta a la calma) se quedaban cortas: un preparador no piensa «principal»,
-- piensa «fuerza», «pliometría», «miofascial». Se pasa a los once tipos reales,
-- cada uno con su color, su icono y sus valores de arranque.
--
-- Y entran duración y RPE por bloque, que es de donde sale la CARGA: las
-- unidades arbitrarias son minutos × RPE, la métrica estándar de sRPE. Sin
-- ellas no hay forma de decir cuánto pesó una semana.

alter table public.session_blocks add column if not exists duration_min int;
alter table public.session_blocks add column if not exists rpe int;

alter table public.session_blocks drop constraint if exists session_blocks_rpe_check;
alter table public.session_blocks add constraint session_blocks_rpe_check
  check (rpe is null or rpe between 1 and 10);

alter table public.session_blocks drop constraint if exists session_blocks_duration_check;
alter table public.session_blocks add constraint session_blocks_duration_check
  check (duration_min is null or duration_min between 0 and 300);

-- Carga en unidades arbitrarias, calculada por la base. Como columna generada
-- no puede quedar desincronizada, y deja sumar la carga de una semana sin
-- recalcular nada del lado del navegador.
alter table public.session_blocks drop column if exists au;
alter table public.session_blocks
  add column au int generated always as (coalesce(duration_min, 0) * coalesce(rpe, 0)) stored;

-- Las cuatro secciones viejas se traducen a los tipos nuevos.
alter table public.session_blocks drop constraint if exists session_blocks_kind_check;
update public.session_blocks set kind = 'str'    where kind in ('main', 'accessory');
update public.session_blocks set kind = 'cool'   where kind = 'cooldown';
update public.session_blocks set kind = 'warmup' where kind not in
  ('warmup','myo','mob','act','str','plyo','skills','field','cond','cool','assess');

alter table public.session_blocks add constraint session_blocks_kind_check
  check (kind in ('warmup','myo','mob','act','str','plyo','skills','field','cond','cool','assess'));
alter table public.session_blocks alter column kind set default 'str';
