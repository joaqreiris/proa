#!/bin/bash
# Prueba de humo del alta del atleta: invitación por enlace, vinculación de la
# cuenta y aislamiento. Al final borra todo lo que creó.
URL="https://lryftqfhztzhawplljsu.supabase.co"
ANON="sb_publishable_P8xCadyfCsOPNX0b4cy1Uw_l8pomxIN"
SVC="${SUPABASE_SERVICE_KEY:?falta SUPABASE_SERVICE_KEY (Supabase · Project Settings · API · service_role)}"
PW="ProaSmoke12345"
pass=0; fail=0
ok(){ echo "  OK    $1"; pass=$((pass+1)); }
no(){ echo "  FALLA $1 :: $2"; fail=$((fail+1)); }
jget(){ python3 -c "import sys,json
try: d=json.load(sys.stdin)
except Exception: print(''); raise SystemExit
p='$1'.split('.')
for k in p:
    if d is None: break
    d = d.get(k) if isinstance(d,dict) else (d[int(k)] if isinstance(d,list) and k.isdigit() and len(d)>int(k) else None)
print(d if d is not None else '')"; }

mkuser(){ curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$1\",\"password\":\"$PW\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"$2\",\"role\":\"$3\"}}" | jget id; }
signin(){ curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | jget access_token; }
rest(){ curl -s -X "$2" "$URL/rest/v1/$3" -H "apikey: $ANON" -H "Authorization: Bearer $1" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" ${4:+-d "$4"}; }
rpc(){ curl -s -X POST "$URL/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" \
  -H "Content-Type: application/json" -d "$3"; }

EC="coach.$RANDOM@proa-test.dev"; EA="ath.$RANDOM@proa-test.dev"; EB="other.$RANDOM@proa-test.dev"

echo "1) Entrenador con espacio y dos atletas"
UC=$(mkuser "$EC" "Entrenador Prueba" coach); TC=$(signin "$EC")
W=$(rest "$TC" POST workspaces "{\"name\":\"Smoke\",\"owner_id\":\"$UC\",\"seat_limit\":5,\"accent\":\"blue\"}")
WID=$(echo "$W" | jget 0.id)
[ -n "$WID" ] && ok "espacio creado" || { no "espacio" "$W"; exit 1; }
A1=$(rest "$TC" POST athletes "{\"workspace_id\":\"$WID\",\"first_name\":\"Tomás\",\"last_name\":\"Peralta\"}" | jget 0.id)
A2=$(rest "$TC" POST athletes "{\"workspace_id\":\"$WID\",\"first_name\":\"Otro\",\"last_name\":\"Atleta\"}" | jget 0.id)
[ -n "$A1" ] && [ -n "$A2" ] && ok "dos atletas creados" || no "atletas" "$A1/$A2"

echo "2) El entrenador genera el enlace"
TOKEN=$(rpc "$TC" create_athlete_invite "{\"p_athlete_id\":\"$A1\"}" | tr -d '"')
[ ${#TOKEN} -eq 64 ] && ok "enlace generado (64 caracteres)" || no "enlace" "$TOKEN"

echo "3) La pantalla del enlace se abre SIN sesión"
P=$(curl -s -X POST "$URL/rest/v1/rpc/invite_preview" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" -d "{\"p_token\":\"$TOKEN\"}")
[ "$(echo "$P" | jget status)" = "ok" ]              && ok "la invitación se lee sin estar logueado" || no "vista previa" "$P"
[ "$(echo "$P" | jget athlete_name)" = "Tomás" ]     && ok "muestra el nombre del atleta"            || no "nombre" "$P"
[ "$(echo "$P" | jget accent)" = "blue" ]            && ok "trae el color del entrenador"            || no "color" "$P"
# Que devuelva EXACTAMENTE los cuatro campos que la pantalla muestra: ni un
# identificador, ni un correo, ni nada del resto del plantel.
KEYS=$(echo "$P" | python3 -c "import sys,json;print(','.join(sorted(json.load(sys.stdin))))")
[ "$KEYS" = "accent,athlete_name,status,workspace" ] && ok "NO filtra ningún dato de más"          || no "filtra datos de más: $KEYS" "$P"

echo "4) Un enlace inventado no dice nada"
BAD=$(curl -s -X POST "$URL/rest/v1/rpc/invite_preview" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
      -H "Content-Type: application/json" -d '{"p_token":"noexiste"}')
[ "$(echo "$BAD" | jget status)" = "not_found" ] && ok "enlace inválido → no encontrado" || no "enlace inválido" "$BAD"

echo "5) Sin sesión no se puede reclamar"
NS=$(curl -s -X POST "$URL/rest/v1/rpc/accept_athlete_invite" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
     -H "Content-Type: application/json" -d "{\"p_token\":\"$TOKEN\"}")
echo "$NS" | grep -qi "not_signed_in\|permission denied\|42501" && ok "reclamar sin sesión falla" || no "reclamó sin sesión" "$NS"

echo "6) Una cuenta de entrenador NO puede volverse atleta"
UB=$(mkuser "$EB" "Otro Entrenador" coach); TB=$(signin "$EB")
rest "$TB" POST workspaces "{\"name\":\"Ajeno\",\"owner_id\":\"$UB\"}" >/dev/null
CA=$(rpc "$TB" accept_athlete_invite "{\"p_token\":\"$TOKEN\"}")
echo "$CA" | grep -q "coach_account" && ok "rechaza a un entrenador" || no "un entrenador se volvió atleta" "$CA"

echo "7) El atleta reclama su invitación"
UA=$(mkuser "$EA" "Tomás Peralta" athlete); TA=$(signin "$EA")
AC=$(rpc "$TA" accept_athlete_invite "{\"p_token\":\"$TOKEN\"}")
[ "$(echo "$AC" | jget ok)" = "True" ] && ok "cuenta vinculada" || no "vinculación" "$AC"
R=$(rest "$TA" GET "profiles?select=role")
[ "$(echo "$R" | jget 0.role)" = "athlete" ] && ok "el perfil quedó como atleta" || no "rol" "$R"

echo "8) El mismo enlace no sirve dos veces"
RE=$(rpc "$TA" accept_athlete_invite "{\"p_token\":\"$TOKEN\"}")
echo "$RE" | grep -q "invite_used\|coach_account\|already_linked" && ok "enlace de un solo uso" || no "se reusó" "$RE"

echo "9) Aislamiento: el atleta ve SOLO lo suyo"
L=$(rest "$TA" GET "athletes?select=id,first_name")
N=$(echo "$L" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else -1)")
[ "$N" = "1" ] && ok "ve 1 atleta (el suyo), no los 2 del entrenador" || no "AISLAMIENTO ROTO: ve $N" "$L"
echo "$L" | grep -q "Tomás" && ok "y es el correcto" || no "atleta equivocado" "$L"
WL=$(rest "$TA" GET "workspaces?select=id")
[ "$WL" = "[]" ] && ok "no ve el espacio del entrenador" || no "ve el espacio" "$WL"

echo "10) El entrenador sigue viendo los suyos"
CL=$(rest "$TC" GET "athletes?select=id")
CN=$(echo "$CL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else -1)")
[ "$CN" = "2" ] && ok "el entrenador ve sus 2 atletas" || no "el entrenador ve $CN" "$CL"

echo "11) Anamnesis y horarios fijos"
IN=$(rest "$TC" POST athlete_intake "{\"athlete_id\":\"$A1\",\"main_goal\":\"performance\",\"sleep_hours\":7.5,\"gym_access\":\"full\"}")
echo "$IN" | grep -q '"main_goal":"performance"' && ok "el entrenador guarda la anamnesis" || no "anamnesis" "$IN"
SL=$(rest "$TC" POST availability_slots "{\"athlete_id\":\"$A1\",\"weekday\":0,\"start_time\":\"08:00\",\"end_time\":\"13:00\",\"kind\":\"commitment\",\"label\":\"Facultad\"}")
echo "$SL" | grep -q '"label":"Facultad"' && ok "guarda un horario fijo" || no "horario" "$SL"
BADSL=$(rest "$TC" POST availability_slots "{\"athlete_id\":\"$A1\",\"weekday\":0,\"start_time\":\"13:00\",\"end_time\":\"08:00\"}")
echo "$BADSL" | grep -qi "violates check\|check constraint" && ok "rechaza un horario que termina antes de empezar" || no "aceptó horario invertido" "$BADSL"
MI=$(rest "$TA" GET "athlete_intake?select=main_goal")
echo "$MI" | grep -q "performance" && ok "el atleta puede leer su anamnesis" || no "el atleta no la ve" "$MI"

echo "12) Limpieza"
curl -s -X DELETE "$URL/rest/v1/workspaces?owner_id=in.($UC,$UB)" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
for U in "$UC" "$UA" "$UB"; do
  curl -s -X DELETE "$URL/auth/v1/admin/users/$U" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
done
LEFT=$(curl -s "$URL/rest/v1/athletes?select=id" -H "apikey: $SVC" -H "Authorization: Bearer $SVC")
[ "$LEFT" = "[]" ] && ok "base limpia" || no "quedaron restos" "$LEFT"

echo
echo "RESULTADO: $pass bien, $fail mal"
exit $fail
