#!/bin/bash
# Copiar una semana no puede perder NADA. Compara campo por campo el original
# contra la copia: si mañana se agrega una columna y copy_week no la lleva,
# esta prueba falla. Es el guardián de la lista explícita de columnas.
URL="https://lryftqfhztzhawplljsu.supabase.co"
ANON="sb_publishable_P8xCadyfCsOPNX0b4cy1Uw_l8pomxIN"
SVC="${SUPABASE_SERVICE_KEY:?falta SUPABASE_SERVICE_KEY}"
PW="ProaSmoke12345"; pass=0; fail=0
ok(){ echo "  OK    $1"; pass=$((pass+1)); }
no(){ echo "  FALLA $1 :: $2"; fail=$((fail+1)); }
post(){ curl -s -X POST "$URL/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$3"; }
get(){ curl -s "$URL/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1"; }
jid(){ python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else '')"; }

E="cw.$RANDOM@proa-test.dev"
U=$(curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
   -H "Content-Type: application/json" -d "{\"email\":\"$E\",\"password\":\"$PW\",\"email_confirm\":true}" \
   | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
T=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
   -H "Content-Type: application/json" -d "{\"email\":\"$E\",\"password\":\"$PW\"}" \
   | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

W=$(post "$T" workspaces "{\"name\":\"S\",\"owner_id\":\"$U\"}" | jid)
A=$(post "$T" athletes "{\"workspace_id\":\"$W\",\"first_name\":\"T\"}" | jid)

# Una sesión con TODOS los campos llenos: si alguno no viaja, se ve.
EV=$(post "$T" events '{"athlete_id":"'$A'","date":"2026-09-07","start_time":"18:00","end_time":"19:30","type":"gym","title":"Sesion A","location":"Sala 2","notes":"ojo lumbar"}' | jid)
BL=$(post "$T" session_blocks '{"event_id":"'$EV'","position":0,"kind":"plyo","title":"Contraste frances","method":"contrast","rounds":3,"rest_s":180,"duration_min":25,"rpe":8,"notes":"explosivo"}' | jid)
IT=$(post "$T" session_items '{"block_id":"'$BL'","position":0,"name":"Sentadilla","sets":1,"reps":"3","load":"85%","rest_s":20,"tempo":"X","side":"both","mode":"reps","notes":"profunda"}' | jid)
post "$T" session_sets '{"item_id":"'$IT'","position":0,"reps":"3","load":"85%","rest_s":20,"tempo":"X","note":"serie 1"}' >/dev/null

N=$(curl -s -X POST "$URL/rest/v1/rpc/copy_week" -H "apikey: $ANON" -H "Authorization: Bearer $T" \
    -H "Content-Type: application/json" -d '{"p_athlete_id":"'$A'","p_from":"2026-09-07","p_to":"2026-09-14"}')
[ "$N" = "1" ] && ok "copió el evento" || no "copió" "$N"

NEV=$(get "$T" "events?select=*&date=eq.2026-09-14" )
NEVID=$(echo "$NEV" | jid)
python3 - "$NEV" <<'PY'
import sys, json
d = json.loads(sys.argv[1])[0]
want = {"title":"Sesion A","location":"Sala 2","notes":"ojo lumbar","type":"gym",
        "start_time":"18:00:00","end_time":"19:30:00","status":"planned"}
bad = {k:(d.get(k),v) for k,v in want.items() if d.get(k)!=v}
print("  OK    evento completo" if not bad else "  FALLA evento :: "+str(bad))
PY

NB=$(get "$T" "session_blocks?select=*&event_id=eq.$NEVID")
NBID=$(echo "$NB" | jid)
python3 - "$NB" <<'PY'
import sys, json
d = json.loads(sys.argv[1])[0]
want = {"kind":"plyo","title":"Contraste frances","method":"contrast","rounds":3,
        "rest_s":180,"duration_min":25,"rpe":8,"au":200,"notes":"explosivo"}
bad = {k:(d.get(k),v) for k,v in want.items() if d.get(k)!=v}
print("  OK    bloque completo, con duración, RPE y carga" if not bad else "  FALLA bloque :: "+str(bad))
PY

NI=$(get "$T" "session_items?select=*&block_id=eq.$NBID")
NITID=$(echo "$NI" | jid)
python3 - "$NI" <<'PY'
import sys, json
d = json.loads(sys.argv[1])[0]
want = {"name":"Sentadilla","sets":1,"reps":"3","load":"85%","rest_s":20,
        "tempo":"X","side":"both","mode":"reps","notes":"profunda"}
bad = {k:(d.get(k),v) for k,v in want.items() if d.get(k)!=v}
print("  OK    ejercicio completo, con lado, modo y tempo" if not bad else "  FALLA ejercicio :: "+str(bad))
PY

NS=$(get "$T" "session_sets?select=*&item_id=eq.$NITID")
python3 - "$NS" <<'PY'
import sys, json
d = json.loads(sys.argv[1])[0]
want = {"reps":"3","load":"85%","rest_s":20,"tempo":"X","note":"serie 1"}
bad = {k:(d.get(k),v) for k,v in want.items() if d.get(k)!=v}
print("  OK    serie detallada completa" if not bad else "  FALLA serie :: "+str(bad))
PY

curl -s -X DELETE "$URL/rest/v1/workspaces?id=eq.$W" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
curl -s -X DELETE "$URL/auth/v1/admin/users/$U" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
L=$(curl -s "$URL/rest/v1/session_blocks?select=id" -H "apikey: $SVC" -H "Authorization: Bearer $SVC")
[ "$L" = "[]" ] && ok "base limpia" || no "restos" "$L"
