-- ── Qué se está buscando, no solo cuántas calorías ─────────────────────────
--
-- La tabla guardaba el resultado —kcal y macros— pero no la intención. Y sin la
-- intención, un número no se puede revisar: 2.400 kcal es un déficit o un
-- superávit según a dónde va el atleta, y dentro de un mes nadie se acuerda de
-- por qué se puso ese número.
--
-- Además, guardar el peso con el que se calculó permite darse cuenta de que la
-- meta quedó vieja: si el atleta bajó cuatro kilos, esas calorías ya no son las
-- que se pensaron.
alter table public.nutrition_targets
  add column if not exists goal text
    check (goal is null or goal in ('fat_loss', 'maintain', 'muscle_gain')),
  add column if not exists weight_kg      numeric(5,1),
  add column if not exists protein_per_kg numeric(4,2),
  add column if not exists fat_per_kg     numeric(4,2);

comment on column public.nutrition_targets.goal is
  'Qué se busca: perder grasa, mantener o ganar músculo. Define el ajuste sobre el gasto.';
comment on column public.nutrition_targets.weight_kg is
  'El peso con el que se hizo el cálculo, para saber si la meta quedó vieja.';
