-- ── Reordenar: una sola función para todas las listas ──────────────────────
--
-- Arrastrar y soltar mueve una fila pero cambia el número de orden de todas
-- las que hay debajo. Mandar un update por fila serían media docena de viajes
-- a la base y, si uno fallara, media lista reordenada. Esto es un viaje y una
-- transacción: sale todo o no sale nada.
--
-- Es SECURITY INVOKER a propósito — o sea, corre con los permisos de quien la
-- llama, no con los del dueño. Esa es la diferencia importante con clone_event:
-- ahí hizo falta comprobar los permisos a mano porque la función se saltaba el
-- RLS; acá el RLS de cada tabla sigue valiendo tal cual, así que quien no puede
-- editar ese evento simplemente no toca ninguna fila. Menos código y menos
-- lugares donde equivocarse.
--
--   p_kind    qué lista: blocks | items | sets | meal | recovery
--   p_parent  a quién pertenecen (el evento, el bloque, el ejercicio)
--   p_ids     los ids EN EL ORDEN NUEVO
--
-- Devuelve cuántas filas movió. Si son menos de las que se mandaron, algo no
-- se pudo tocar: la pantalla lo avisa y vuelve a leer en vez de mostrar un
-- orden que la base no tiene.
--
-- El caso 'items' además reescribe el bloque: así el mismo llamado sirve para
-- reordenar dentro de un bloque Y para mover un ejercicio a otro bloque. Pero
-- solo dentro de la MISMA sesión — un ejercicio no se muda de día por
-- arrastrarlo.

create or replace function public.reorder(p_kind text, p_parent uuid, p_ids uuid[])
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare v_n int;
begin
  if p_parent is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;

  case p_kind
    when 'blocks' then
      update public.session_blocks t set position = x.ord
        from unnest(p_ids) with ordinality as x(id, ord)
       where t.id = x.id and t.event_id = p_parent;

    when 'items' then
      update public.session_items t set position = x.ord, block_id = p_parent
        from unnest(p_ids) with ordinality as x(id, ord)
       where t.id = x.id
         and exists (
           select 1
             from public.session_blocks nb
             join public.session_blocks ob on ob.event_id = nb.event_id
            where nb.id = p_parent and ob.id = t.block_id);

    when 'sets' then
      update public.session_sets t set position = x.ord
        from unnest(p_ids) with ordinality as x(id, ord)
       where t.id = x.id and t.item_id = p_parent;

    when 'meal' then
      update public.meal_items t set position = x.ord
        from unnest(p_ids) with ordinality as x(id, ord)
       where t.id = x.id and t.event_id = p_parent;

    when 'recovery' then
      update public.recovery_items t set position = x.ord
        from unnest(p_ids) with ordinality as x(id, ord)
       where t.id = x.id and t.event_id = p_parent;

    else
      raise exception 'reorder: no sé ordenar «%»', p_kind;
  end case;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.reorder(text, uuid, uuid[]) from public, anon;
grant execute on function public.reorder(text, uuid, uuid[]) to authenticated;

comment on function public.reorder(text, uuid, uuid[]) is
  'Renumera una lista completa en un viaje. SECURITY INVOKER: manda el RLS de cada tabla.';
