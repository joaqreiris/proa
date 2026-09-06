-- ── Más pescado ────────────────────────────────────────────────────────────
--
-- Había seis y faltaban los de todos los días. Un atleta que come pescado
-- cuatro veces por semana no come salmón cuatro veces: come lo que hay.
--
-- Valores por 100 g de la parte comestible, cocido o al natural según cómo se
-- come cada uno. El atún en aceite escurrido va aparte del atún al natural:
-- casi el doble de calorías, y elegir el equivocado descuadra el día.
insert into public.foods (name_es, name, name_pt, food_group, kcal, protein_g, carbs_g, fats_g, fiber_g, unit_name, unit_g) values
  ('Trucha',            'Trout',           'Truta',           'fish', 148, 20.8, 0.0,  6.6, 0.0, 'unit', 150),
  ('Tilapia',           'Tilapia',         'Tilápia',         'fish',  96, 20.1, 0.0,  1.7, 0.0, 'unit', 150),
  ('Atún en aceite',    'Tuna in oil',     'Atum em óleo',    'fish', 198, 29.1, 0.0,  8.2, 0.0, 'unit',  56),
  ('Caballa',           'Mackerel',        'Cavala',          'fish', 205, 18.6, 0.0, 13.9, 0.0, 'unit', 150),
  ('Lenguado',          'Sole',            'Linguado',        'fish',  86, 12.4, 0.0,  1.9, 0.0, 'unit', 150),
  ('Pulpo',             'Octopus',         'Polvo',           'fish',  82, 14.9, 2.2,  1.0, 0.0, 'cup',  135),
  ('Calamar',           'Squid',           'Lula',            'fish',  92, 15.6, 3.1,  1.4, 0.0, 'cup',  120),
  ('Mejillones',        'Mussels',         'Mexilhões',       'fish',  86, 11.9, 3.7,  2.2, 0.0, 'cup',  150),
  ('Kanikama',          'Surimi',          'Kani kama',       'fish',  99,  7.6, 15.0, 0.9, 0.0, 'unit',  17)
on conflict (name) where workspace_id is null do nothing;
