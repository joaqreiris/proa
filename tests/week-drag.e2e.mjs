// Arrastrar un bloque en la semana, en un navegador de verdad.
//
// Es puro gesto: no se puede comprobar leyendo el código. Se prueban las tres
// cosas que lo hacen usable —que caiga donde se soltó, que Option copie en vez
// de mover, y que un clic siga siendo un clic— y la que lo hace confiable:
// que lo que se ve en pantalla sea lo que quedó en la base.
//
//   SUPABASE_SERVICE_KEY=... node tests/week-drag.e2e.mjs
//
// REGLA DE LIMPIEZA: borra SOLO el espacio de trabajo y el usuario que creó.

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
const PORT = 8907, PW = 'ProaSmoke12345';

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };

const api = (path, opts = {}, token = ANON) => fetch(`${URL_}/rest/v1/${path}`, {
  ...opts,
  headers: { apikey: ANON, Authorization: `Bearer ${token}`,
             'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) }
}).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch { return t; } });
const mk = (tok, table, body) => api(table, { method: 'POST', body: JSON.stringify(body) }, tok).then(r => r[0].id);

const run = async () => {
  const email = `wd.${Math.floor(Math.random() * 1e6)}@proa-test.dev`;
  const user = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, email_confirm: true, user_metadata: { full_name: 'Drag Week' } })
  }).then(r => r.json());
  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW })
  }).then(r => r.json());
  const T = session.access_token;

  await api(`profiles?id=eq.${user.id}`, {
    method: 'PATCH', body: JSON.stringify({ onboarded_at: new Date().toISOString() })
  }, T);

  const ws  = await mk(T, 'workspaces', { name: 'Drag', owner_id: user.id });
  const ath = await mk(T, 'athletes', { workspace_id: ws, first_name: 'Ana', timezone: 'America/Montevideo' });

  // El lunes de la semana en curso, leído con el mismo reloj que el navegador.
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const monday = ymd(mon);
  const wed = ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 2));

  const ev = await mk(T, 'events', {
    athlete_id: ath, date: monday, start_time: '10:00', end_time: '11:00', type: 'gym', title: 'Fuerza A'
  });
  const blk = await mk(T, 'session_blocks', { event_id: ev, position: 1, kind: 'str' });
  await mk(T, 'session_items', { block_id: blk, position: 1, name: 'Sentadilla', load: '80%' });

  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  const browser = await chromium.launch();
  const errs = [];

  try {
    await new Promise(r => setTimeout(r, 700));
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'es-UY' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(([ref, s]) =>
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)), [REF, session]);

    await page.goto(`http://localhost:${PORT}/Athlete.html?id=${ath}`, { waitUntil: 'networkidle' });
    await page.waitForSelector(`[data-event="${ev}"]`, { timeout: 15000 });

    // Cuánto mide una hora en píxeles, para apuntar a una hora concreta.
    const geo = async () => page.evaluate((d) => {
      const tr = document.querySelector(`.wk-track[data-date="${d}"]`).getBoundingClientRect();
      return { left: tr.left, width: tr.width, top: tr.top, h: tr.height };
    }, wed);

    // ── 1. Mover: del lunes 10:00 al miércoles 15:00 ──────────────────────
    const drag = async (toDate, toHour, alt) => {
      const el = await page.locator(`[data-event="${ev}"]`).first().boundingBox();
      const tr = await page.evaluate((d) => {
        const r = document.querySelector(`.wk-track[data-date="${d}"]`).getBoundingClientRect();
        return { left: r.left, width: r.width, top: r.top, h: r.height };
      }, toDate);
      const pxPerMin = tr.width / (18 * 60);
      const x = tr.left + (toHour * 60 - 6 * 60) * pxPerMin + 2;   // +2: se agarra cerca del borde
      const y = tr.top + tr.h / 2;
      if (alt) await page.keyboard.down('Alt');
      await page.mouse.move(el.x + 2, el.y + el.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(el.x + 2 + (x - el.x - 2) * i / 10,
                              el.y + el.height / 2 + (y - el.y - el.height / 2) * i / 10);
        await page.waitForTimeout(15);
      }
      const tag = await page.locator('.wk-drop-tag').count();
      await page.mouse.up();
      if (alt) await page.keyboard.up('Alt');
      await page.waitForTimeout(1200);
      return tag;
    };

    const tagShown = await drag(wed, 15, false);
    tagShown > 0 ? ok('mientras arrastras se ve el hueco con la hora nueva')
                 : no('no aparece el cartel de destino', tagShown);

    const moved = (await api(`events?select=date,start_time,end_time&id=eq.${ev}`, {}, T))[0];
    moved.date === wed && moved.start_time === '15:00:00' && moved.end_time === '16:00:00'
      ? ok('el bloque cayó en el miércoles a las 15:00, con su misma duración')
      : no('cayó en otro lado', moved);

    const n1 = (await api(`events?select=id&athlete_id=eq.${ath}`, {}, T)).length;
    n1 === 1 ? ok('mover no duplica') : no('mover duplicó', n1);

    // ── 2. Copiar con Option ──────────────────────────────────────────────
    await drag(monday, 8, true);
    const all = await api(`events?select=id,date,start_time&athlete_id=eq.${ath}&order=date`, {}, T);
    all.length === 2 ? ok('con Option apretado, copia en vez de mover') : no('no copió', all);
    const copy = all.find(x => x.id !== ev);
    copy && copy.date === monday && copy.start_time === '08:00:00'
      ? ok('la copia quedó donde se soltó') : no('la copia cayó mal', all);
    const orig = all.find(x => x.id === ev);
    orig && orig.date === wed && orig.start_time === '15:00:00'
      ? ok('y el original no se movió') : no('el original se movió', all);

    const cb = await api(`session_blocks?select=id&event_id=eq.${copy.id}`, {}, T);
    cb.length === 1 ? ok('la copia se llevó el contenido') : no('copia vacía', cb);

    // ── 3. Un clic sigue abriendo el bloque ───────────────────────────────
    await page.click(`[data-event="${ev}"]`);
    await page.waitForSelector('#m-ev:not([hidden])', { timeout: 8000 });
    ok('un clic sin arrastrar sigue abriendo el bloque');

    // ── 4. Repetir en varios días ─────────────────────────────────────────
    // El modal del bloque ya está abierto por la prueba anterior.
    await page.click('#e-rep');
    await page.waitForSelector('#m-rep:not([hidden])');
    const src = await page.locator('#rep-days .is-src').getAttribute('data-wd');
    // Dos días más, distintos del propio.
    const others = ['0', '1', '3', '4'].filter(x => x !== src).slice(0, 2);
    for (const wd of others) await page.click(`#rep-days [data-wd="${wd}"]`);
    await page.fill('#rep-weeks', '2');
    // Tres días marcados (los dos elegidos + el propio, que va fijo) por dos
    // semanas son seis fechas, menos la del bloque original que ya existe: 5.
    const count = await page.locator('#rep-count').innerText();
    count.includes('5') ? ok('avisa cuántas copias va a crear antes de hacerlo')
                        : no('no dice cuántas', count);
    await page.click('#f-rep button[type="submit"]');
    await page.waitForSelector('#m-rep', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(1500);

    const after = await api(`events?select=id,date,start_time&athlete_id=eq.${ath}`, {}, T);
    after.length === 7 ? ok('repetir dos días más durante dos semanas creó las cinco copias')
                       : no('cantidad de copias', after.length);

    // Todas las copias nuevas van a la hora del original. Que dos caigan el
    // mismo día es normal —puede haber dos bloques en un día— así que lo que
    // se comprueba es el horario y el día de la semana, no que no se repitan.
    const nuevas = after.filter(x => x.id !== ev && x.start_time === '15:00:00');
    const wds = new Set(nuevas.map(x => (new Date(x.date + 'T00:00:00').getDay() + 6) % 7));
    nuevas.length === 5 ? ok('todas quedaron a la hora del original')
                        : no('alguna cambió de hora', nuevas);
    [...wds].every(w => [Number(src), ...others.map(Number)].includes(w))
      ? ok('y solo en los días que se marcaron') : no('cayó en un día que no se marcó', [...wds]);

    errs.length === 0 ? ok('ninguna página tiró errores') : no('errores', errs.slice(0, 3));
  } finally {
    await browser.close();
    server.kill();
    await fetch(`${URL_}/rest/v1/workspaces?id=eq.${ws}`, {
      method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
    await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  }

  console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error(e); process.exit(1); });
