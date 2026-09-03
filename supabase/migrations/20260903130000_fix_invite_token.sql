-- El token se generaba con gen_random_bytes, que en Supabase vive en el esquema
-- «extensions» y no en «public»: con search_path=public la función no lo
-- encontraba y el alta fallaba siempre. Se genera con gen_random_uuid, que es
-- del núcleo de Postgres y no depende de ninguna extensión.
-- Dos identificadores concatenados = 64 caracteres y sobrada aleatoriedad.
create or replace function public.create_athlete_invite(p_athlete_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ws    uuid;
  v_token text;
begin
  select workspace_id into v_ws from public.athletes where id = p_athlete_id;
  if v_ws is null then
    raise exception 'athlete_not_found';
  end if;
  if not public.is_workspace_member(v_ws) then
    raise exception 'not_allowed';
  end if;
  if exists (select 1 from public.athlete_accounts where athlete_id = p_athlete_id) then
    raise exception 'already_linked';
  end if;

  delete from public.athlete_invites
   where athlete_id = p_athlete_id and accepted_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.athlete_invites (athlete_id, token, created_by)
  values (p_athlete_id, v_token, auth.uid());

  return v_token;
end;
$$;

revoke all on function public.create_athlete_invite(uuid) from public;
grant execute on function public.create_athlete_invite(uuid) to authenticated;
