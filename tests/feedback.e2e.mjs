// El ida y vuelta completo, con dos navegadores de verdad.
//
// Es la prueba del circuito entero, que es lo único que dice si esto sirve:
//   el entrenador planifica → el atleta lo ve, lo hace y lo cuenta →
//   el entrenador se entera.
//
// Y una parte que importa tanto como el resto: que el atleta pueda contar
// pero NO cambiar su plan. Se prueba a mano, atacando la base de frente.
//
//   SUPABASE_SERVICE_KEY=... node tests/feedback.e2e.mjs
//
// REGLA DE LIMPIEZA: borra SOLO el espacio de trabajo y los dos usuarios que creó.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const URL_ = 'https://lryftqfhztzhawplljsu.supabase.co';
const REF = 'lryftqfhztzhawplljsu';
const ANON = 'sb_publishable_P8xCadyfCsOPNX0b4cy1Uw_l8pomxIN';
const SVC = process.env.SUPABASE_SERVICE_KEY;
if (!SVC) { console.error('falta SUPABASE_SERVICE_KEY'); process.exit(1); }
const PORT = 8903;
const PW = 'ProaSmoke12345';

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
const mk = (tok, table, body) => api(table, { method: 'POST', body: JSON.stringify(body) }, tok).then(r => r[0].id);

const mkUser = (email, meta) => fetch(`${URL_}/auth/v1/admin/users`, {
  method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: PW, email_confirm: true, user_metadata: meta })
}).then(r => r.json());

const login = (email) => fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: PW })
}).then(r => r.json());

