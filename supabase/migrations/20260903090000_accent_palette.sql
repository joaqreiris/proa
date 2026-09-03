-- Color de marca del entrenador: pasa a ser un identificador de la paleta
-- (no un código de color) y se valida en la base. Los colores de los tipos de
-- trabajo no son elegibles: son un idioma compartido.
alter table public.workspaces
  alter column accent set default 'orange';

update public.workspaces
   set accent = 'orange'
 where accent is null
    or accent not in ('orange','red','fuchsia','violet','blue',
                      'teal','green','lime','yellow','graphite');

alter table public.workspaces
  alter column accent set not null;

alter table public.workspaces
  drop constraint if exists workspaces_accent_check;

alter table public.workspaces
  add constraint workspaces_accent_check
  check (accent in ('orange','red','fuchsia','violet','blue',
                    'teal','green','lime','yellow','graphite'));
