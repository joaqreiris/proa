-- ── Cargar comida en unidades, no solo en gramos ───────────────────────────
--
-- Todo estaba en gramos porque los valores del catálogo son por 100 g, que es
-- como vienen las tablas de composición. Pero nadie come «55 gramos de huevo»:
-- come un huevo. Y el que arma el menú tampoco piensa en gramos de banana.
--
-- Con cuánto pesa una unidad, la app hace la cuenta: se elige «2 unidades» y
-- guarda 110 g. Los gramos siguen siendo la fuente de verdad de los macros;
-- la unidad es solo la forma de decirlo.
--
-- Solo lo llevan los alimentos que tienen una unidad natural. Un arroz cocido
-- no la tiene: nadie cuenta arroces. Null significa «este va en gramos».
alter table public.foods
  add column if not exists unit_name text,
  add column if not exists unit_g    numeric(6,1)
    check (unit_g is null or unit_g > 0);

comment on column public.foods.unit_g is
  'Cuánto pesa una unidad de este alimento, en gramos. Null = solo se carga en gramos.';

-- Cuántas unidades se cargaron, cuando se cargó así. Los macros salen SIEMPRE
-- de qty_g; esto existe para poder volver a mostrar «2 huevos» y no «110 g».
alter table public.meal_items
  add column if not exists unit_qty numeric(6,2)
    check (unit_qty is null or unit_qty > 0);

-- Los pesos son de porción común, no de precisión de laboratorio: la idea es
-- que el entrenador no tenga que buscar cuánto pesa un huevo.
update public.foods set unit_name = 'unit', unit_g = v.g
  from (values
    ('Huevo entero', 55), ('Clara de huevo', 33),
    ('Banana', 118), ('Manzana', 182), ('Naranja', 154), ('Kiwi', 75),
    ('Dátiles', 8), ('Tomate', 123), ('Zanahoria', 61), ('Papa cocida', 173),
    ('Batata cocida', 151), ('Palta', 150), ('Cebolla', 110), ('Pimiento', 119),
    ('Zapallito', 196), ('Tortilla de maíz', 26), ('Barra de proteína', 60)
  ) as v(nombre, g)
 where public.foods.name_es = v.nombre and public.foods.workspace_id is null;

update public.foods set unit_name = 'slice', unit_g = v.g
  from (values ('Pan blanco', 30), ('Pan integral', 32), ('Queso curado', 20))
    as v(nombre, g)
 where public.foods.name_es = v.nombre and public.foods.workspace_id is null;

update public.foods set unit_name = 'tbsp', unit_g = v.g
  from (values
    ('Aceite de oliva', 14), ('Aceite de girasol', 14), ('Manteca', 14),
    ('Mantequilla de maní', 16), ('Miel', 21), ('Semillas de chía', 12),
    ('Hummus', 15)
  ) as v(nombre, g)
 where public.foods.name_es = v.nombre and public.foods.workspace_id is null;

update public.foods set unit_name = 'cup', unit_g = v.g
  from (values
    ('Arroz blanco cocido', 158), ('Arroz integral cocido', 195),
    ('Pasta cocida', 140), ('Quinoa cocida', 185), ('Avena', 81),
    ('Lentejas cocidas', 198), ('Garbanzos cocidos', 164),
    ('Porotos negros cocidos', 172), ('Leche entera', 244),
    ('Leche descremada', 245), ('Yogur natural', 245), ('Yogur griego', 227),
    ('Jugo de naranja', 248), ('Leche chocolatada', 250),
    ('Frutillas', 152), ('Arándanos', 148), ('Uva', 151), ('Melón', 156),
    ('Espinaca', 30), ('Brócoli', 91), ('Lechuga', 36), ('Champiñones', 70),
    ('Maíz', 164)
  ) as v(nombre, g)
 where public.foods.name_es = v.nombre and public.foods.workspace_id is null;

update public.foods set unit_name = 'scoop', unit_g = v.g
  from (values ('Proteína de suero', 30), ('Caseína', 33), ('Creatina', 5), ('Maltodextrina', 30))
    as v(nombre, g)
 where public.foods.name_es = v.nombre and public.foods.workspace_id is null;

update public.foods set unit_name = 'handful', unit_g = v.g
  from (values ('Almendras', 28), ('Nueces', 28), ('Maní', 28), ('Castañas de cajú', 28), ('Pasas de uva', 28))
    as v(nombre, g)
 where public.foods.name_es = v.nombre and public.foods.workspace_id is null;
