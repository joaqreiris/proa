# Proa

**Entrenamiento individual: un entrenador, un atleta.**
Hermano de ClavaMetrics, pero separado por completo: repo propio, base de datos propia, dominio propio.

ClavaMetrics organiza un plantel. Proa organiza a una persona. El entrenador no controla la agenda del atleta, la *descubre*: carga sus horarios reales (estudio, trabajo, entrenamiento con su club) y el calendario muestra dónde queda lugar para entrenar. El atleta entra con **su propia cuenta**, ve la semana en el teléfono, marca lo que hizo y responde.

---

## Cómo se levanta

No hay compilación. Es HTML, JavaScript sin marcos y CSS, igual que ClavaMetrics.

```bash
npm run dev            # sirve la carpeta en http://localhost:4173
```

Después se entra por `http://localhost:4173/Login.html`.

## Cómo se prueba

```bash
npm test                       # todas las que se puedan correr sin credenciales
npm test -- week               # solo las que tengan «week» en el nombre
npm test -- --lista            # cuáles hay y qué necesita cada una
SUPABASE_SERVICE_KEY=... npm test   # también las que hablan con la base
```

Las que tocan la base de verdad **no se hacen pasar por buenas** cuando falta la
clave: se saltan y se listan aparte, porque «sin correr» no es lo mismo que
«bien». Sin la clave son unos veinte segundos.

## Cómo se despliega

Vercel toma la rama `main` y publica la carpeta tal cual (`outputDirectory: "."`).
No hace falta dominio propio para trabajar: Vercel da uno gratis del estilo `proa.vercel.app`.

---

## Estructura

```
proa.css              Sistema de diseño. Tokens --pr-*. Temas claro y oscuro.
auth.css              Pantallas de entrada, registro y cambio de contraseña.

Login.html            Entrar
Register.html         Crear cuenta (solo entrenadores; los atletas llegan por invitación)
auth-callback.html    Vuelta del correo de confirmación
set-password.html     Contraseña nueva desde el enlace de recuperación
Onboarding.html       Alta del entrenador: crea su espacio de trabajo
Home.html             Inicio del entrenador
Athletes.html         Listado, alta y edición de la ficha; borrar pide el nombre
Athlete.html          Ficha de un atleta: su semana y sus datos
Intake.html           Anamnesis y grilla de horarios
Week.html             La agenda del entrenador
Session.html          Editor de sesión (gimnasio y campo)
Meal.html             Menú del día
Exercises.html        Biblioteca de ejercicios
athlete/              Lo que ve el atleta con su cuenta: su semana, su sesión

assets/
  brand.js            La marca (la proa) y el tema. Se carga PRIMERO, sin defer.
  supabase-init.js    Cliente de Supabase, contexto y las dos puertas de acceso.
  i18n.js             Motor de idiomas. Copiado de ClavaMetrics, prefijo PR_.
  sidebar.js          Riel lateral compartido.
  week-grid.js        La semana: la dibuja, sabe los colores y las dos vistas.
  week-board.js       El tablero del entrenador con todos sus modales.
  week-drag.js        Arrastrar y soltar bloques en la semana.
  sortable.js         Reordenar listas arrastrando (bloques, series, comidas).
  block-types.js      Los tipos de bloque del editor de sesión.
  nutrition-calc.js   Macros y calorías.
  recovery-methods.js Los métodos de recuperación y sus campos.
  athlete-log.js      El parte del atleta.
  tz.js               Husos horarios. El entrenador y el atleta pueden no estar
                      en el mismo lado del mundo.
  vendor/             supabase-js con la versión fija.

locales/              es · en · pt
db/schema.sql         Esquema de la base. Fuente de verdad.
supabase/migrations/  Lo que se aplica de verdad contra el proyecto.
tests/                Pruebas. `npm test` las corre; `run.mjs` es el corredor.
```

---

## Reglas del proyecto

**La unidad de tenencia es el espacio de trabajo, no el club.** Toda consulta filtra por `workspace_id`. Es el equivalente de `club_id` en ClavaMetrics.

**Cada tabla tiene DOS puertas.** El entrenador ve todo lo de su espacio; el atleta ve únicamente sus propias filas. Al crear una tabla hay que declarar las dos políticas. Si solo se declara la del entrenador, el atleta no ve nada; si solo la del atleta, el entrenador no ve nada.

**Los helpers de acceso van en SECURITY DEFINER.** `is_workspace_member()` y `my_athlete_ids()` existen para eso: si una política de `workspace_members` consultara `workspace_members`, Postgres entra en recursión infinita.

**Fechas de calendario, siempre locales.** Usar `prToday()` y `prYMD(d)`. Nunca `new Date().toISOString()` para una fecha sin hora: devuelve el día UTC, que va atrasado para cualquiera al este de Greenwich antes del amanecer. Para marcas de tiempo completas, UTC está bien.