const run = async () => {
  const n = Math.floor(Math.random() * 1e6);
  const coachMail = `fbc.${n}@proa-test.dev`;
  const athMail   = `fba.${n}@proa-test.dev`;

  const coach = await mkUser(coachMail, { full_name: 'Coach Test' });
  const athU  = await mkUser(athMail,   { full_name: 'Ana Test', role: 'athlete' });
  const cs = await login(coachMail);
  const as = await login(athMail);
  const T = cs.access_token;

  await api(`profiles?id=eq.${coach.id}`, {
    method: 'PATCH', body: JSON.stringify({ onboarded_at: new Date().toISOString() })
  }, T);

  const ws  = await mk(T, 'workspaces', { name: 'Feedback', owner_id: coach.id });
  const ath = await mk(T, 'athletes', { workspace_id: ws, first_name: 'Ana', last_name: 'Diaz' });
  await api('athlete_accounts', {
    method: 'POST', body: JSON.stringify({ athlete_id: ath, user_id: athU.id })
  }, T);

  // El entrenador arma la sesión de hoy.
  const today = new Date().toISOString().slice(0, 10);
  const ev  = await mk(T, 'events', {
    athlete_id: ath, date: today, start_time: '18:00', end_time: '19:00',
    type: 'gym', title: 'Fuerza A', location: 'Sala 2'
  });
  const blk = await mk(T, 'session_blocks', {
    event_id: ev, position: 1, kind: 'str', title: 'Bloque principal', duration_min: 30, rpe: 7
  });
  await mk(T, 'session_items', {
    block_id: blk, position: 1, name: 'Sentadilla trasera', sets: 4, reps: '5', load: '80%', rest_s: 180
  });

  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  const browser = await chromium.launch();
  const errs = [];

  try {
    await new Promise(r => setTimeout(r, 700));
    const mkPage = async (session) => {
      // En español, que es el idioma en el que están escritas las afirmaciones
      // de abajo y el que tendría un atleta uruguayo.
      const ctx = await browser.newContext({ viewport: { width: 480, height: 1000 }, locale: 'es-UY' });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(String(e)));
      p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      await p.addInitScript(([ref, s]) =>
        localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)), [REF, session]);
      return p;
    };

    // ── El atleta ─────────────────────────────────────────────────────────
    const app = await mkPage(as);
    await app.goto(`http://localhost:${PORT}/athlete/Week.html`, { waitUntil: 'networkidle' });
    await app.waitForSelector(`[data-ev="${ev}"]`, { timeout: 15000 });
    ok('el atleta ve el bloque de hoy');

    const card = await app.locator(`[data-ev="${ev}"]`).innerText();
    card.includes('Fuerza A') ? ok('con el nombre que le puso el entrenador') : no('nombre', card);
    card.toLowerCase().includes('cómo te fue')
      ? ok('y le pide el parte') : no('no pide el parte', card);

    // Toca el bloque: como es gimnasio, va a la sesión.
    await app.click(`[data-ev="${ev}"]`);
    await app.waitForSelector('.as-item', { timeout: 15000 });
    const sess = await app.locator('#blocks').innerText();
    sess.includes('Sentadilla trasera') ? ok('la sesión le muestra el ejercicio') : no('ejercicio', sess);
    sess.includes('80%') ? ok('con la carga que le prescribieron') : no('carga', sess);

    // El parte.
    await app.click('#log');
    await app.waitForSelector('#m-log:not([hidden])');
    await app.click('[data-did="done"]');
    await app.click('#log-rpe [data-rpe="8"]');
    const word = await app.locator('#log-rpe-word').innerText();
    word.toLowerCase().includes('duro')
      ? ok('cada número dice lo que significa') : no('el 8 no dice nada', word);
    await app.fill('#log-min', '55');
    const au = await app.locator('#log-au').innerText();
    au.includes('440') ? ok('y le muestra la carga en vivo (55 × 8)') : no('carga en vivo', au);
    await app.fill('#log-note', 'Molestia en el aductor derecho.');
    await app.click('#log-save');
    await app.waitForSelector('#m-log', { state: 'hidden', timeout: 10000 });

    const saved = (await api(`events?select=status,rpe,actual_min,au,athlete_note,done_at&id=eq.${ev}`, {}, T))[0];
    is('quedó guardado el parte entero',
       [saved.status, saved.rpe, saved.actual_min, saved.au, saved.athlete_note],
       ['done', 8, 55, 440, 'Molestia en el aductor derecho.']);
    saved.done_at ? ok('con la marca de cuándo lo dio por hecho') : no('sin done_at', saved);

    // El parte del día.
    await app.goto(`http://localhost:${PORT}/athlete/Week.html`, { waitUntil: 'networkidle' });
    await app.waitForSelector('#wl-form .aw-face');
    await app.fill('#wl-h', '7.5');
    for (const [k, v] of [['sleep_quality', 4], ['legs', 3], ['energy', 4], ['mood', 5], ['calm', 4]]) {
      await app.click(`[data-wl="${k}"] [data-v="${v}"]`);
    }
    await app.fill('#wl-note', 'Dormí cortado.');
    await app.click('#wl-save');
    await app.waitForSelector('#wl-done:not([hidden])', { timeout: 10000 });

    const w = (await api(`wellness?select=*&athlete_id=eq.${ath}&date=eq.${today}`, {}, T))[0];
    is('el parte del día quedó guardado, con su total',
       // sleep_h es numeric: según el caso vuelve como número o como texto, así
       // que se compara el valor y no cómo viene escrito.
       [Number(w.sleep_h), w.sleep_quality, w.legs, w.energy, w.mood, w.calm, w.score],
       [7.5, 4, 3, 4, 5, 4, 20]);

    // ── Lo que el atleta NO puede hacer ───────────────────────────────────
    // Atacando la base de frente, sin pasar por la pantalla.
    const hack = await api(`events?id=eq.${ev}`, {
      method: 'PATCH', body: JSON.stringify({ date: '2027-01-01', title: 'Cambiado' })
    }, as.access_token);
    const after = (await api(`events?select=date,title&id=eq.${ev}`, {}, T))[0];
    after.date === today && after.title === 'Fuerza A'
      ? ok('el atleta NO puede cambiar su plan, ni yendo por abajo')
      : no('AGUJERO: el atleta cambió su plan', { hack, after });

    // ── El entrenador ─────────────────────────────────────────────────────
    const cp = await mkPage(cs);
    await cp.setViewportSize({ width: 1280, height: 1000 });
    await cp.goto(`http://localhost:${PORT}/Week.html`, { waitUntil: 'networkidle' });
    await cp.waitForSelector(`[data-ev="${ev}"]`, { timeout: 15000 });
    const row = await cp.locator(`[data-ev="${ev}"]`).innerText();
    row.includes('8') && row.includes('440')
      ? ok('en la agenda del entrenador se ve el RPE y la carga')
      : no('la agenda no muestra el parte', row);

    await cp.goto(`http://localhost:${PORT}/Athlete.html?id=${ath}#profile`, { waitUntil: 'networkidle' });
    await cp.waitForSelector('#wl-card:not([hidden])', { timeout: 15000 });
    const strip = await cp.locator('#wl-strip').innerText();
    ok('el perfil muestra cómo viene el atleta');
    const note = await cp.locator('#wl-note').innerText();
    note.includes('Dormí cortado')
      ? ok('y lo último que escribió') : no('falta la nota', { note, strip });

    errs.length === 0 ? ok('ninguna página tiró errores') : no('errores', errs.slice(0, 3));
  } finally {
    await browser.close();
    server.kill();
    await fetch(`${URL_}/rest/v1/workspaces?id=eq.${ws}`, {
      method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` }
    });
    for (const u of [coach.id, athU.id]) {
      await fetch(`${URL_}/auth/v1/admin/users/${u}`, {
        method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` }
      });
    }
  }

  console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error(e); process.exit(1); });
