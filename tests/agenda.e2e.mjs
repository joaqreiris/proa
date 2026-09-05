// El caso que pidió el usuario, tal cual: el entrenador en Camboya y la
// atleta en Uruguay.
//
// Se levanta un navegador con el reloj de Phnom Penh y se comprueban las dos
// mitades de la regla:
//
//   · En el perfil de Ana, sus horarios son LOS DE ELLA. El entrenamiento que
//     se cargó a las 18:00 se sigue viendo a las 18:00, aunque el que mira
//     esté del otro lado del mundo.
//   · En la agenda del entrenador, ese mismo entrenamiento aparece a las
//     04:00 y AL DÍA SIGUIENTE, que es cuando le toca a él.
//
//   SUPABASE_SERVICE_KEY=... node tests/agenda.e2e.mjs
//
// REGLA DE LIMPIEZA: borra SOLO el espacio de trabajo y el usuario que creó.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const req = createRequire('/Users/joaquinreiris/Desktop/Clava Metrics/package.json');
const { chromium } = req('playwright');

const URL_ = 'https://lryftqfhztzhawplljsu.supabase.co';
const REF = 'lryftqfhztzhawplljsu';
const ANON = 'sb_publishable_P8xCadyfCsOPNX0b4cy1Uw_l8pomxIN';
const SVC = process.env.SUPABASE_SERVICE_KEY;
if (!SVC) { console.error('falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const PORT = 8901;

const MVD = 'America/Montevideo';
const PNH = 'Asia/Phnom_Penh';

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

const api = (path, opts = {}, token = ANON) => fetch(`${URL_}/rest/v1/${path}`, {
  ...opts,
  headers: {
    apikey: ANON, Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {})
  }
}).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch { return t; } });
const mk = (t, table, body) => api(table, { method: 'POST', body: JSON.stringify(body) }, t).then(r => r[0].id);

// El martes de la semana en curso, leído con el reloj de Phnom Penh, que es
// donde va a estar parado el navegador de la prueba.
function todayInPnh() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PNH }).format(new Date());
}

function tuesdayInPnh() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: PNH, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date()).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  const days = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const base = Date.UTC(+p.year, +p.month - 1, +p.day);
  const monday = base - days[p.weekday] * 86400000;
  return new Date(monday + 86400000).toISOString().slice(0, 10);
}

