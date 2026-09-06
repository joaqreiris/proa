-- ── Lo que falta para armar un plato de verdad ─────────────────────────────
--
-- Una boloñesa se puede cargar casi entera: estaban la carne picada, la pasta,
-- la cebolla y la zanahoria. Faltaba la salsa, que es la mitad del plato.
--
-- Van las tres formas en que se usa el tomate en la cocina, porque no son
-- intercambiables: la salsa lista ronda las 24 kcal por 100 g, el triturado 38
-- y el concentrado 82 — más de tres veces la primera, porque es lo mismo sin
-- agua. Cargar concentrado creyendo que es salsa multiplica el número por tres.
--
-- Y el queso para rallar, que en un plato de pasta no es un detalle: dos
-- cucharadas son cuarenta calorías, casi todas de grasa.
insert into public.foods (name_es, name, name_pt, food_group, kcal, protein_g, carbs_g, fats_g, fiber_g, unit_name, unit_g) values
  ('Salsa de tomate',       'Tomato sauce',    'Molho de tomate',      'veg',    24,  1.2,   5.3,  0.2, 1.5, 'cup',  245),
  ('Tomate triturado',      'Crushed tomatoes','Tomate triturado',     'veg',    38,  1.7,   9.0,  0.2, 1.9, 'cup',  250),
  ('Concentrado de tomate', 'Tomato paste',    'Extrato de tomate',    'veg',    82,  4.3,  18.9,  0.5, 4.1, 'tbsp',  16),
  ('Queso rallado',         'Grated cheese',   'Queijo ralado',        'dairy', 392, 35.8,   3.2, 25.8, 0.0, 'tbsp',   5),
  ('Harina de trigo',       'Wheat flour',     'Farinha de trigo',     'grain', 364, 10.3,  76.3,  1.0, 2.7, 'cup',  125),
  ('Pan rallado',           'Breadcrumbs',     'Farinha de rosca',     'grain', 395, 13.4,  71.9,  5.3, 4.5, 'cup',  108)
on conflict (name) where workspace_id is null do nothing;
