-- ── El correo del atleta se queda con el de su cuenta ──────────────────────
--
-- Ver el comentario de adentro: el enlace de invitación no puede mostrar el
-- correo que cargó el entrenador, así que el atleta escribe uno y podían quedar
-- dos sin que nadie los cruzara.

create or replace function public.accept_athlete_invite(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_inv   public.athlete_invites%rowtype;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  -- Una cuenta de entrenador no puede convertirse en atleta: perdería el
  -- acceso a su propio espacio de trabajo.
  if exists (select 1 from public.workspace_members where user_id = v_uid) then
    raise exception 'coach_account';
  end if;

  select * into v_inv from public.athlete_invites where token = p_token;
  if v_inv.id is null      then raise exception 'invite_not_found'; end if;
  if v_inv.accepted_at is not null then raise exception 'invite_used'; end if;
  if v_inv.expires_at < now()      then raise exception 'invite_expired'; end if;

  if exists (select 1 from public.athlete_accounts where athlete_id = v_inv.athlete_id) then
    raise exception 'already_linked';
  end if;

  insert into public.athlete_accounts (athlete_id, user_id)
  values (v_inv.athlete_id, v_uid);

  -- El correo de la ficha pasa a ser con el que se registró.
  --
  -- El entrenador escribe un correo al dar de alta al atleta, pero el enlace de
  -- invitación NO se lo puede mostrar: esa pantalla la abre alguien sin cuenta y
  -- devolver el correo ahí sería filtrarlo a cualquiera que reciba el link. Así
  -- que el atleta lo escribe de nuevo, y si escribe otro quedaban dos: el
  -- entrenador podía terminar escribiéndole a una dirección que no usa.
  --
  -- Gana el de la cuenta porque es el único que sabemos que existe: le llegó el
  -- correo de confirmación y entró con él.
  update public.athletes a
     set email = u.email
    from auth.users u
   where a.id = v_inv.athlete_id
     and u.id = v_uid
     and u.email is not null
     and a.email is distinct from u.email;

  update public.athlete_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  update public.profiles set role = 'athlete' where id = v_uid;

  return json_build_object('ok', true, 'athlete_id', v_inv.athlete_id);
end;
$$;

revoke all on function public.accept_athlete_invite(text) from public, anon;
grant execute on function public.accept_athlete_invite(text) to authenticated;