**Lecturas de más de 1000 filas, con `prFetchAll()`.** PostgREST corta cualquier consulta en unas 1000 filas sin avisar y `.limit()` no lo evita.

**Nada de texto fijo en la interfaz.** Toda pantalla nueva se traduce a los tres idiomas: `data-i18n` en el HTML y la clave en `locales/es.json`, `en.json` y `pt.json`. El español es neutro (de «tú»), sin voseo.

**El acento es la marca y la acción principal, nunca un estado.** Por eso «peligro» es un rojo más oscuro y «atención» es claramente amarillo: si el estado compartiera el color del acento se confundiría con el botón de guardar.

**El color de marca se elige; los colores de los tipos de trabajo NO.** El entrenador elige uno de los diez acentos de la paleta (`[data-accent="..."]` en `proa.css`) y con eso se pintan botones, menú activo, logo y enlaces. Los nueve colores de trabajo —gimnasio, campo, su club, partido, recuperación, comida, compromiso, viaje, descanso— son fijos para todos: su valor está en que se aprenden, y si cada entrenador los repinta, una captura compartida deja de entenderse y un atleta con dos entrenadores ve dos idiomas.

Cada acento declara **cuatro** valores (`--a`, `--a-lift`, `--a-on`, `--a-on-lift`) y el navegador deriva el resto con `color-mix`. Al agregar uno hay que tocar tres lugares: el bloque en `proa.css`, la lista de `assets/brand.js` y la restricción de `workspaces.accent` en la base. En `workspaces.accent` se guarda el **identificador**, nunca un código de color.

**Un bloque suelto sí se puede pintar, y eso no contradice lo de arriba.** `events.color` (null = el de su tipo) sirve para que UN bloque salte a la vista: el partido que importa, la sesión que no se mueve. Lo que no se toca es qué significa cada color: gimnasio sigue siendo naranja en todas las cuentas. La diferencia es entre pintar un bloque y repintar un idioma. Cuando hay color propio, la tinta del texto la decide `inkOn()` comparando contrastes —blanco sobre amarillo no se lee—, así que no hay que elegirla a mano.

**La orientación de la semana es de cada persona, no del espacio.** `profiles.week_layout` (`rows` o `cols`, null = filas). Se guarda además en el navegador para pintar sin esperar a la red. Un atleta con dos entrenadores no puede ver su semana cambiar de forma según quién se la armó, que es lo que pasaría si la eligiera el espacio de trabajo.

**La semana no sabe para dónde corre el tiempo.** El render escribe la posición en variables (`--a` y `--len` sobre el eje del tiempo, `--lane` y `--laneh` al través) y el CSS decide cuál eje es cuál. Al tocar la grilla o el arrastre hay que pensar en «a lo largo del tiempo» y «al través», no en izquierda y arriba, o una de las dos vistas se rompe en silencio.

**El catálogo de alimentos no ofrece lo que un preparador no indicaría.** Proa es una app de salud, y poder elegir algo de una lista es una forma de recomendarlo: por eso quedaron afuera el alcohol, la azúcar suelta y sus vehículos, y los condimentos que son casi solo grasa o azúcar añadida (decisión del 7 de septiembre de 2026, en `20260907130000_remove_junk_foods.sql`, con la lista de lo que se quedó y por qué). Lo que el atleta coma igual se puede anotar a mano con sus calorías, así que el registro no queda ciego — pero cuesta más, que es la intención.

**Suplementos: los que suman calorías van en el catálogo; los que no, en la ficha.** La proteína, la creatina y el gel se cargan como alimentos porque entran en el total del día. El magnesio, el omega 3 y las vitaminas viven en `athlete_supplements`, con dosis y momento: no se pesan en gramos ni aportan calorías, y meterlos como alimentos de cero calorías habría ensuciado la búsqueda de comida.

**Los módulos de ClavaMetrics se traen adaptados, nunca copiados tal cual.** Ya se trajeron el calendario, el editor de sesión, las comidas y la recuperación, y cada uno se adaptó al modelo de espacio de trabajo en el mismo movimiento. Lo que falte traer va igual: adaptándolo al llegar, no después.

---

## Base de datos

Proyecto de Supabase: `lryftqfhztzhawplljsu` (Frankfurt, `eu-central-1`).

Para aplicar un cambio de esquema:

```bash
# 1. editar db/schema.sql
# 2. copiar el cambio a una migración con fecha
cp db/schema.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_loquesea.sql
# 3. aplicar
supabase db push -p '<contraseña de la base>'
```

