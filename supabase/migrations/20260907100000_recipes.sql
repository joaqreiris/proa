-- ── Platos armados ─────────────────────────────────────────────────────────
--
-- Una boloñesa son siete alimentos cargados de a uno. Y la semana que viene,
-- otra vez. Un plato que se repite se arma una vez y se usa siempre.
--
-- Los ingredientes se guardan en GRAMOS y apuntando al alimento del catálogo,
-- no con sus calorías copiadas: si mañana se corrige un valor del catálogo, la
-- receta se corrige sola. Lo que sí se copia es lo que se manda al menú, porque
-- ahí sí importa que el plan de la semana pasada no cambie solo.
create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  notes        text,
  -- Para cuántas porciones rinde lo que está cargado. Sirve para mandar «media
  -- receta» al menú sin rehacer las cuentas a mano.
  servings     numeric(4,1) not null default 1 check (servings > 0),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists recipes_ws_idx on public.recipes(workspace_id, name);

drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

create table if not exists public.recipe_items (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  position   int  not null default 0,
  food_id    uuid references public.foods(id) on delete set null,
  -- El nombre se guarda igual que el food_id: si el alimento se borra del
  -- catálogo, la receta sigue diciendo qué llevaba.
  name       text not null,
  qty_g      numeric(7,1),
  unit_qty   numeric(6,2),
  created_at timestamptz not null default now()
);

create index if not exists recipe_items_recipe_idx on public.recipe_items(recipe_id, position);

alter table public.recipes      enable row level security;
alter table public.recipe_items enable row level security;

-- Las recetas son del espacio de trabajo: las arma el entrenador y las usa en
-- cualquiera de sus atletas. El atleta no las toca — no es él quien planifica.
drop policy if exists recipes_all on public.recipes;
create policy recipes_all on public.recipes
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists recipe_items_all on public.recipe_items;
create policy recipe_items_all on public.recipe_items
  for all using (
    exists (select 1 from public.recipes r
            where r.id = recipe_id and public.is_workspace_member(r.workspace_id))
  ) with check (
    exists (select 1 from public.recipes r
            where r.id = recipe_id and public.is_workspace_member(r.workspace_id))
  );