const run = async () => {
  const email = `ag.${Math.floor(Math.random() * 1e6)}@proa-test.dev`;
  const PW = 'ProaSmoke12345';

  const user = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, email_confirm: true, user_metadata: { full_name: 'Agenda Test' } })
  }).then(r => r.json());

  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW })
  }).then(r => r.json());
  const T = session.access_token;

  await api(`profiles?id=eq.${user.id}`, {
    method: 'PATCH', body: JSON.stringify({ onboarded_at: new Date().toISOString() })
  }, T);

  const ws  = await mk(T, 'workspaces', { name: 'Agenda', owner_id: user.id });
  const ana = await mk(T, 'athletes', { workspace_id: ws, first_name: 'Ana', last_name: 'Diaz', timezone: MVD });
  await mk(T, 'athletes', { workspace_id: ws, first_name: 'Beto', last_name: 'Cruz', timezone: PNH });

  const day = tuesdayInPnh();
  // Segundo evento, para probar el inicio: guardado AYER (hora de Ana) pero
  // que cae en MI hoy. Es el caso que Home dejaba afuera cuando solo pedía
  // los eventos con fecha de hoy.
  const yest = new Date(Date.parse(todayInPnh() + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const evHome = await mk(T, 'events', {
    athlete_id: ana, date: yest, start_time: '18:00', end_time: '19:00',
    type: 'field', title: 'Campo'
  });
  const ev = await mk(T, 'events', {
    athlete_id: ana, date: day, start_time: '18:00', end_time: '19:30',
    type: 'gym', title: 'Fuerza A'
  });

  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  const browser = await chromium.launch();
  const errs = [];

  try {
    await new Promise(r => setTimeout(r, 700));
    // El entrenador está en Camboya.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: PNH });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(([ref, s]) =>
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)), [REF, session]);

    // ── El perfil de Ana ──────────────────────────────────────────────────
    await page.goto(`http://localhost:${PORT}/Athlete.html?id=${ana}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#wb-rows [data-event]', { timeout: 15000 });
    ok('la semana se ve dentro del perfil del atleta');

    // En la grilla la hora se lee por la POSICIÓN del bloque, no por su texto;
    // el texto es el título. La hora completa está en el title del elemento.
    const tip = await page.locator(`#wb-rows [data-event="${ev}"]`).first().getAttribute('title');
    tip.includes('18:00')
      ? ok('en su perfil el bloque sigue a las 18:00 — la hora de ella')
      : no('la hora del atleta cambió', tip);

    const note = await page.locator('#wb-tz').innerText();
    note.includes('Montevideo')
      ? ok('avisa que los horarios son los de ella, en Montevideo')
      : no('falta el aviso de huso', note);

    // La ficha sigue estando, en su pestaña.
    await page.click('[data-tab="profile"]');
    is('la ficha está en la otra pestaña',
       await page.locator('#pane-profile').isVisible(), true);
    is('y la semana se esconde', await page.locator('#pane-week').isVisible(), false);

    // ── El inicio ─────────────────────────────────────────────────────────
    await page.goto(`http://localhost:${PORT}/Home.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.home-ath', { timeout: 15000 });
    const home = await page.locator('#day').innerText();
    home.includes('Campo')
      ? ok('el inicio muestra lo que cae en MI hoy, aunque esté guardado con la fecha de ayer')
      : no('el inicio se perdió el bloque', home);
    home.includes('04:00')
      ? ok('y lo muestra a mi hora') : no('no convirtió en el inicio', home);
    home.includes('18:00') && home.includes('Montevideo')
      ? ok('con la hora de ella debajo') : no('falta la hora del atleta en el inicio', home);

    // ── La agenda del entrenador ──────────────────────────────────────────
    await page.goto(`http://localhost:${PORT}/Week.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector(`[data-ev="${ev}"]`, { timeout: 15000 });

    const row = await page.locator(`[data-ev="${ev}"]`).innerText();
    row.includes('04:00')
      ? ok('en su agenda aparece a las 04:00 — la hora de él')
      : no('no convirtió a la hora del entrenador', row);
    row.includes('18:00') && row.includes('Montevideo')
      ? ok('y debajo, la hora de ella con su ciudad')
      : no('falta la hora del atleta', row);
    row.includes('Ana')
      ? ok('dice de quién es') : no('no dice de quién es', row);

    // Lo importante del huso: cae en OTRO día. Miércoles, no martes.
    const dayOfRow = await page.evaluate((id) => {
      const b = document.querySelector(`[data-ev="${id}"]`);
      return b.closest('.ag-day').querySelector('h2').textContent;
    }, ev);
    const wanted = new Date(Date.parse(day + 'T00:00:00Z') + 86400000)
      .toISOString().slice(8, 10).replace(/^0/, '');
    dayOfRow.includes(wanted)
      ? ok('y cae al día siguiente, que es cuando le toca a él')
      : no('quedó en el día equivocado', { dayOfRow, wanted });

    // Los dos: el del martes y el de hoy. Se cuentan por el día EN QUE ME
    // TOCAN A MÍ, no por la fecha con la que están guardados.
    is('la agenda cuenta los dos bloques de la semana',
       await page.locator('#n-blocks').innerText(), '2');

    errs.length === 0 ? ok('ninguna página tiró errores') : no('errores', errs.slice(0, 3));
  } finally {
    await browser.close();
    server.kill();
    await fetch(`${URL_}/rest/v1/workspaces?id=eq.${ws}`, {
      method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` }
    });
    await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` }
    });
  }

  console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error(e); process.exit(1); });
