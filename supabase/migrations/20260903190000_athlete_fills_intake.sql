-- =============================================================================
-- El atleta completa su propia anamnesis
-- =============================================================================
-- Hasta ahora solo el entrenador podía escribirla: con ocho atletas eso son más
-- de trescientos campos tipeados a mano, con datos que el atleta tiene en la
-- cabeza y el entrenador no. Se le abre la escritura sobre LO SUYO, nada más.
-- =============================================================================

-- Quién la completó. Al entrenador le cambia la lectura: no es lo mismo un dato
-- que puso él de memoria que uno que puso el atleta.
alter table public.athlete_intake add column if not exists completed_by uuid references auth.users(id) on delete set null;

-- ── Anamnesis: el atleta escribe la suya ────────────────────────────────────
drop policy if exists intake_write_athlete on public.athlete_intake;
create policy intake_write_athlete on public.athlete_intake
  for insert with check (athlete_id in (select public.my_athlete_ids()));

drop policy if exists intake_update_athlete on public.athlete_intake;
create policy intake_update_athlete on public.athlete_intake
  for update using (athlete_id in (select public.my_athlete_ids()))
  with check (athlete_id in (select public.my_athlete_ids()));

-- Borrarla no: si el atleta se arrepiente, edita. Perder la anamnesis entera
-- de un toque no le sirve a nadie.

-- ── Horarios fijos: el atleta también carga los suyos ───────────────────────
-- Acá sí puede borrar: son filas sueltas y las va a corregir seguido (cambió
-- el horario de la facultad, dejó el trabajo).
drop policy if exists slots_write_athlete on public.availability_slots;
create policy slots_write_athlete on public.availability_slots
  for insert with check (athlete_id in (select public.my_athlete_ids()));

drop policy if exists slots_update_athlete on public.availability_slots;
create policy slots_update_athlete on public.availability_slots
  for update using (athlete_id in (select public.my_athlete_ids()))
  with check (athlete_id in (select public.my_athlete_ids()));

drop policy if exists slots_delete_athlete on public.availability_slots;
create policy slots_delete_athlete on public.availability_slots
  for delete using (athlete_id in (select public.my_athlete_ids()));

-- La política del entrenador era FOR ALL, que ya cubre insert/update/delete.
-- Postgres suma las políticas permisivas con OR, así que conviven sin pisarse.
