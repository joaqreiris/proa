#!/bin/bash
# REGLA DE LIMPIEZA: una prueba borra SOLO lo que ella creó, filtrando por el
# identificador que generó o por el correo @proa-test.dev. Nunca un borrado sin
# filtro (?id=not.is.null) ni un bucle sobre todos los usuarios: esta base la
# comparten las pruebas y el trabajo real, y un DELETE amplio se lleva puesto
# el trabajo de verdad. Lo mismo vale para el control final de restos: se mira
# SOLO adentro de lo que esta prueba creó.
#
# Arrastrar y soltar renumera varias filas de una. Lo que esta prueba cuida:
#   · que el orden nuevo quede guardado tal cual;
#   · que un ejercicio pueda mudarse a otro bloque de la MISMA sesión;
#   · y sobre todo, que NADIE pueda usar reorder para tocar lo que no es suyo.
URL="https://lryftqfhztzhawplljsu.supabase.co"
ANON="sb_publishable_P8xCadyfCsOPNX0b4cy1Uw_l8pomxIN"
SVC="${SUPABASE_SERVICE_KEY:?falta SUPABASE_SERVICE_KEY}"
PW="ProaSmoke12345"; pass=0; fail=0
ok(){ echo "  OK    $1"; pass=$((pass+1)); }
no(){ echo "  FALLA $1 :: $2"; fail=$((fail+1)); }
post(){ curl -s -X POST "$URL/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$3"; }
get(){ curl -s "$URL/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1"; }
rpc(){ curl -s -X POST "$URL/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" -H "Content-Type: application/json" -d "$3"; }
jid(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else '')"; }

mkuser(){ curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$PW\",\"email_confirm\":true}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"; }
login(){ curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])"; }

E1="ro1.$RANDOM@proa-test.dev"; E2="ro2.$RANDOM@proa-test.dev"
U1=$(mkuser "$E1"); U2=$(mkuser "$E2")
T1=$(login "$E1");  T2=$(login "$E2")

W1=$(post "$T1" workspaces "{\"name\":\"Uno\",\"owner_id\":\"$U1\"}" | jid)
W2=$(post "$T2" workspaces "{\"name\":\"Dos\",\"owner_id\":\"$U2\"}" | jid)
A1=$(post "$T1" athletes "{\"workspace_id\":\"$W1\",\"first_name\":\"Ana\"}" | jid)

# Sesión del lunes con dos bloques; el primero con tres ejercicios.
EV=$(post "$T1" events '{"athlete_id":"'$A1'","date":"2026-09-07","type":"gym"}' | jid)
B1=$(post "$T1" session_blocks '{"event_id":"'$EV'","position":1,"kind":"str"}'  | jid)
B2=$(post "$T1" session_blocks '{"event_id":"'$EV'","position":2,"kind":"cond"}' | jid)
B3=$(post "$T1" session_blocks '{"event_id":"'$EV'","position":3,"kind":"cool"}' | jid)
I1=$(post "$T1" session_items '{"block_id":"'$B1'","position":1,"name":"Sentadilla"}' | jid)
I2=$(post "$T1" session_items '{"block_id":"'$B1'","position":2,"name":"Peso muerto"}' | jid)
I3=$(post "$T1" session_items '{"block_id":"'$B1'","position":3,"name":"Prensa"}' | jid)

orderOf(){ get "$T1" "$1&select=id&order=position" | python3 -c "import sys,json;print(','.join(x['id'] for x in json.load(sys.stdin)))"; }

# ── 1. Los bloques quedan en el orden que se manda ─────────────────────────
N=$(rpc "$T1" reorder '{"p_kind":"blocks","p_parent":"'$EV'","p_ids":["'$B3'","'$B1'","'$B2'"]}')
[ "$N" = "3" ] && ok "reorder movió los 3 bloques" || no "reorder bloques" "$N"
[ "$(orderOf "session_blocks?event_id=eq.$EV")" = "$B3,$B1,$B2" ] \
  && ok "los bloques quedaron en el orden nuevo" || no "orden de bloques" "$(orderOf "session_blocks?event_id=eq.$EV")"

# ── 2. Un ejercicio se muda a otro bloque de la misma sesión ───────────────
N=$(rpc "$T1" reorder '{"p_kind":"items","p_parent":"'$B2'","p_ids":["'$I2'"]}')
[ "$N" = "1" ] && ok "el ejercicio se mudó de bloque" || no "mudar ejercicio" "$N"
[ "$(orderOf "session_items?block_id=eq.$B2")" = "$I2" ] \
  && ok "quedó en el bloque de destino" || no "destino" "$(orderOf "session_items?block_id=eq.$B2")"
