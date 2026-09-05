#!/bin/bash
# REGLA DE LIMPIEZA: borra SOLO lo que creó, filtrando por sus propios ids.
#
# Arrastrar un bloque a otro hueco. Lo que se cuida:
#   · mover cambia el día y la hora del MISMO bloque;
#   · copiar deja el original donde estaba y crea uno nuevo con TODO adentro;
#   · nadie puede mover el bloque de otro entrenador.
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
mkuser(){ curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
  -d "{\"email\":\"$1\",\"password\":\"$PW\",\"email_confirm\":true}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])"; }
login(){ curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])"; }

E1="mv1.$RANDOM@proa-test.dev"; E2="mv2.$RANDOM@proa-test.dev"
U1=$(mkuser "$E1"); U2=$(mkuser "$E2"); T1=$(login "$E1"); T2=$(login "$E2")
W1=$(post "$T1" workspaces "{\"name\":\"Uno\",\"owner_id\":\"$U1\"}" | jid)
W2=$(post "$T2" workspaces "{\"name\":\"Dos\",\"owner_id\":\"$U2\"}" | jid)
A=$(post "$T1" athletes "{\"workspace_id\":\"$W1\",\"first_name\":\"Ana\"}" | jid)

EV=$(post "$T1" events '{"athlete_id":"'$A'","date":"2026-09-07","start_time":"18:00","end_time":"19:30","type":"gym","title":"Fuerza A"}' | jid)
B=$(post "$T1" session_blocks '{"event_id":"'$EV'","position":1,"kind":"str","duration_min":30,"rpe":7}' | jid)
post "$T1" session_items '{"block_id":"'$B'","position":1,"name":"Sentadilla","reps":"5","load":"80%"}' >/dev/null

# ── 1. Mover ──────────────────────────────────────────────────────────────
R=$(rpc "$T1" move_event '{"p_event":"'$EV'","p_date":"2026-09-09","p_start":"07:00","p_end":"08:30"}')
echo "$R" | grep -q "$EV" && ok "mover devuelve el mismo bloque" || no "mover" "$R"
M=$(get "$T1" "events?select=date,start_time,end_time&id=eq.$EV")
echo "$M" | grep -q '2026-09-09' && echo "$M" | grep -q '07:00:00' \
  && ok "quedó en el día y la hora nuevos" || no "no se movió" "$M"
N=$(get "$T1" "events?select=id&athlete_id=eq.$A" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
[ "$N" = "1" ] && ok "y sigue habiendo uno solo: mover no duplica" || no "mover duplicó" "$N"

# ── 2. Copiar ─────────────────────────────────────────────────────────────
NEW=$(rpc "$T1" move_event '{"p_event":"'$EV'","p_date":"2026-09-11","p_start":"17:00","p_end":"18:30","p_copy":true}' | tr -d '"')
# Se exige que tenga FORMA de uuid: un mensaje de error tampoco es igual a $EV,
# así que comparar solo contra el original daba por buena una falla.
echo "$NEW" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' && [ "$NEW" != "$EV" ] \
  && ok "copiar devuelve un bloque nuevo" || no "copiar" "$NEW"
C=$(get "$T1" "events?select=date,start_time,title&id=eq.$NEW")
echo "$C" | grep -q '2026-09-11' && echo "$C" | grep -q '17:00:00' && echo "$C" | grep -q 'Fuerza A' \
  && ok "la copia quedó en el hueco nuevo, con su nombre" || no "la copia" "$C"
O=$(get "$T1" "events?select=date,start_time&id=eq.$EV")
echo "$O" | grep -q '2026-09-09' && echo "$O" | grep -q '07:00:00' \
  && ok "y el original no se movió" || no "el original se movió" "$O"
CB=$(get "$T1" "session_blocks?select=id&event_id=eq.$NEW" | jid)
[ -n "$CB" ] && ok "la copia se llevó el bloque" || no "sin bloque" "$CB"
CI=$(get "$T1" "session_items?select=name,load&block_id=eq.$CB")
echo "$CI" | grep -q 'Sentadilla' && echo "$CI" | grep -q '80%' \
  && ok "y el ejercicio con su carga" || no "sin ejercicio" "$CI"

# ── 3. Lo ajeno no se toca ────────────────────────────────────────────────
R=$(rpc "$T2" move_event '{"p_event":"'$EV'","p_date":"2027-01-01","p_start":"09:00","p_end":"10:00"}')
X=$(get "$T1" "events?select=date&id=eq.$EV")
echo "$X" | grep -q '2026-09-09' && ok "otro entrenador no pudo moverlo" || no "AGUJERO: movió lo ajeno" "$R / $X"

# ── 4. Una hora imposible se rechaza ──────────────────────────────────────
R=$(rpc "$T1" move_event '{"p_event":"'$EV'","p_date":"2026-09-09","p_start":"18:00","p_end":"17:00"}')
echo "$R" | grep -q "posterior" && ok "el fin antes del inicio se rechaza" || no "hora imposible aceptada" "$R"

for w in "$W1" "$W2"; do curl -s -X DELETE "$URL/rest/v1/workspaces?id=eq.$w" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null; done
for u in "$U1" "$U2"; do curl -s -X DELETE "$URL/auth/v1/admin/users/$u" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null; done
L=$(curl -s "$URL/rest/v1/events?select=id&athlete_id=eq.$A" -H "apikey: $SVC" -H "Authorization: Bearer $SVC")
[ "$L" = "[]" ] && ok "quedó limpio lo que creó la prueba" || no "restos de esta prueba" "$L"

echo; echo "RESULTADO: $pass bien, $fail mal"; [ "$fail" = "0" ]
