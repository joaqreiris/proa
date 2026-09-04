-- =============================================================================
-- Menú del día
-- =============================================================================
-- Una comida es un EVENTO del calendario, igual que una sesión de gimnasio: el
-- entrenador pone «Almuerzo 13:00» en la semana y ahí adentro escribe el menú.
-- Así los totales del día salen de sumar los eventos de tipo comida de esa
-- fecha, sin inventar una entidad «día» aparte.

-- ── Catálogo de alimentos ───────────────────────────────────────────────────
-- Mismo modelo que los ejercicios: workspace_id NULL es el catálogo de Proa y
-- lo ve todo el mundo; con valor, es del entrenador.
-- Todos los valores son POR 100 g de porción comestible.
create table if not exists public.foods (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name         text not null,
  name_es      text,
  name_pt      text,
  food_group   text,
  kcal         numeric(6,1) not null default 0,
  protein_g    numeric(5,1) not null default 0,
  carbs_g      numeric(5,1) not null default 0,
  fats_g       numeric(5,1) not null default 0,
  fiber_g      numeric(5,1) not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists foods_name_catalog_idx
  on public.foods(name) where workspace_id is null;
create index if not exists foods_ws_idx    on public.foods(workspace_id);
create index if not exists foods_group_idx on public.foods(food_group);

drop trigger if exists foods_touch on public.foods;
create trigger foods_touch before update on public.foods
  for each row execute function public.touch_updated_at();

-- ── Lo que se come en esa comida ────────────────────────────────────────────
-- Igual que en las sesiones: el nombre se COPIA al agregar. Si mañana se borra
-- el alimento del catálogo, el menú que ya se planificó no puede quedarse sin
-- decir qué era.
--
-- Los macros también se copian en la fila, calculados a la cantidad. Un
-- alimento puede corregirse después (los valores de tabla cambian) y eso no
-- debe reescribir lo que se comió la semana pasada.
create table if not exists public.meal_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  position   int  not null default 0,
  food_id    uuid references public.foods(id) on delete set null,
  name       text not null,
  qty_g      numeric(7,1),          -- gramos o mililitros
  qty_text   text,                  -- «1 taza», «2 rebanadas» cuando no hay peso
  kcal       numeric(7,1) not null default 0,
  protein_g  numeric(6,1) not null default 0,
  carbs_g    numeric(6,1) not null default 0,
  fats_g     numeric(6,1) not null default 0,
  fiber_g    numeric(6,1) not null default 0,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists meal_items_event_idx on public.meal_items(event_id, position);

-- ── Objetivos del atleta ────────────────────────────────────────────────────
-- Sin un objetivo contra el que comparar, el total de un menú es un número
-- suelto. Se guarda por atleta y lo puede recalcular el entrenador cuando
-- cambia el peso o la etapa.
create table if not exists public.nutrition_targets (
  athlete_id  uuid primary key references public.athletes(id) on delete cascade,
  formula     text,                 -- qué fórmula se usó para el metabolismo basal
  rmr         int,                  -- metabolismo en reposo, kcal/día
  activity    numeric(3,2),         -- factor de actividad
  kcal        int,                  -- objetivo diario
  protein_g   int,
  carbs_g     int,
  fats_g      int,
  notes       text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

drop trigger if exists nutrition_targets_touch on public.nutrition_targets;
create trigger nutrition_targets_touch before update on public.nutrition_targets
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- Reglas de acceso
-- =============================================================================
alter table public.foods             enable row level security;
alter table public.meal_items        enable row level security;
alter table public.nutrition_targets enable row level security;

drop policy if exists foods_select on public.foods;
create policy foods_select on public.foods
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));

drop policy if exists foods_write on public.foods;
create policy foods_write on public.foods
  for all using (workspace_id is not null and public.is_workspace_member(workspace_id))
  with check (workspace_id is not null and public.is_workspace_member(workspace_id));

drop policy if exists meal_items_select on public.meal_items;
create policy meal_items_select on public.meal_items
  for select using (public.can_see_event(event_id));

drop policy if exists meal_items_write on public.meal_items;
create policy meal_items_write on public.meal_items
  for all using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

-- Objetivos: el entrenador los define, el atleta los ve.
drop policy if exists targets_select on public.nutrition_targets;
create policy targets_select on public.nutrition_targets
  for select using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
    or athlete_id in (select public.my_athlete_ids())
  );

