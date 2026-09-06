-- Color propio de un bloque.
--
-- Los nueve colores de los tipos de trabajo siguen siendo fijos para todos: en
-- que se aprendan está su valor, y si cada entrenador los repinta una captura
-- compartida deja de entenderse. Esto es otra cosa: pintar UN bloque distinto
-- para que salte a la vista —el partido importante, la sesión que no se puede
-- mover— sin tocar lo que significa el naranja.
--
-- Null es lo normal y quiere decir «el color de su tipo». Guardar el color del
-- tipo copiado en cada fila sería peor: el día que se ajuste la paleta, los
-- bloques viejos se quedarían con el color anterior.
alter table public.events
  add column if not exists color text
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.events.color is
  'Color propio del bloque, #rrggbb. Null = el de su tipo, que es lo normal.';
