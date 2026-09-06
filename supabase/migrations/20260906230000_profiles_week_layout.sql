-- La orientación de la semana es de cada persona, no del espacio de trabajo.
--
-- El entrenador suele querer la semana entera de un vistazo (un día por fila)
-- y el que la va a hacer suele querer ver bien su día (un día por columna).
-- Con el espacio como dueño de la preferencia, un atleta con dos entrenadores
-- vería su semana cambiar de forma según quién se la armó.
--
-- Es opcional a propósito: null significa «lo de fábrica», y así no hay que
-- rellenar las filas que ya existen.
alter table public.profiles
  add column if not exists week_layout text
  check (week_layout is null or week_layout in ('rows', 'cols'));

comment on column public.profiles.week_layout is
  'Orientación de la semana: rows = un día por fila, cols = un día por columna. Null = la de fábrica.';
