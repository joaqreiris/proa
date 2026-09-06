-- ── Fuera del catálogo ─────────────────────────────────────────────────────
--
-- Decisión de producto, tomada el 2026-09-07: Proa es una app de salud y su
-- catálogo no ofrece lo que un preparador no le indicaría a nadie. Que se pueda
-- elegir de una lista es una forma de recomendarlo.
--
-- Se van el alcohol, la azúcar suelta y sus vehículos, y los condimentos que son
-- casi solo grasa o azúcar añadida.
--
-- Lo que se comió igual se puede anotar a mano, con sus calorías, así que el
-- registro no queda ciego — pero cuesta más, que es exactamente la intención.
--
-- Las comidas ya cargadas NO se rompen: meal_items guarda el nombre y los
-- macros copiados, y food_id queda en null (on delete set null). Esas filas
-- pasan a comportarse como escritas a mano.
delete from public.foods
 where workspace_id is null
   and name_es in (
     'Mayonesa',            -- 680 kcal, casi todo grasa
     'Kétchup',             -- azúcar añadida en forma de condimento
     'Cerveza',             -- alcohol
     'Gaseosa',             -- azúcar líquida
     'Gaseosa sin azúcar',  -- sin azúcar, pero tampoco aporta nada
     'Helado',
     'Azúcar',              -- endulzar es un hábito, no un alimento del plan
     'Mermelada'
   );

-- Lo que se queda, y por qué, para que no vuelva a discutirse cada vez:
--   Miel                   endulzante con uso deportivo real (carbo rápido).
--   Chocolate amargo 70%   se usa, y tiene evidencia a favor.
--   Leche chocolatada      bebida de recuperación clásica por su proporción
--                          de carbohidrato y proteína.
--   Jugo de naranja        es fruta, aunque líquida.
--   Maltodextrina, gel     nutrición deportiva, no golosinas.