drop policy if exists targets_write on public.nutrition_targets;
create policy targets_write on public.nutrition_targets
  for all using (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  ) with check (
    exists (select 1 from public.athletes a
            where a.id = athlete_id and public.is_workspace_member(a.workspace_id))
  );
insert into public.foods (name_es, name, name_pt, food_group, kcal, protein_g, carbs_g, fats_g, fiber_g)
values
  ('Pechuga de pollo', 'Chicken breast', 'Peito de frango', 'meat', 120, 23, 0, 2.6, 0),
  ('Muslo de pollo', 'Chicken thigh', 'Coxa de frango', 'meat', 177, 19, 0, 11, 0),
  ('Carne vacuna magra', 'Lean beef', 'Carne bovina magra', 'meat', 143, 21, 0, 6, 0),
  ('Carne vacuna picada 80/20', 'Ground beef 80/20', 'Carne moída 80/20', 'meat', 254, 17, 0, 20, 0),
  ('Lomo de cerdo', 'Pork loin', 'Lombo suíno', 'meat', 143, 21, 0, 6, 0),
  ('Pavo', 'Turkey breast', 'Peito de peru', 'meat', 111, 24, 0, 1.5, 0),
  ('Jamón cocido', 'Cooked ham', 'Presunto cozido', 'meat', 107, 18, 1.5, 3, 0),
  ('Cordero', 'Lamb', 'Cordeiro', 'meat', 202, 20, 0, 13, 0),
  ('Salmón', 'Salmon', 'Salmão', 'fish', 208, 20, 0, 13, 0),
  ('Atún al natural', 'Canned tuna in water', 'Atum em água', 'fish', 108, 24, 0, 1, 0),
  ('Merluza', 'Hake', 'Merluza', 'fish', 90, 18, 0, 2, 0),
  ('Sardina', 'Sardine', 'Sardinha', 'fish', 208, 25, 0, 11, 0),
  ('Camarón', 'Shrimp', 'Camarão', 'fish', 99, 24, 0.2, 0.3, 0),
  ('Bacalao', 'Cod', 'Bacalhau', 'fish', 82, 18, 0, 0.7, 0),
  ('Huevo entero', 'Whole egg', 'Ovo inteiro', 'dairy', 143, 13, 0.7, 10, 0),
  ('Clara de huevo', 'Egg white', 'Clara de ovo', 'dairy', 52, 11, 0.7, 0.2, 0),
  ('Leche entera', 'Whole milk', 'Leite integral', 'dairy', 61, 3.2, 4.8, 3.3, 0),
  ('Leche descremada', 'Skim milk', 'Leite desnatado', 'dairy', 34, 3.4, 5, 0.1, 0),
  ('Yogur natural', 'Plain yogurt', 'Iogurte natural', 'dairy', 61, 3.5, 4.7, 3.3, 0),
  ('Yogur griego', 'Greek yogurt', 'Iogurte grego', 'dairy', 97, 9, 3.6, 5, 0),
  ('Queso fresco', 'Fresh cheese', 'Queijo fresco', 'dairy', 98, 11, 3.4, 4.3, 0),
  ('Queso curado', 'Aged cheese', 'Queijo curado', 'dairy', 402, 25, 1.3, 33, 0),
  ('Requesón', 'Cottage cheese', 'Queijo cottage', 'dairy', 98, 11, 3.4, 4.3, 0),
  ('Manteca', 'Butter', 'Manteiga', 'dairy', 717, 0.9, 0.1, 81, 0),
  ('Arroz blanco cocido', 'White rice, cooked', 'Arroz branco cozido', 'grain', 130, 2.7, 28, 0.3, 0.4),
  ('Arroz integral cocido', 'Brown rice, cooked', 'Arroz integral cozido', 'grain', 112, 2.6, 24, 0.9, 1.8),
  ('Pasta cocida', 'Pasta, cooked', 'Macarrão cozido', 'grain', 131, 5, 25, 1.1, 1.8),
  ('Pan blanco', 'White bread', 'Pão branco', 'grain', 265, 9, 49, 3.2, 2.7),
  ('Pan integral', 'Wholemeal bread', 'Pão integral', 'grain', 247, 13, 41, 3.4, 7),
  ('Avena', 'Oats', 'Aveia', 'grain', 389, 17, 66, 7, 11),
  ('Quinoa cocida', 'Quinoa, cooked', 'Quinoa cozida', 'grain', 120, 4.4, 21, 1.9, 2.8),
  ('Papa cocida', 'Boiled potato', 'Batata cozida', 'grain', 87, 2, 20, 0.1, 1.8),
  ('Batata cocida', 'Sweet potato, boiled', 'Batata-doce cozida', 'grain', 76, 1.4, 18, 0.1, 2.5),
  ('Maíz', 'Corn', 'Milho', 'grain', 86, 3.2, 19, 1.2, 2.7),
  ('Tortilla de maíz', 'Corn tortilla', 'Tortilha de milho', 'grain', 218, 5.7, 45, 2.9, 6),
  ('Lentejas cocidas', 'Lentils, cooked', 'Lentilhas cozidas', 'legume', 116, 9, 20, 0.4, 8),
  ('Garbanzos cocidos', 'Chickpeas, cooked', 'Grão-de-bico cozido', 'legume', 164, 9, 27, 2.6, 8),
  ('Porotos negros cocidos', 'Black beans, cooked', 'Feijão preto cozido', 'legume', 132, 9, 24, 0.5, 9),
  ('Soja texturizada', 'Textured soy', 'Soja texturizada', 'legume', 336, 52, 30, 1.5, 18),
  ('Tofu', 'Tofu', 'Tofu', 'legume', 76, 8, 1.9, 4.8, 0.3),
  ('Brócoli', 'Broccoli', 'Brócolis', 'veg', 34, 2.8, 7, 0.4, 2.6),
  ('Espinaca', 'Spinach', 'Espinafre', 'veg', 23, 2.9, 3.6, 0.4, 2.2),
  ('Tomate', 'Tomato', 'Tomate', 'veg', 18, 0.9, 3.9, 0.2, 1.2),
  ('Lechuga', 'Lettuce', 'Alface', 'veg', 15, 1.4, 2.9, 0.2, 1.3),
  ('Zanahoria', 'Carrot', 'Cenoura', 'veg', 41, 0.9, 10, 0.2, 2.8),
  ('Zapallito', 'Zucchini', 'Abobrinha', 'veg', 17, 1.2, 3.1, 0.3, 1),
  ('Pimiento', 'Bell pepper', 'Pimentão', 'veg', 31, 1, 6, 0.3, 2.1),
  ('Cebolla', 'Onion', 'Cebola', 'veg', 40, 1.1, 9, 0.1, 1.7),
  ('Palta', 'Avocado', 'Abacate', 'veg', 160, 2, 9, 15, 7),
  ('Champiñones', 'Mushrooms', 'Cogumelos', 'veg', 22, 3.1, 3.3, 0.3, 1),
  ('Banana', 'Banana', 'Banana', 'fruit', 89, 1.1, 23, 0.3, 2.6),
  ('Manzana', 'Apple', 'Maçã', 'fruit', 52, 0.3, 14, 0.2, 2.4),
  ('Naranja', 'Orange', 'Laranja', 'fruit', 47, 0.9, 12, 0.1, 2.4),
  ('Frutillas', 'Strawberries', 'Morangos', 'fruit', 32, 0.7, 7.7, 0.3, 2),
  ('Arándanos', 'Blueberries', 'Mirtilos', 'fruit', 57, 0.7, 14, 0.3, 2.4),
  ('Uva', 'Grapes', 'Uva', 'fruit', 69, 0.7, 18, 0.2, 0.9),
  ('Kiwi', 'Kiwi', 'Kiwi', 'fruit', 61, 1.1, 15, 0.5, 3),
  ('Melón', 'Melon', 'Melão', 'fruit', 34, 0.8, 8, 0.2, 0.9),
  ('Dátiles', 'Dates', 'Tâmaras', 'fruit', 282, 2.5, 75, 0.4, 8),
  ('Pasas de uva', 'Raisins', 'Uvas passas', 'fruit', 299, 3.1, 79, 0.5, 3.7),
  ('Almendras', 'Almonds', 'Amêndoas', 'nuts', 579, 21, 22, 50, 12),
  ('Nueces', 'Walnuts', 'Nozes', 'nuts', 654, 15, 14, 65, 7),
  ('Maní', 'Peanuts', 'Amendoim', 'nuts', 567, 26, 16, 49, 9),
  ('Mantequilla de maní', 'Peanut butter', 'Pasta de amendoim', 'nuts', 588, 25, 20, 50, 6),
  ('Semillas de chía', 'Chia seeds', 'Sementes de chia', 'nuts', 486, 17, 42, 31, 34),
  ('Castañas de cajú', 'Cashews', 'Castanha de caju', 'nuts', 553, 18, 30, 44, 3.3),
  ('Aceite de oliva', 'Olive oil', 'Azeite de oliva', 'fat', 884, 0, 0, 100, 0),
  ('Aceite de girasol', 'Sunflower oil', 'Óleo de girassol', 'fat', 884, 0, 0, 100, 0),
  ('Jugo de naranja', 'Orange juice', 'Suco de laranja', 'drink', 45, 0.7, 10, 0.2, 0.2),
  ('Bebida deportiva', 'Sports drink', 'Bebida esportiva', 'drink', 26, 0, 6.5, 0, 0),
  ('Leche chocolatada', 'Chocolate milk', 'Achocolatado', 'drink', 83, 3.2, 13, 2.4, 0.5),
  ('Proteína de suero', 'Whey protein', 'Whey protein', 'supp', 380, 78, 8, 5, 0),
  ('Caseína', 'Casein', 'Caseína', 'supp', 370, 75, 8, 3, 0),
  ('Creatina', 'Creatine', 'Creatina', 'supp', 0, 0, 0, 0, 0),
  ('Maltodextrina', 'Maltodextrin', 'Maltodextrina', 'supp', 380, 0, 95, 0, 0),
  ('Barra de proteína', 'Protein bar', 'Barra de proteína', 'supp', 370, 30, 38, 10, 5),
  ('Miel', 'Honey', 'Mel', 'other', 304, 0.3, 82, 0, 0.2),
  ('Chocolate amargo 70%', 'Dark chocolate 70%', 'Chocolate amargo 70%', 'other', 579, 8, 46, 42, 11),
  ('Hummus', 'Hummus', 'Homus', 'other', 166, 8, 14, 10, 6)
