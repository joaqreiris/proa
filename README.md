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

assets/
  brand.js            La marca (la proa) y el tema. Se carga PRIMERO, sin defer.
  supabase-init.js    Cliente de Supabase, contexto y las dos puertas de acceso.
  i18n.js             Motor de idiomas. Copiado de ClavaMetrics, prefijo PR_.
  sidebar.js          Riel lateral compartido.
  vendor/             supabase-js con la versión fija.

locales/              es · en · pt
db/schema.sql         Esquema de la base. Fuente de verdad.
supabase/migrations/  Lo que se aplica de verdad contra el proyecto.
```

---

## Reglas del proyecto

**La unidad de tenencia es el espacio de trabajo, no el club.** Toda consulta filtra por `workspace_id`. Es el equivalente de `club_id` en ClavaMetrics.

**Cada tabla tiene DOS puertas.** El entrenador ve todo lo de su espacio; el atleta ve únicamente sus propias filas. Al crear una tabla hay que declarar las dos políticas. Si solo se declara la del entrenador, el atleta no ve nada; si solo la del atleta, el entrenador no ve nada.

**Los helpers de acceso van en SECURITY DEFINER.** `is_workspace_member()` y `my_athlete_ids()` existen para eso: si una política de `workspace_members` consultara `workspace_members`, Postgres entra en recursión infinita.

**Fechas de calendario, siempre locales.** Usar `prToday()` y `prYMD(d)`. Nunca `new Date().toISOString()` para una fecha sin hora: devuelve el día UTC, que va atrasado para cualquiera al este de Greenwich antes del amanecer. Para marcas de tiempo completas, UTC está bien.

**Lecturas de más de 1000 filas, con `prFetchAll()`.** PostgREST corta cualquier consulta en unas 1000 filas sin avisar y `.limit()` no lo evita.

**Nada de texto fijo en la interfaz.** Toda pantalla nueva se traduce a los tres idiomas: `data-i18n` en el HTML y la clave en `locales/es.json`, `en.json` y `pt.json`. El español es neutro (de «tú»), sin voseo.

**El naranja es la marca y la acción principal, nunca un estado.** Por eso «peligro» es un rojo más oscuro y «atención» es claramente amarillo: si el estado fuera naranja se confundiría con el botón de guardar.

**No copiar módulos de ClavaMetrics todavía.** El calendario, el planificador de gimnasio, las comidas y las evaluaciones se traen en su tramo, y se adaptan al modelo de espacio de trabajo en el mismo movimiento. Copiarlos ahora obliga a adaptarlos dos veces.

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

---

## Dónde vive

| | |
|---|---|
| Producción | https://proa-lake.vercel.app |
| Repo | https://github.com/joaqreiris/proa |
| Base de datos | Supabase `lryftqfhztzhawplljsu` · eu-central-1 |

Vercel publica la rama `main` sola. **No usar `cleanUrls`** en `vercel.json`: sirve las páginas sin extensión y manda un 308 desde `/Login.html`, con lo que la raíz deja de resolver y todos los enlaces internos (que llevan `.html`) rebotan.

## Pendiente de configurar

- [ ] **Envío de correos.** El servicio interno de Supabase solo manda a las direcciones del equipo y con un tope de un par por hora: registrarse con un correo cualquiera **no recibe nada**. Hay que conectar un SMTP propio (Resend o similar) antes de que lo pruebe alguien de afuera.
- [ ] **Textos de los correos** de confirmación y recuperación, con la voz de Proa.
- [ ] **Comprar el dominio.** `proa.app` estaba libre al 2 de septiembre de 2026 (sin DNS, sin app de entrenamiento con ese nombre).
- [ ] **Entrar con Google.** Falta dar de alta las credenciales en Supabase. La clave `auth.google` ya está en los tres idiomas esperando.

## Hecho

- [x] Repo en GitHub y proyecto en Vercel, con despliegue automático de `main`.
- [x] **Direcciones de retorno en Supabase** (Authentication · URL Configuration): *Site URL* apunta a Vercel y la lista de retorno incluye `https://proa-lake.vercel.app/**` y `http://localhost:4173/**`. Sin esto el correo de confirmación devuelve al lugar equivocado — es lo mismo que rompió el ingreso con Google en ClavaMetrics al cambiar de dominio.

---

## Los tramos

| | | |
|---|---|---|
| **0** | Cimientos | **hecho** — repo, base, marca, entrar, registrarse, alta del entrenador |
| 1 | El atleta y su cuenta | alta con cupos, invitación, ingreso del atleta, anamnesis, perfil |
| 2 | La semana | el calendario con la disponibilidad real pintada de fondo |
| 3 | Los editores | gimnasio, campo, menú, recuperación, biblioteca de ejercicios |
| 4 | El ida y vuelta | marcar lo hecho, esfuerzo, parte diario, video, comentarios |
| 5 | Cobro | escalones de cupos con Paddle |

El plan completo, con el modelo de datos y las decisiones tomadas, está en `docs/plan.md`.