[ "$(orderOf "session_items?block_id=eq.$B1")" = "$I1,$I3" ] \
  && ok "el bloque de origen conserva el resto en orden" || no "origen" "$(orderOf "session_items?block_id=eq.$B1")"

# ── 3. Nadie reordena lo ajeno ─────────────────────────────────────────────
# El otro entrenador conoce los ids (peor caso) y los manda igual.
N=$(rpc "$T2" reorder '{"p_kind":"blocks","p_parent":"'$EV'","p_ids":["'$B1'","'$B2'","'$B3'"]}')
[ "$N" = "0" ] && ok "otro entrenador no movió ni una fila" || no "AGUJERO: reordenó lo ajeno" "$N"
[ "$(orderOf "session_blocks?event_id=eq.$EV")" = "$B3,$B1,$B2" ] \
  && ok "el orden ajeno quedó intacto" || no "orden cambiado por un extraño" "$(orderOf "session_blocks?event_id=eq.$EV")"

# ── 4. Un ejercicio no se muda a otra sesión ───────────────────────────────
# Reordenar cambia el orden, no el día. Que el bloque de destino sea mío no
# alcanza: tiene que ser de la MISMA sesión.
EV2=$(post "$T1" events '{"athlete_id":"'$A1'","date":"2026-09-08","type":"gym"}' | jid)
BX=$(post "$T1" session_blocks '{"event_id":"'$EV2'","position":1,"kind":"str"}' | jid)
N=$(rpc "$T1" reorder '{"p_kind":"items","p_parent":"'$BX'","p_ids":["'$I1'"]}')
[ "$N" = "0" ] && ok "no dejó mudar el ejercicio a otro día" || no "se mudó de día" "$N"
[ "$(orderOf "session_items?block_id=eq.$B1")" = "$I1,$I3" ] \
  && ok "el ejercicio siguió donde estaba" || no "se movió igual" "$(orderOf "session_items?block_id=eq.$B1")"

# ── 5. Series y comidas ────────────────────────────────────────────────────
S1=$(post "$T1" session_sets '{"item_id":"'$I1'","position":1,"reps":"5"}' | jid)
S2=$(post "$T1" session_sets '{"item_id":"'$I1'","position":2,"reps":"3"}' | jid)
N=$(rpc "$T1" reorder '{"p_kind":"sets","p_parent":"'$I1'","p_ids":["'$S2'","'$S1'"]}')
[ "$(orderOf "session_sets?item_id=eq.$I1")" = "$S2,$S1" ] \
  && ok "las series se reordenan" || no "series" "$N / $(orderOf "session_sets?item_id=eq.$I1")"

MV=$(post "$T1" events '{"athlete_id":"'$A1'","date":"2026-09-07","type":"meal"}' | jid)
M1=$(post "$T1" meal_items '{"event_id":"'$MV'","position":1,"name":"Arroz"}' | jid)
M2=$(post "$T1" meal_items '{"event_id":"'$MV'","position":2,"name":"Pollo"}' | jid)
N=$(rpc "$T1" reorder '{"p_kind":"meal","p_parent":"'$MV'","p_ids":["'$M2'","'$M1'"]}')
[ "$(orderOf "meal_items?event_id=eq.$MV")" = "$M2,$M1" ] \
  && ok "el menú se reordena" || no "menú" "$N / $(orderOf "meal_items?event_id=eq.$MV")"

# ── 6. Una lista que no existe es un error, no un silencio ─────────────────
R=$(rpc "$T1" reorder '{"p_kind":"cualquiera","p_parent":"'$EV'","p_ids":["'$B1'"]}')
echo "$R" | grep -q "no sé ordenar" && ok "una lista desconocida falla fuerte" || no "lista desconocida" "$R"

# ── Limpieza: solo lo que creó esta prueba ─────────────────────────────────
for w in "$W1" "$W2"; do
  curl -s -X DELETE "$URL/rest/v1/workspaces?id=eq.$w" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
done
for u in "$U1" "$U2"; do
  curl -s -X DELETE "$URL/auth/v1/admin/users/$u" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
done
# El control de restos mira SOLO los eventos de esta prueba. Preguntar por
# «todas las filas de la tabla» daría por resto el trabajo real de alguien.
L=$(curl -s "$URL/rest/v1/session_blocks?select=id&event_id=in.($EV,$EV2)" -H "apikey: $SVC" -H "Authorization: Bearer $SVC")
[ "$L" = "[]" ] && ok "quedó limpio lo que creó la prueba" || no "restos de esta prueba" "$L"

echo; echo "RESULTADO: $pass bien, $fail mal"; [ "$fail" = "0" ]
