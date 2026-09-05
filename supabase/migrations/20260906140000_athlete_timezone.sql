-- ── Dónde vive el atleta ───────────────────────────────────────────────────
--
-- El entrenador puede estar en Camboya y el atleta en Uruguay. Para poder
-- decirle al entrenador «esto es a las 04:00 tuyas», hay que saber en qué huso
-- vive cada atleta.
--
-- LO QUE ESTA COLUMNA *NO* CAMBIA: cómo se guardan los eventos. Un evento
-- sigue siendo `date` + `start_time`, o sea una hora de reloj, y esa hora es
-- la del atleta. El entrenamiento de Ana «a las 18:00» es a las 18:00 en
-- Montevideo, y sigue siéndolo si el entrenador se muda, si cambia el horario
-- de verano o si el mundo se da vuelta. Su rutina está atada al reloj de la
-- pared, no al sol.
--
-- Guardarlos en UTC sería el error clásico: al empezar el horario de verano en
-- Uruguay, todos los entrenamientos se le correrían una hora sin que nadie
-- tocara nada. La conversión se hace al MOSTRAR, y solo para el que mira desde
-- otro huso.
--
-- El valor es un nombre IANA ('America/Montevideo'), no un número de desfase:
-- el desfase cambia dos veces al año y el nombre no.

alter table public.athletes add column if not exists timezone text;

comment on column public.athletes.timezone is
  'Huso IANA donde vive el atleta. Los horarios de sus eventos son horas de reloj DE ESTE huso.';

-- A los atletas que ya existen se les pone el huso del espacio de trabajo: es
-- lo más probable, y es lo que ya se venía suponiendo sin decirlo.
update public.athletes a
   set timezone = w.timezone
  from public.workspaces w
 where w.id = a.workspace_id
   and a.timezone is null
   and w.timezone is not null;
