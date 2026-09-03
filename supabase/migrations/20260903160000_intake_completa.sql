-- =============================================================================
-- Anamnesis completa
-- =============================================================================
-- La primera versión se quedaba corta: faltaban los datos personales del alta y
-- toda la parte de salud, que en un trabajo uno a uno es lo primero que hay que
-- saber. Un preparador que no sabe que su atleta es asmático o que está tomando
-- algo, planifica a ciegas.
-- =============================================================================

-- ── Datos del alta ───────────────────────────────────────────────────────────
alter table public.athletes add column if not exists phone text;
alter table public.athletes add column if not exists level text;
alter table public.athletes add column if not exists dominant_side text;

alter table public.athletes drop constraint if exists athletes_level_check;
alter table public.athletes add constraint athletes_level_check
  check (level is null or level in ('youth','amateur','semipro','pro','other'));

alter table public.athletes drop constraint if exists athletes_dominant_side_check;
alter table public.athletes add constraint athletes_dominant_side_check
  check (dominant_side is null or dominant_side in ('right','left','both'));

-- ── Anamnesis ────────────────────────────────────────────────────────────────

-- Contacto de emergencia. Trabajando uno a uno, muchas veces el entrenador es
-- la única persona presente si algo pasa.
alter table public.athlete_intake add column if not exists emergency_name     text;
alter table public.athlete_intake add column if not exists emergency_phone    text;
alter table public.athlete_intake add column if not exists emergency_relation text;

-- Salud. Esto es lo que más faltaba.
alter table public.athlete_intake add column if not exists conditions       text;  -- diagnósticos
alter table public.athlete_intake add column if not exists medication       text;
alter table public.athlete_intake add column if not exists allergies        text;
alter table public.athlete_intake add column if not exists surgeries        text;
alter table public.athlete_intake add column if not exists family_history   text;  -- antecedentes cardiovasculares
alter table public.athlete_intake add column if not exists medical_clearance      boolean;
alter table public.athlete_intake add column if not exists medical_clearance_date date;
alter table public.athlete_intake add column if not exists smokes  text;
alter table public.athlete_intake add column if not exists alcohol text;

alter table public.athlete_intake drop constraint if exists athlete_intake_smokes_check;
alter table public.athlete_intake add constraint athlete_intake_smokes_check
  check (smokes is null or smokes in ('no','occasional','yes'));

alter table public.athlete_intake drop constraint if exists athlete_intake_alcohol_check;
alter table public.athlete_intake add constraint athlete_intake_alcohol_check
  check (alcohol is null or alcohol in ('no','occasional','frequent'));

-- Lesiones, con más detalle
alter table public.athlete_intake add column if not exists pain_areas     text;
alter table public.athlete_intake add column if not exists longest_layoff text;

-- Entrenamiento
alter table public.athlete_intake add column if not exists lifting_experience text;
alter table public.athlete_intake add column if not exists current_training   text;
alter table public.athlete_intake add column if not exists avoid_exercises    text;
alter table public.athlete_intake add column if not exists preferences        text;

alter table public.athlete_intake drop constraint if exists athlete_intake_lifting_check;
alter table public.athlete_intake add constraint athlete_intake_lifting_check
  check (lifting_experience is null or lifting_experience in ('none','beginner','intermediate','advanced'));

-- Nutrición
alter table public.athlete_intake add column if not exists meals_per_day     int;
alter table public.athlete_intake add column if not exists food_restrictions text;
alter table public.athlete_intake add column if not exists hydration         text;
alter table public.athlete_intake add column if not exists target_weight     numeric(5,1);

alter table public.athlete_intake drop constraint if exists athlete_intake_meals_check;
alter table public.athlete_intake add constraint athlete_intake_meals_check
  check (meals_per_day is null or meals_per_day between 1 and 10);

-- Sueño y recuperación
alter table public.athlete_intake add column if not exists bedtime          time;
alter table public.athlete_intake add column if not exists waketime         time;
alter table public.athlete_intake add column if not exists naps             text;
alter table public.athlete_intake add column if not exists recovery_methods text;
alter table public.athlete_intake add column if not exists stress_level     int;

alter table public.athlete_intake drop constraint if exists athlete_intake_stress_check;
alter table public.athlete_intake add constraint athlete_intake_stress_check
  check (stress_level is null or stress_level between 1 and 5);

-- Objetivo con fecha
alter table public.athlete_intake add column if not exists target_date date;
alter table public.athlete_intake add column if not exists key_event   text;
