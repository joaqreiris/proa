-- ── Quien invita es el entrenador, no el club ──────────────────────────────
--
-- El enlace decía «<espacio de trabajo> te invitó a Proa». Pero el espacio se
-- llama como el entrenador quiso —muchas veces, como el club donde juega su
-- atleta—, así que el atleta leía «Palermo Fútbol Club te invitó» cuando el
-- club no invitó nada. Lo invitó su preparador, que es con quien va a trabajar.
--
-- Sigue devolviendo CUATRO campos y ninguno de más: la pantalla del enlace la
-- abre alguien sin cuenta y todo lo que salga por acá lo ve cualquiera que
-- reciba el link.

create or replace function public.invite_preview(p_token text)
returns json language plpgsql security definer stable set search_path = public as $$
declare
  v json;
begin
  select json_build_object(
           'athlete_name', a.first_name,
           -- Quien invita es el ENTRENADOR, una persona, no el espacio de
           -- trabajo. El espacio puede llamarse como el club donde juega el
           -- atleta, y entonces el enlace decía «Palermo Fútbol Club te invitó»
           -- cuando el club no invitó nada: lo invitó su preparador.
           --
           -- Si el que invitó ya no está, queda el nombre del espacio, que es
           -- lo único que se puede decir sin mentir.
           'coach', coalesce(p.full_name, w.name),
           'accent',       w.accent,
           'status',       case
                             when i.accepted_at is not null then 'accepted'
                             when i.expires_at < now()      then 'expired'
                             else 'ok'
                           end
         )
    into v
    from public.athlete_invites i
    join public.athletes   a on a.id = i.athlete_id
    join public.workspaces w on w.id = a.workspace_id
    left join public.profiles p on p.id = i.created_by
   where i.token = p_token;

  if v is null then
    return json_build_object('status', 'not_found');
  end if;
  return v;
end;
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;