on conflict (name) where workspace_id is null do nothing;

-- ── Copiar la semana se lleva también los menús ─────────────────────────────
create or replace function public.copy_week(
  p_athlete_id uuid, p_from date, p_to date, p_replace boolean default false
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid; v_shift int; v_count int := 0;
  r record; b record; i record;
  v_new uuid; v_blk uuid; v_item uuid;
begin
  select workspace_id into v_ws from public.athletes where id = p_athlete_id;
  if v_ws is null then raise exception 'athlete_not_found'; end if;
  if not public.is_workspace_member(v_ws) then raise exception 'not_allowed'; end if;
  if p_from = p_to then raise exception 'same_week'; end if;

  v_shift := p_to - p_from;

  if p_replace then
    delete from public.events
     where athlete_id = p_athlete_id and date >= p_to and date < p_to + 7;
  end if;

  for r in select * from public.events
            where athlete_id = p_athlete_id and date >= p_from and date < p_from + 7
            order by date, start_time loop

    insert into public.events
      (athlete_id, date, start_time, end_time, type, title, notes, location, status, created_by)
    values
      (r.athlete_id, r.date + v_shift, r.start_time, r.end_time, r.type, r.title,
       r.notes, r.location, 'planned', auth.uid())
    returning id into v_new;
    v_count := v_count + 1;

    for b in select * from public.session_blocks where event_id = r.id order by position loop
      insert into public.session_blocks
        (event_id, position, title, kind, method, rounds, rest_s, duration_min, rpe, notes)
      values
        (v_new, b.position, b.title, b.kind, b.method, b.rounds, b.rest_s,
         b.duration_min, b.rpe, b.notes)
      returning id into v_blk;

      for i in select * from public.session_items where block_id = b.id order by position loop
        insert into public.session_items
          (block_id, position, exercise_id, name, sets, reps, load, rest_s, tempo, side, mode, notes)
        values
          (v_blk, i.position, i.exercise_id, i.name, i.sets, i.reps, i.load,
           i.rest_s, i.tempo, i.side, i.mode, i.notes)
        returning id into v_item;

        insert into public.session_sets (item_id, position, reps, load, rest_s, tempo, note)
        select v_item, position, reps, load, rest_s, tempo, note
          from public.session_sets where item_id = i.id order by position;
      end loop;
    end loop;

    -- Los menús se copian igual que las sesiones.
    insert into public.meal_items
      (event_id, position, food_id, name, qty_g, qty_text, kcal, protein_g, carbs_g, fats_g, fiber_g, notes)
    select v_new, position, food_id, name, qty_g, qty_text, kcal, protein_g, carbs_g, fats_g, fiber_g, notes
      from public.meal_items where event_id = r.id order by position;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.copy_week(uuid, date, date, boolean) from public;
grant execute on function public.copy_week(uuid, date, date, boolean) to authenticated;