Tablas del Tramo 0: `profiles`, `workspaces`, `workspace_members`, `athletes`, `athlete_accounts`.
Tramo 1: `athlete_invites`, `athlete_intake`, `availability_slots`, más las funciones `create_athlete_invite`, `invite_preview` y `accept_athlete_invite`.
Tramo 2: `events`, más `copy_week`, `copy_day`, `move_event` y `clone_event`.
Tramo 3: `session_blocks`, `session_items`, `session_sets`, `meal_items`, `recovery_items`, `exercises`, `foods`.
Tramo 4: `wellness`, y las columnas de devolución de `events` (`rpe`, `actual_min`, `athlete_note`, `au`, `done_at`).

**`clone_event` enumera a mano las columnas de `events`.** Copiar un bloque, un
día, una semana o pasárselo a varios atletas pasan todos por ahí. Esa lista ya se
quedó corta tres veces —la duración, el RPE y el color— y el síntoma nunca es un
error: la copia sale distinta del original y hay que ir a mirar SQL para
entender por qué. Al agregar una columna a `events` hay que decidir si se copia;
`tests/clone-columns.test.mjs` compara las dos listas y avisa si aparece una
nueva sin decidir.

**`invite_preview` es anónima a propósito.** La pantalla del enlace la abre alguien que todavía no tiene cuenta, y necesita mostrar quién lo invita. Devuelve exactamente cuatro campos y nada más; `tests/invite-smoke.sh` lo verifica comparando el juego exacto de claves. Al tocarla, hay que mantener esa lista corta.

---

## Dónde vive

| | |
|---|---|
| Producción | https://proa-lake.vercel.app |
| Repo | https://github.com/joaqreiris/proa |
| Base de datos | Supabase `lryftqfhztzhawplljsu` · eu-central-1 |

Vercel publica la rama `main` sola. **No usar `cleanUrls`** en `vercel.json`: sirve las páginas sin extensión y manda un 308 desde `/Login.html`, con lo que la raíz deja de resolver y todos los enlaces internos (que llevan `.html`) rebotan.

## Pendiente de configurar

- [ ] **Comprar el dominio.** `proa.app` estaba libre al 2 de septiembre de 2026 (sin DNS, sin app de entrenamiento con ese nombre). Desbloquea el punto siguiente.
- [ ] **Invitación por correo** como canal extra. Hoy va por enlace, que además es como un preparador le pasa las cosas a su atleta.
- [ ] **Envío de correos.** Supabase **no tiene** servicio de correo propio: el remitente de fábrica solo manda a las direcciones del equipo y con un tope de un par por hora. Hay que cargar un SMTP externo (Resend, Postmark, SES) en Authentication · Emails · SMTP; la app no cambia. Para mandar desde una dirección propia hace falta el dominio verificado.
- [ ] **Volver a prender la confirmación por correo** (`mailer_autoconfirm = false`) junto con el SMTP, antes de que lo use alguien de afuera.
- [ ] **Textos de los correos** de confirmación y recuperación, con la voz de Proa.
- [ ] **Entrar con Google.** Falta dar de alta las credenciales en Supabase. La clave `auth.google` ya está en los tres idiomas esperando.

## Hecho

- [x] Repo en GitHub y proyecto en Vercel, con despliegue automático de `main`.
- [x] **Direcciones de retorno en Supabase** (Authentication · URL Configuration): *Site URL* apunta a Vercel y la lista de retorno incluye `https://proa-lake.vercel.app/**` y `http://localhost:4173/**`. Sin esto el correo de confirmación devuelve al lugar equivocado — es lo mismo que rompió el ingreso con Google en ClavaMetrics al cambiar de dominio.
- [x] **Confirmación por correo apagada mientras se desarrolla.** El registro entra directo. Es temporal, por lo del correo de arriba.
- [x] **Mínimo de contraseña en 8** también del lado del servidor, igual que el formulario.

---

## Los tramos

| | | |
|---|---|---|
| **0** | Cimientos | **hecho** — repo, base, marca, entrar, registrarse, alta del entrenador |
| **1** | El atleta y su cuenta | **hecho** — alta con cupos, invitación por enlace, ingreso del atleta, anamnesis con la grilla de horarios, perfil y ajustes. Su ficha se edita y se puede borrar, con el nombre escrito a mano |
| **2** | La semana | **hecho** — el calendario con la disponibilidad real de fondo, arrastrar para mover, copiar con Option o Command, repetir en varios días, y las dos orientaciones (días en filas o en columnas) |
| **3** | Los editores | **hecho** — gimnasio, campo, menú, recuperación, biblioteca de ejercicios |
| **4** | El ida y vuelta | **hecho** — marcar lo hecho, esfuerzo, parte diario, comentarios |
| 5 | Cobro | escalones de cupos con Paddle. **Lo único que falta**, y antes hay que decidir precios |

El plan completo, con el modelo de datos y las decisiones tomadas, está en `docs/plan.md`.
