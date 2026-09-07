-- ── Suplementos en el catálogo ─────────────────────────────────────────────
--
-- Están en dos lugares y hacen cosas distintas, a propósito:
--
--   athlete_supplements  el PLAN: qué toma siempre, con dosis y momento. Vive
--                        en la ficha y el atleta lo lee como una rutina.
--   foods (grupo supp)   el REGISTRO: que el magnesio de la cena aparezca en
--                        esa comida, junto a lo demás.
--
-- Antes no tenía sentido meterlos acá porque ensuciaban la búsqueda de comida.
-- Con la pestaña de suplementos aparte, ya no: quien busca pollo no los ve.
--
-- Casi todos van en cero calorías, que es la verdad: un magnesio no aporta
-- energía. Los que sí aportan son los que son comida disfrazada de polvo —el
-- colágeno y los aminoácidos son proteína, el omega 3 es grasa— y esos llevan
-- sus valores reales para que el total del día no mienta.
--
-- El orden de la lista los pone primero por evidencia: la creatina y la cafeína
-- tienen respaldo fuerte para rendimiento; el resto es salud o carencias.
insert into public.foods (name_es, name, name_pt, food_group, kcal, protein_g, carbs_g, fats_g, fiber_g, unit_name, unit_g) values
  -- Rendimiento, con respaldo en la literatura.
  ('Cafeína',              'Caffeine',            'Cafeína',              'supp',   0,   0.0, 0.0,   0.0, 0.0, 'tablet', 1),
  ('Beta-alanina',         'Beta-alanine',        'Beta-alanina',         'supp',   0,   0.0, 0.0,   0.0, 0.0, 'scoop',  4),
  ('Bicarbonato de sodio', 'Sodium bicarbonate',  'Bicarbonato de sódio', 'supp',   0,   0.0, 0.0,   0.0, 0.0, 'scoop',  5),
  ('Citrulina malato',     'Citrulline malate',   'Citrulina malato',     'supp',   0,   0.0, 0.0,   0.0, 0.0, 'scoop',  8),
  -- Comida disfrazada de polvo: llevan sus valores de verdad.
  ('Omega 3',              'Omega 3',             'Ômega 3',              'supp', 900,   0.0, 0.0, 100.0, 0.0, 'capsule', 1),
  ('Colágeno hidrolizado', 'Hydrolysed collagen', 'Colágeno hidrolisado', 'supp', 360,  90.0, 0.0,   0.0, 0.0, 'scoop',  10),
  ('Glutamina',            'Glutamine',           'Glutamina',            'supp', 400, 100.0, 0.0,   0.0, 0.0, 'scoop',   5),
  ('Aminoácidos ramificados', 'BCAA',             'BCAA',                 'supp', 400, 100.0, 0.0,   0.0, 0.0, 'scoop',   7),
  -- Vitaminas y minerales: cero calorías, y lo que importa es la dosis.
  ('Magnesio',             'Magnesium',           'Magnésio',             'supp',   0,   0.0, 0.0,   0.0, 0.0, 'capsule', 1),
  ('Vitamina D',           'Vitamin D',           'Vitamina D',           'supp',   0,   0.0, 0.0,   0.0, 0.0, 'capsule', 1),
  ('Vitamina C',           'Vitamin C',           'Vitamina C',           'supp',   0,   0.0, 0.0,   0.0, 0.0, 'tablet',  1),
  ('Complejo B',           'Vitamin B complex',   'Complexo B',           'supp',   0,   0.0, 0.0,   0.0, 0.0, 'capsule', 1),
  ('Multivitamínico',      'Multivitamin',        'Multivitamínico',      'supp',   0,   0.0, 0.0,   0.0, 0.0, 'tablet',  1),
  ('Zinc',                 'Zinc',                'Zinco',                'supp',   0,   0.0, 0.0,   0.0, 0.0, 'tablet',  1),
  ('Hierro',               'Iron',                'Ferro',                'supp',   0,   0.0, 0.0,   0.0, 0.0, 'tablet',  1),
  ('Calcio',               'Calcium',             'Cálcio',               'supp',   0,   0.0, 0.0,   0.0, 0.0, 'tablet',  1),
  ('Probióticos',          'Probiotics',          'Probióticos',          'supp',   0,   0.0, 0.0,   0.0, 0.0, 'capsule', 1),
  ('Melatonina',           'Melatonin',           'Melatonina',           'supp',   0,   0.0, 0.0,   0.0, 0.0, 'tablet',  1)
on conflict (name) where workspace_id is null do nothing;
