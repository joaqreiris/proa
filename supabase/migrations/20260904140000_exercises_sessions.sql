-- =============================================================================
-- Tramo 3 — biblioteca de ejercicios y contenido de las sesiones
-- =============================================================================

-- ── Biblioteca ───────────────────────────────────────────────────────────────
-- workspace_id NULL = catálogo de Proa, lo ve todo el mundo.
-- workspace_id con valor = ejercicio propio del entrenador, solo suyo.
-- Una biblioteca vacía es un callejón sin salida: por eso el catálogo viene
-- cargado desde el primer día.
create table if not exists public.exercises (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  key          text,                       -- solo los del catálogo
  name         text not null,              -- inglés, canónico
  name_es      text,
  name_pt      text,
  category     text,
  muscle_group text,
  equipment    text,
  complexity   text check (complexity is null or complexity in ('low','medium','high')),
  purpose      text,
  video_url    text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- La clave solo tiene que ser única dentro del catálogo: un entrenador puede
-- tener su propia versión de «back squat» sin chocar con la de fábrica.
create unique index if not exists exercises_key_catalog_idx
  on public.exercises(key) where workspace_id is null;
create index if not exists exercises_ws_idx  on public.exercises(workspace_id);
create index if not exists exercises_cat_idx on public.exercises(category);

drop trigger if exists exercises_touch on public.exercises;
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

-- ── Contenido de una sesión ──────────────────────────────────────────────────
-- Bloques con ejercicios dentro, colgando de un evento del calendario. Sirve
-- igual para gimnasio y para campo: un trabajo de campo también son bloques.
create table if not exists public.session_blocks (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  position   int  not null default 0,
  title      text,
  kind       text not null default 'main'
             check (kind in ('warmup','main','accessory','circuit','cooldown')),
  rounds     int,                          -- para circuitos
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists session_blocks_event_idx on public.session_blocks(event_id, position);

create table if not exists public.session_items (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.session_blocks(id) on delete cascade,
  position    int  not null default 0,
  exercise_id uuid references public.exercises(id) on delete set null,
  -- El nombre se copia al agregar: si mañana se borra el ejercicio de la
  -- biblioteca, la sesión que ya se hizo no puede quedarse sin decir qué era.
  name        text not null,
  sets        int,
  -- Texto y no número a propósito: un preparador escribe «6-8», «30 s», «máx».
  reps        text,
  load        text,                        -- «80%», «40 kg», «RPE 8»
  rest_s      int,
  tempo       text,                        -- «3-1-1-0»
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists session_items_block_idx on public.session_items(block_id, position);

-- =============================================================================
-- Reglas de acceso
-- =============================================================================
alter table public.exercises      enable row level security;
alter table public.session_blocks enable row level security;
alter table public.session_items  enable row level security;

-- Biblioteca: el catálogo lo ve cualquiera con sesión; lo propio, su dueño.
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));

drop policy if exists exercises_write on public.exercises;
create policy exercises_write on public.exercises
  for all using (workspace_id is not null and public.is_workspace_member(workspace_id))
  with check (workspace_id is not null and public.is_workspace_member(workspace_id));

-- Quién puede tocar el contenido de un evento. Va en una función para no
-- repetir el doble salto (evento → atleta → espacio) en cada política.
create or replace function public.can_edit_event(p_event uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.events e
      join public.athletes a on a.id = e.athlete_id
     where e.id = p_event and public.is_workspace_member(a.workspace_id)
  );
$$;

create or replace function public.can_see_event(p_event uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.events e
      join public.athletes a on a.id = e.athlete_id
     where e.id = p_event
       and (public.is_workspace_member(a.workspace_id)
            or a.id in (select public.my_athlete_ids()))
  );
$$;

drop policy if exists blocks_select on public.session_blocks;
create policy blocks_select on public.session_blocks
  for select using (public.can_see_event(event_id));

drop policy if exists blocks_write on public.session_blocks;
create policy blocks_write on public.session_blocks
  for all using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

drop policy if exists items_select on public.session_items;
create policy items_select on public.session_items
  for select using (
    exists (select 1 from public.session_blocks b
            where b.id = block_id and public.can_see_event(b.event_id))
  );

drop policy if exists items_write on public.session_items;
create policy items_write on public.session_items
  for all using (
    exists (select 1 from public.session_blocks b
            where b.id = block_id and public.can_edit_event(b.event_id))
  ) with check (
    exists (select 1 from public.session_blocks b
            where b.id = block_id and public.can_edit_event(b.event_id))
  );
-- Catálogo de ejercicios de Proa: 120 entradas.
-- Vienen del catálogo por defecto de ClavaMetrics, traducidas a español y
-- portugués. Los ejercicios que crearon clubes clientes NO se copian.
insert into public.exercises (key, name, name_es, name_pt, category, muscle_group, equipment, complexity, purpose)
values
  ('5_10_5_pro_agility', '5-10-5 Pro Agility', '5-10-5 Pro Agility', '5-10-5 Pro Agility', 'speed', 'Tren inferior', 'Conos', 'medium', 'power'),
  ('90_90_hip_switch', '90/90 Hip Switch', 'Cambio de cadera 90/90', 'Troca de quadril 90/90', 'mobility', 'Caderas', null, 'low', 'warmup'),
  ('a_skip', 'A-Skip', 'A-Skip', 'A-Skip', 'speed', 'Tren inferior', null, 'low', 'power'),
  ('ab_wheel_rollout', 'Ab Wheel Rollout', 'Rueda abdominal', 'Roda abdominal', 'core', 'Core', 'Rueda', 'high', 'strength'),
  ('acceleration_sprint_10_20_m', 'Acceleration Sprint (10–20 m)', 'Sprint de aceleración (10–20 m)', 'Sprint de aceleração (10–20 m)', 'speed', 'Tren inferior', null, 'medium', 'power'),
  ('airplane_single_leg', 'Airplane (single-leg)', 'Avión (a una pierna)', 'Avião (uma perna)', 'balance', 'Glúteos / Cadena posterior', null, 'medium', 'prevention'),
  ('ankle_dorsiflexion_rock', 'Ankle Dorsiflexion Rock', 'Balanceo de dorsiflexión de tobillo', 'Balanço de dorsiflexão de tornozelo', 'mobility', 'Tobillo', null, 'low', 'warmup'),
  ('atg_split_squat', 'ATG Split Squat', 'Zancada ATG', 'Afundo ATG', 'prehab', 'Cuádriceps / Rodilla', null, 'medium', 'prevention'),
  ('b_skip', 'B-Skip', 'B-Skip', 'B-Skip', 'speed', 'Tren inferior', null, 'medium', 'power'),
  ('back_squat', 'Back Squat', 'Sentadilla trasera', 'Agachamento com barra atrás', 'strength', 'Cuádriceps / Glúteos', 'Barra', 'high', 'strength'),
  ('banded_ankle_mobilization', 'Banded Ankle Mobilization', 'Movilización de tobillo con banda', 'Mobilização de tornozelo com elástico', 'mobility', 'Tobillo', 'Banda', 'low', 'warmup'),
  ('banded_external_rotation', 'Banded External Rotation', 'Rotación externa con banda', 'Rotação externa com elástico', 'prehab', 'Manguito rotador', 'Banda', 'low', 'prevention'),
  ('banded_lateral_walk', 'Banded Lateral Walk', 'Caminata lateral con banda', 'Caminhada lateral com elástico', 'activation', 'Glúteo medio', 'Mini-banda', 'low', 'activation'),
  ('banded_pull_apart', 'Banded Pull-apart', 'Apertura con banda', 'Abertura com elástico', 'activation', 'Espalda alta', 'Banda', 'low', 'activation'),
  ('barbell_row', 'Barbell Row', 'Remo con barra', 'Remada com barra', 'strength', 'Espalda alta / Dorsales', 'Barra', 'medium', 'strength'),
  ('battle_ropes', 'Battle Ropes', 'Cuerdas de batalla', 'Cordas navais', 'conditioning', 'Tren superior / Core', 'Cuerdas', 'low', 'conditioning'),
  ('bear_crawl', 'Bear Crawl', 'Marcha del oso', 'Marcha do urso', 'core', 'Core / Hombros', null, 'low', 'strength'),
  ('bench_press', 'Bench Press', 'Press de banca', 'Supino reto', 'strength', 'Pectoral / Tríceps', 'Barra', 'medium', 'strength'),
  ('bike_intervals', 'Bike Intervals', 'Intervalos en bici', 'Intervalos na bike', 'conditioning', 'Cuerpo completo', 'Bici', 'medium', 'conditioning'),
  ('bike_steady_state', 'Bike Steady-State', 'Bici continua', 'Bike contínua', 'conditioning', 'Cuerpo completo', 'Bici', 'low', 'conditioning'),
  ('bird_dog', 'Bird Dog', 'Bird dog', 'Bird dog', 'activation', 'Core / Glúteos', null, 'low', 'activation'),
  ('bosu_squat', 'Bosu Squat', 'Sentadilla en Bosu', 'Agachamento no Bosu', 'balance', 'Tren inferior', 'Bosu', 'medium', 'prevention'),
  ('box_jump', 'Box Jump', 'Salto al cajón', 'Salto na caixa', 'power', 'Tren inferior', 'Cajón', 'medium', 'power'),
  ('broad_jump', 'Broad Jump', 'Salto horizontal', 'Salto horizontal', 'power', 'Tren inferior', null, 'medium', 'power'),
  ('bulgarian_split_squat', 'Bulgarian Split Squat', 'Sentadilla búlgara', 'Agachamento búlgaro', 'strength', 'Cuádriceps / Glúteos', 'Mancuernas', 'medium', 'strength'),
  ('cable_woodchop', 'Cable Woodchop', 'Leñador en polea', 'Lenhador na polia', 'core', 'Oblicuos', 'Polea', 'low', 'strength'),
  ('calf_raise_bent_knee_soleus', 'Calf Raise (bent knee / soleus)', 'Elevación de talón (rodilla flexionada)', 'Elevação de panturrilha (joelho fletido)', 'prehab', 'Sóleo', 'Escalón', 'low', 'prevention'),
  ('calf_raise_straight_knee', 'Calf Raise (straight knee)', 'Elevación de talón (rodilla extendida)', 'Elevação de panturrilha (joelho estendido)', 'prehab', 'Gemelos', 'Escalón', 'low', 'prevention'),
  ('calf_stretch_wall', 'Calf Stretch (wall)', 'Estiramiento de gemelos (pared)', 'Alongamento de panturrilha (parede)', 'cooldown', 'Gemelos', 'Pared', 'low', 'cooldown'),
  ('cat_camel', 'Cat-Camel', 'Gato-camello', 'Gato-camelo', 'mobility', 'Columna', null, 'low', 'warmup'),
  ('child_s_pose', 'Child''s Pose', 'Postura del niño', 'Postura da criança', 'cooldown', 'Columna / Dorsales', null, 'low', 'cooldown'),
  ('clamshell', 'Clamshell', 'Almeja', 'Concha', 'activation', 'Glúteo medio', 'Mini-banda', 'low', 'activation'),
  ('clean_pull', 'Clean Pull', 'Tirón de cargada', 'Puxada de clean', 'olympic', 'Cadena posterior', 'Barra', 'medium', 'power'),
  ('conventional_deadlift', 'Conventional Deadlift', 'Peso muerto convencional', 'Levantamento terra convencional', 'strength', 'Cadena posterior', 'Barra', 'high', 'strength'),
  ('copenhagen_plank', 'Copenhagen Plank', 'Plancha Copenhague', 'Prancha Copenhague', 'prehab', 'Aductores', 'Banco', 'medium', 'prevention'),
  ('couch_stretch', 'Couch Stretch', 'Estiramiento de sofá', 'Alongamento do sofá', 'cooldown', 'Flexores de cadera / Cuádriceps', 'Pared', 'low', 'cooldown'),
  ('countermovement_jump', 'Countermovement Jump', 'Salto con contramovimiento', 'Salto com contramovimento', 'power', 'Tren inferior', null, 'low', 'power'),
  ('dead_bug', 'Dead Bug', 'Dead bug', 'Dead bug', 'activation', 'Core', null, 'low', 'activation'),
  ('deceleration_drill', 'Deceleration Drill', 'Ejercicio de desaceleración', 'Exercício de desaceleração', 'speed', 'Tren inferior', 'Conos', 'medium', 'prevention'),
  ('deep_squat_hold_prying', 'Deep Squat Hold (prying)', 'Sentadilla profunda sostenida', 'Agachamento profundo sustentado', 'mobility', 'Caderas / Tobillos', null, 'low', 'warmup'),
  ('depth_jump', 'Depth Jump', 'Salto en profundidad', 'Salto em profundidade', 'power', 'Tren inferior', 'Cajón', 'high', 'power'),
  ('diaphragmatic_breathing', 'Diaphragmatic Breathing', 'Respiración diafragmática', 'Respiração diafragmática', 'cooldown', 'Recuperación', null, 'low', 'cooldown'),
  ('drop_stick_landing', 'Drop & Stick Landing', 'Caída y frenado', 'Queda e aterrissagem firme', 'power', 'Tren inferior', 'Cajón', 'low', 'prevention'),
  ('eccentric_heel_drop', 'Eccentric Heel Drop', 'Descenso excéntrico de talón', 'Descida excêntrica de calcanhar', 'prehab', 'Aquiles / Gemelo', 'Escalón', 'low', 'prevention'),
  ('flying_sprint_max_velocity', 'Flying Sprint (max velocity)', 'Sprint lanzado (velocidad máxima)', 'Sprint lançado (velocidade máxima)', 'speed', 'Tren inferior', null, 'high', 'power'),
  ('foam_roll_it_band_glutes', 'Foam Roll IT Band / Glutes', 'Rodillo: banda iliotibial y glúteos', 'Rolo: banda iliotibial e glúteos', 'cooldown', 'Glúteos / Cara lateral del muslo', 'Rodillo', 'low', 'release'),
  ('foam_roll_quads', 'Foam Roll Quads', 'Rodillo: cuádriceps', 'Rolo: quadríceps', 'cooldown', 'Cuádriceps', 'Rodillo', 'low', 'release'),
  ('front_plank', 'Front Plank', 'Plancha frontal', 'Prancha frontal', 'core', 'Core', null, 'low', 'strength'),
  ('front_squat', 'Front Squat', 'Sentadilla frontal', 'Agachamento frontal', 'strength', 'Cuádriceps', 'Barra', 'high', 'strength'),
  ('glute_bridge', 'Glute Bridge', 'Puente de glúteos', 'Ponte de glúteos', 'activation', 'Glúteos', null, 'low', 'activation'),
  ('goblet_squat', 'Goblet Squat', 'Sentadilla goblet', 'Agachamento goblet', 'strength', 'Cuádriceps / Glúteos', 'Kettlebell / Mancuerna', 'low', 'strength'),
  ('hamstring_slider_curl', 'Hamstring Slider Curl', 'Curl de isquios con deslizadores', 'Flexão de isquiotibiais com sliders', 'prehab', 'Isquiotibiales', 'Deslizadores', 'medium', 'prevention'),
  ('hang_power_clean', 'Hang Power Clean', 'Cargada de potencia desde suspensión', 'Clean de potência suspenso', 'olympic', 'Cuerpo completo', 'Barra', 'high', 'power'),
  ('hang_power_snatch', 'Hang Power Snatch', 'Arranque de potencia desde suspensión', 'Snatch de potência suspenso', 'olympic', 'Cuerpo completo', 'Barra', 'high', 'power'),
  ('hanging_leg_raise', 'Hanging Leg Raise', 'Elevación de piernas colgado', 'Elevação de pernas suspenso', 'core', 'Flexores de cadera / Core', 'Barra fija', 'medium', 'strength'),
  ('hip_flexor_rock_back', 'Hip Flexor Rock-back', 'Balanceo de flexores de cadera', 'Balanço de flexores de quadril', 'mobility', 'Caderas', null, 'low', 'warmup'),
  ('hip_flexor_stretch', 'Hip Flexor Stretch', 'Estiramiento de flexores de cadera', 'Alongamento de flexores de quadril', 'cooldown', 'Flexores de cadera', null, 'low', 'cooldown'),
  ('hip_thrust', 'Hip Thrust', 'Empuje de cadera', 'Elevação pélvica', 'strength', 'Glúteos', 'Barra', 'low', 'strength'),
  ('hollow_hold', 'Hollow Hold', 'Hollow hold', 'Hollow hold', 'core', 'Core', null, 'low', 'strength'),
  ('hurdle_hops', 'Hurdle Hops', 'Saltos sobre vallas', 'Saltos sobre barreiras', 'power', 'Tren inferior', 'Vallas', 'medium', 'power'),
  ('incline_dumbbell_press', 'Incline Dumbbell Press', 'Press inclinado con mancuernas', 'Supino inclinado com halteres', 'strength', 'Pectoral / Hombros', 'Mancuernas', 'medium', 'strength'),
  ('incline_treadmill_walk', 'Incline Treadmill Walk', 'Caminata en cinta inclinada', 'Caminhada na esteira inclinada', 'conditioning', 'Tren inferior', 'Cinta', 'low', 'conditioning'),
  ('kettlebell_clean', 'Kettlebell Clean', 'Cargada con kettlebell', 'Clean com kettlebell', 'olympic', 'Cuerpo completo', 'Kettlebell', 'medium', 'power'),
  ('kettlebell_swing', 'Kettlebell Swing', 'Balanceo con kettlebell', 'Swing com kettlebell', 'olympic', 'Glúteos / Isquiotibiales', 'Kettlebell', 'low', 'power'),
  ('ladder_quick_feet', 'Ladder Quick Feet', 'Escalera de agilidad: pies rápidos', 'Escada de agilidade: pés rápidos', 'speed', 'Tren inferior', 'Escalera', 'low', 'power'),
  ('lateral_bound', 'Lateral Bound', 'Salto lateral', 'Salto lateral', 'power', 'Tren inferior', null, 'medium', 'power'),
  ('medicine_ball_rotational_throw', 'Medicine Ball Rotational Throw', 'Lanzamiento rotacional con balón medicinal', 'Arremesso rotacional com bola medicinal', 'power', 'Core', 'Balón medicinal', 'low', 'power'),
  ('medicine_ball_slam', 'Medicine Ball Slam', 'Golpe con balón medicinal', 'Arremesso ao solo com bola medicinal', 'power', 'Core / Cuerpo completo', 'Balón medicinal', 'low', 'power'),
  ('monster_walk', 'Monster Walk', 'Caminata monster', 'Caminhada monster', 'activation', 'Glúteos', 'Mini-banda', 'low', 'activation'),
  ('nordic_hamstring_curl', 'Nordic Hamstring Curl', 'Curl nórdico de isquios', 'Flexão nórdica de isquiotibiais', 'prehab', 'Isquiotibiales', 'Compañero', 'high', 'prevention'),
  ('open_book', 'Open Book', 'Libro abierto', 'Livro aberto', 'mobility', 'Columna dorsal', null, 'low', 'warmup'),
  ('overhead_press', 'Overhead Press', 'Press militar', 'Desenvolvimento militar', 'strength', 'Hombros', 'Barra', 'medium', 'strength'),
  ('pallof_press', 'Pallof Press', 'Press Pallof', 'Press Pallof', 'core', 'Core', 'Polea / Banda', 'low', 'strength'),
  ('pigeon_stretch', 'Pigeon Stretch', 'Estiramiento de paloma', 'Alongamento do pombo', 'cooldown', 'Glúteos / Caderas', null, 'low', 'cooldown'),
  ('pogo_hops', 'Pogo Hops', 'Saltos pogo', 'Saltos pogo', 'power', 'Gemelos / Tobillo', null, 'low', 'power'),
  ('power_clean', 'Power Clean', 'Cargada de potencia', 'Clean de potência', 'olympic', 'Cuerpo completo', 'Barra', 'high', 'power'),
  ('prone_y_t_w', 'Prone Y-T-W', 'Y-T-W en prono', 'Y-T-W em prono', 'activation', 'Trapecio inferior / Manguito', null, 'low', 'activation'),
  ('pull_up', 'Pull-up', 'Dominada', 'Barra fixa', 'strength', 'Dorsales / Espalda alta', 'Barra fija', 'high', 'strength'),
  ('push_jerk', 'Push Jerk', 'Envión de fuerza', 'Push jerk', 'olympic', 'Hombros / Piernas', 'Barra', 'high', 'power'),
  ('push_press', 'Push Press', 'Press de empuje', 'Push press', 'olympic', 'Hombros / Piernas', 'Barra', 'medium', 'power'),
  ('quadruped_t_spine_reach', 'Quadruped T-spine Reach', 'Alcance torácico en cuadrupedia', 'Alcance torácico em quatro apoios', 'mobility', 'Columna dorsal', null, 'low', 'warmup'),
  ('resisted_sprint_band_sled', 'Resisted Sprint (band / sled)', 'Sprint resistido (banda / trineo)', 'Sprint resistido (elástico / trenó)', 'speed', 'Tren inferior', 'Banda / Trineo', 'medium', 'power'),
  ('reverse_crunch', 'Reverse Crunch', 'Crunch invertido', 'Abdominal invertido', 'core', 'Abdomen inferior', null, 'low', 'strength'),
  ('reverse_nordic', 'Reverse Nordic', 'Nórdico inverso', 'Nórdico invertido', 'prehab', 'Cuádriceps', 'Colchoneta', 'medium', 'prevention'),
  ('romanian_deadlift', 'Romanian Deadlift', 'Peso muerto rumano', 'Levantamento terra romeno', 'strength', 'Isquiotibiales / Glúteos', 'Barra', 'medium', 'strength'),
  ('rowing_intervals', 'Rowing Intervals', 'Intervalos en remo', 'Intervalos no remo', 'conditioning', 'Cuerpo completo', 'Remo', 'medium', 'conditioning'),
  ('russian_twist', 'Russian Twist', 'Giro ruso', 'Giro russo', 'core', 'Oblicuos', 'Balón medicinal', 'low', 'strength'),
  ('scapular_push_up', 'Scapular Push-up', 'Flexión escapular', 'Flexão escapular', 'prehab', 'Serrato', null, 'low', 'prevention'),
  ('scapular_wall_slide', 'Scapular Wall Slide', 'Deslizamiento escapular en pared', 'Deslizamento escapular na parede', 'activation', 'Hombros', 'Pared', 'low', 'activation'),
  ('shuttle_runs', 'Shuttle Runs', 'Carreras de ida y vuelta', 'Corridas de vai e vem', 'conditioning', 'Cuerpo completo', 'Conos', 'medium', 'conditioning'),
  ('side_plank', 'Side Plank', 'Plancha lateral', 'Prancha lateral', 'core', 'Core lateral', null, 'low', 'strength'),
  ('single_arm_dumbbell_row', 'Single-Arm Dumbbell Row', 'Remo a una mano con mancuerna', 'Remada unilateral com halter', 'strength', 'Dorsales / Espalda alta', 'Mancuerna', 'low', 'strength'),
  ('single_leg_balance', 'Single-Leg Balance', 'Equilibrio a una pierna', 'Equilíbrio em uma perna', 'balance', 'Tobillo / Cadera', null, 'low', 'prevention'),
  ('single_leg_balance_perturbation', 'Single-Leg Balance + Perturbation', 'Equilibrio a una pierna con perturbación', 'Equilíbrio em uma perna com perturbação', 'balance', 'Tobillo / Cadera', 'Banda / Compañero', 'medium', 'prevention'),
  ('single_leg_glute_bridge', 'Single-Leg Glute Bridge', 'Puente de glúteos a una pierna', 'Ponte de glúteos em uma perna', 'activation', 'Glúteos', null, 'low', 'activation'),
  ('single_leg_hop_stick', 'Single-Leg Hop & Stick', 'Salto a una pierna con frenado', 'Salto em uma perna com aterrissagem firme', 'power', 'Tren inferior', null, 'medium', 'power'),
  ('single_leg_rdl', 'Single-Leg RDL', 'Peso muerto rumano a una pierna', 'Levantamento terra romeno unilateral', 'balance', 'Isquiotibiales / Glúteos', 'Mancuerna', 'medium', 'prevention'),
  ('skierg_intervals', 'SkiErg Intervals', 'Intervalos en SkiErg', 'Intervalos no SkiErg', 'conditioning', 'Cuerpo completo', 'SkiErg', 'medium', 'conditioning'),
  ('sled_drag_backward', 'Sled Drag (backward)', 'Arrastre de trineo hacia atrás', 'Arrasto de trenó para trás', 'conditioning', 'Cuádriceps / Rodilla', 'Trineo', 'low', 'prevention'),
  ('sled_push', 'Sled Push', 'Empuje de trineo', 'Empurrada de trenó', 'conditioning', 'Cuerpo completo', 'Trineo', 'medium', 'conditioning'),
  ('spiderman_lunge', 'Spiderman Lunge', 'Zancada spiderman', 'Afundo spiderman', 'mobility', 'Caderas / Ingle', null, 'low', 'warmup'),
  ('squat_jump', 'Squat Jump', 'Salto desde sentadilla', 'Salto a partir do agachamento', 'power', 'Tren inferior', null, 'low', 'power'),
  ('standing_hamstring_stretch', 'Standing Hamstring Stretch', 'Estiramiento de isquios de pie', 'Alongamento de isquiotibiais em pé', 'cooldown', 'Isquiotibiales', null, 'low', 'cooldown'),
  ('step_up', 'Step-up', 'Subida al cajón', 'Subida no banco', 'strength', 'Cuádriceps / Glúteos', 'Mancuernas / Cajón', 'low', 'strength'),
  ('stir_the_pot', 'Stir the Pot', 'Revolver la olla', 'Mexer a panela', 'core', 'Core', 'Fitball', 'medium', 'strength'),
  ('suitcase_carry', 'Suitcase Carry', 'Transporte maleta', 'Carregamento maleta', 'core', 'Core / Agarre', 'Mancuerna / Kettlebell', 'low', 'strength'),
  ('t_drill', 'T-Drill', 'Test en T', 'Teste em T', 'speed', 'Tren inferior', 'Conos', 'medium', 'power'),
  ('tandem_stance_hold', 'Tandem Stance Hold', 'Apoyo en tándem', 'Apoio em tandem', 'balance', 'Tobillo / Cadera', null, 'low', 'prevention'),
  ('tempo_run', 'Tempo Run', 'Carrera a ritmo', 'Corrida em ritmo', 'conditioning', 'Cuerpo completo', null, 'low', 'conditioning'),
  ('thoracic_foam_roll', 'Thoracic Foam Roll', 'Rodillo torácico', 'Rolo torácico', 'cooldown', 'Columna dorsal', 'Rodillo', 'low', 'release'),
  ('thoracic_spine_rotation', 'Thoracic Spine Rotation', 'Rotación torácica', 'Rotação torácica', 'mobility', 'Columna dorsal', null, 'low', 'warmup'),
  ('tibialis_raise', 'Tibialis Raise', 'Elevación de tibial', 'Elevação de tibial', 'prehab', 'Tibial', 'Pared', 'low', 'prevention'),
  ('trap_bar_deadlift', 'Trap-Bar Deadlift', 'Peso muerto con barra hexagonal', 'Levantamento terra com barra hexagonal', 'strength', 'Cadena posterior / Cuádriceps', 'Barra hexagonal', 'medium', 'strength'),
  ('walking_lunge', 'Walking Lunge', 'Zancada caminando', 'Afundo caminhando', 'strength', 'Cuádriceps / Glúteos', 'Mancuernas', 'low', 'strength'),
  ('wall_slides_shoulder', 'Wall Slides (shoulder)', 'Deslizamiento en pared (hombro)', 'Deslizamento na parede (ombro)', 'mobility', 'Hombros', 'Pared', 'low', 'warmup'),
  ('wicket_runs', 'Wicket Runs', 'Carreras entre vallas bajas', 'Corridas entre barreiras baixas', 'speed', 'Tren inferior', 'Vallas bajas', 'medium', 'power'),
  ('wobble_board_hold', 'Wobble Board Hold', 'Sostén en plato de equilibrio', 'Sustentação na prancha de equilíbrio', 'balance', 'Tobillo', 'Plato de equilibrio', 'low', 'prevention'),
  ('world_s_greatest_stretch', 'World''s Greatest Stretch', 'El mejor estiramiento del mundo', 'O melhor alongamento do mundo', 'mobility', 'Cuerpo completo', null, 'low', 'warmup'),
  ('wrist_flexor_extensor_eccentrics', 'Wrist Flexor/Extensor Eccentrics', 'Excéntricos de muñeca', 'Excêntricos de punho', 'prehab', 'Antebrazo', 'Mancuerna', 'low', 'prevention'),
  ('y_balance_reach', 'Y-Balance Reach', 'Alcance Y-Balance', 'Alcance Y-Balance', 'balance', 'Tren inferior', null, 'low', 'prevention')
on conflict (key) where workspace_id is null do update set
  name = excluded.name, name_es = excluded.name_es, name_pt = excluded.name_pt,
  category = excluded.category, muscle_group = excluded.muscle_group,
  equipment = excluded.equipment, complexity = excluded.complexity,
  purpose = excluded.purpose;

-- =============================================================================
-- Copiar la semana también copia el CONTENIDO de cada sesión
-- =============================================================================
-- Antes solo duplicaba los eventos: la semana copiada quedaba con los bloques
-- vacíos, que es justo lo que un entrenador NO quiere copiar a mano.
create or replace function public.copy_week(
  p_athlete_id uuid, p_from date, p_to date, p_replace boolean default false
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ws    uuid;
  v_shift int;
  v_count int := 0;
  r       record;
  b       record;
  v_new   uuid;
  v_blk   uuid;
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

  for r in
    select * from public.events
     where athlete_id = p_athlete_id and date >= p_from and date < p_from + 7
     order by date, start_time
  loop
    insert into public.events (athlete_id, date, start_time, end_time, type, title, notes, location, created_by)
    values (r.athlete_id, r.date + v_shift, r.start_time, r.end_time, r.type, r.title, r.notes, r.location, auth.uid())
    returning id into v_new;
    v_count := v_count + 1;

    for b in select * from public.session_blocks where event_id = r.id order by position loop
      insert into public.session_blocks (event_id, position, title, kind, rounds, notes)
      values (v_new, b.position, b.title, b.kind, b.rounds, b.notes)
      returning id into v_blk;

      insert into public.session_items (block_id, position, exercise_id, name, sets, reps, load, rest_s, tempo, notes)
      select v_blk, position, exercise_id, name, sets, reps, load, rest_s, tempo, notes
        from public.session_items where block_id = b.id order by position;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.copy_week(uuid, date, date, boolean) from public;
grant execute on function public.copy_week(uuid, date, date, boolean) to authenticated;
