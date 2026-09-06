-- ── Lo que faltaba en el catálogo ──────────────────────────────────────────
--
-- Las bebidas eran tres y ninguna era café, que es lo primero que come medio
-- mundo. Sin café en la lista, un desayuno real no se puede cargar entero, y lo
-- que no se puede cargar se anota a mano y deja de sumar.
--
-- Los valores son por 100 g o 100 ml, como el resto, de tablas de composición
-- estándar. Las infusiones sin azúcar rondan la nada: están para poder armar el
-- desayuno completo, no porque muevan el total.
--
-- Los pesos de unidad son de porción común, no de laboratorio: una taza de café
-- son 240 ml, una cucharada de aceite 14 g.
insert into public.foods (name_es, name, name_pt, food_group, kcal, protein_g, carbs_g, fats_g, fiber_g, unit_name, unit_g) values
  -- Bebidas: el grupo más flaco del catálogo.
  ('Café',                        'Coffee',              'Café',                  'drink',   1,   0.1,   0.0,  0.0, 0.0, 'cup',  240),
  ('Té',                          'Tea',                 'Chá',                   'drink',   1,   0.0,   0.3,  0.0, 0.0, 'cup',  240),
  ('Mate cebado',                 'Mate',                'Chimarrão',             'drink',   3,   0.2,   0.5,  0.0, 0.0, 'cup',  240),
  ('Agua',                        'Water',               'Água',                  'drink',   0,   0.0,   0.0,  0.0, 0.0, 'cup',  240),
  ('Leche de almendras',          'Almond milk',         'Leite de amêndoas',     'drink',  15,   0.6,   0.6,  1.2, 0.3, 'cup',  240),
  ('Leche de avena',              'Oat milk',            'Leite de aveia',        'drink',  45,   1.0,   7.0,  1.5, 0.8, 'cup',  240),
  ('Gaseosa',                     'Soft drink',          'Refrigerante',          'drink',  42,   0.0,  10.6,  0.0, 0.0, 'cup',  240),
  ('Gaseosa sin azúcar',          'Diet soft drink',     'Refrigerante zero',     'drink',   0,   0.0,   0.1,  0.0, 0.0, 'cup',  240),
  ('Cerveza',                     'Beer',                'Cerveja',               'drink',  43,   0.5,   3.6,  0.0, 0.0, 'cup',  355),
  -- Frutas de todos los días que no estaban.
  ('Pera',                        'Pear',                'Pera',                  'fruit',  57,   0.4,  15.2,  0.1, 3.1, 'unit', 178),
  ('Durazno',                     'Peach',               'Pêssego',               'fruit',  39,   0.9,   9.5,  0.3, 1.5, 'unit', 150),
  ('Ananá',                       'Pineapple',           'Abacaxi',               'fruit',  50,   0.5,  13.1,  0.1, 1.4, 'cup',  165),
  ('Mango',                       'Mango',               'Manga',                 'fruit',  60,   0.8,  15.0,  0.4, 1.6, 'unit', 200),
  ('Sandía',                      'Watermelon',          'Melancia',              'fruit',  30,   0.6,   7.6,  0.2, 0.4, 'cup',  152),
  ('Ciruela',                     'Plum',                'Ameixa',                'fruit',  46,   0.7,  11.4,  0.3, 1.4, 'unit',  66),
  -- Verduras.
  ('Pepino',                      'Cucumber',            'Pepino',                'veg',    15,   0.7,   3.6,  0.1, 0.5, 'unit', 300),
  ('Remolacha',                   'Beetroot',            'Beterraba',             'veg',    43,   1.6,   9.6,  0.2, 2.8, 'unit',  82),
  ('Coliflor',                    'Cauliflower',         'Couve-flor',            'veg',    25,   1.9,   5.0,  0.3, 2.0, 'cup',  107),
  ('Berenjena',                   'Eggplant',            'Berinjela',             'veg',    25,   1.0,   5.9,  0.2, 3.0, 'unit', 458),
  ('Arvejas cocidas',             'Cooked peas',         'Ervilhas cozidas',      'legume', 84,   5.4,  15.6,  0.2, 5.5, 'cup',  160),
  -- Cereales y panificados.
  ('Galletas de arroz',           'Rice cakes',          'Biscoitos de arroz',    'grain', 387,   8.2,  81.5,  2.8, 4.2, 'unit',   9),
  ('Cuscús cocido',               'Cooked couscous',     'Cuscuz cozido',         'grain', 112,   3.8,  23.2,  0.2, 1.4, 'cup',  157),
  ('Granola',                     'Granola',             'Granola',               'grain', 471,  10.0,  64.0, 20.0, 7.0, 'cup',  122),
  -- Y lo que endulza, unta o acompaña, que también entra en la cuenta.
  ('Azúcar',                      'Sugar',               'Açúcar',                'other', 387,   0.0, 100.0,  0.0, 0.0, 'tbsp',  12),
  ('Mermelada',                   'Jam',                 'Geleia',                'other', 278,   0.4,  69.0,  0.1, 1.1, 'tbsp',  20),
  ('Mayonesa',                    'Mayonnaise',          'Maionese',              'other', 680,   1.0,   0.6, 75.0, 0.0, 'tbsp',  14),
  ('Kétchup',                     'Ketchup',             'Ketchup',               'other', 101,   1.7,  25.0,  0.1, 0.3, 'tbsp',  17),
  ('Helado',                      'Ice cream',           'Sorvete',               'other', 207,   3.5,  23.6, 11.0, 0.7, 'cup',  132),
  ('Queso untable',               'Cream cheese',        'Queijo cremoso',        'dairy', 342,   6.0,   4.1, 34.0, 0.0, 'tbsp',  15),
  ('Aceite de coco',              'Coconut oil',         'Óleo de coco',          'fat',   862,   0.0,   0.0,100.0, 0.0, 'tbsp',  14),
  ('Gel energético',              'Energy gel',          'Gel energético',        'supp',  250,   0.0,  62.0,  0.0, 0.0, 'unit',  40)
on conflict (name) where workspace_id is null do nothing;
