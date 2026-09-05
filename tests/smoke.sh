#!/bin/bash
# REGLA DE LIMPIEZA: una prueba borra SOLO lo que ella creó, filtrando por el
# identificador que generó o por el correo @proa-test.dev. Nunca un borrado sin
# filtro (?id=not.is.null) ni un bucle sobre todos los usuarios: esta base la
# comparten las pruebas y el trabajo real, y un DELETE amplio se lleva puesto
# el trabajo de verdad.
# Prueba de humo de Proa: alta de usuario, espacio de trabajo, reglas de acceso
# y tope de cupos. Al final borra todo lo que creó.
URL="https://lryftqfhztzhawplljsu.supabase.co"
ANON="sb_publishable_P8xCadyfCsOPNX0b4cy1Uw_l8pomxIN"
SVC="${SUPABASE_SERVICE_KEY:?falta SUPABASE_SERVICE_KEY (Supabase · Project Settings · API · service_role)}"

E1="smoke1.$RANDOM@proa-test.dev"
E2="smoke2.$RANDOM@proa-test.dev"
PW="ProaSmoke12345"
pass=0; fail=0
ok(){ echo "  OK   $1"; pass=$((pass+1)); }
no(){ echo "  FALLA $1 :: $2"; fail=$((fail+1)); }

mkuser(){ # $1=email $2=role
  curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PW\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Smoke Test\",\"role\":\"$2\"}}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))"
}
signin(){
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
}
api(){ # $1=token $2=method $3=path $4=body
  if [ -n "$4" ]; then
    curl -s -X "$2" "$URL/rest/v1/$3" -H "apikey: $ANON" -H "Authorization: Bearer $1" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$4"
  else
    curl -s -X "$2" "$URL/rest/v1/$3" -H "apikey: $ANON" -H "Authorization: Bearer $1"
  fi
}

echo "1) Alta de dos usuarios"
U1=$(mkuser "$E1" coach); U2=$(mkuser "$E2" coach)
[ -n "$U1" ] && [ -n "$U2" ] && ok "usuarios creados" || { no "alta de usuarios" "$U1/$U2"; exit 1; }
T1=$(signin "$E1"); T2=$(signin "$E2")
[ -n "$T1" ] && [ -n "$T2" ] && ok "sesión iniciada" || { no "inicio de sesión" ""; exit 1; }

echo "2) El disparador crea el perfil"
P=$(api "$T1" GET "profiles?select=id,role,full_name")
echo "$P" | grep -q '"role":"coach"' && ok "perfil creado con rol coach" || no "perfil" "$P"
echo "$P" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if len(d)==1 else 1)" \
  && ok "solo ve su propio perfil" || no "aislamiento de perfiles" "$P"

echo "3) Crear el espacio de trabajo"
W=$(api "$T1" POST "workspaces" "{\"name\":\"Smoke\",\"owner_id\":\"$U1\",\"seat_limit\":3}")
WID=$(echo "$W" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')" 2>/dev/null)
if [ -z "$WID" ]; then
  no "crear espacio" "$W"
  echo "  (sin espacio no tiene sentido seguir)"; exit 1
fi
ok "espacio creado con insert+returning"

M=$(api "$T1" GET "workspace_members?select=role,user_id&workspace_id=eq.$WID")
echo "$M" | grep -q '"role":"owner"' && ok "el disparador registró al dueño como miembro" || no "alta automática de miembro" "$M"

echo "4) Reglas de acceso"
R=$(api "$T1" GET "workspaces?select=id,name")
echo "$R" | grep -q "$WID" && ok "el dueño ve su espacio" || no "lectura del dueño" "$R"
R2=$(api "$T2" GET "workspaces?select=id,name")
[ "$R2" = "[]" ] && ok "otro entrenador NO ve ese espacio" || no "AISLAMIENTO ROTO" "$R2"

echo "5) Tope de cupos (límite 3)"
for i in 1 2 3; do
  A=$(api "$T1" POST "athletes" "{\"workspace_id\":\"$WID\",\"first_name\":\"Atleta\",\"last_name\":\"$i\"}")
  echo "$A" | grep -q '"id"' || no "alta del atleta $i" "$A"
done
ok "entraron 3 atletas"
A4=$(api "$T1" POST "athletes" "{\"workspace_id\":\"$WID\",\"first_name\":\"Atleta\",\"last_name\":\"4\"}")
echo "$A4" | grep -q 'seat_limit_reached' && ok "el 4º queda bloqueado por el tope" || no "el tope NO frenó el alta" "$A4"

A5=$(api "$T1" POST "athletes" "{\"workspace_id\":\"$WID\",\"first_name\":\"Pausado\",\"status\":\"paused\"}")
echo "$A5" | grep -q '"id"' && ok "un atleta en pausa sí entra (no ocupa cupo)" || no "atleta en pausa" "$A5"

L=$(api "$T2" GET "athletes?select=id")
[ "$L" = "[]" ] && ok "otro entrenador NO ve esos atletas" || no "AISLAMIENTO DE ATLETAS ROTO" "$L"

echo "6) Limpieza"
curl -s -X DELETE "$URL/rest/v1/workspaces?id=eq.$WID" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
for U in "$U1" "$U2"; do
  curl -s -X DELETE "$URL/auth/v1/admin/users/$U" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" >/dev/null
done
# El control mira SOLO el espacio de trabajo que creó esta prueba. Preguntar
# por «todos los workspaces de la base» daba por resto el trabajo real del
# usuario — y esa pregunta mal hecha ya llevó una vez a borrarlo.
LEFT=$(curl -s "$URL/rest/v1/workspaces?select=id&id=eq.$WID" -H "apikey: $SVC" -H "Authorization: Bearer $SVC")
[ "$LEFT" = "[]" ] && ok "quedó limpio lo que creó la prueba" || no "restos de esta prueba" "$LEFT"

echo
echo "RESULTADO: $pass bien, $fail mal"
exit $fail
