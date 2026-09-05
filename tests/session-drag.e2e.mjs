// El recorrido completo de arrastrar un bloque: navegador de verdad, sesión
// de verdad, base de verdad.
//
// La prueba de sortable.dom mira el gesto sobre una lista de mentira; esta
// mira que ese gesto, hecho sobre la pantalla real, termine guardado. Entre
// una y otra está todo lo que puede fallar: que el tirador no esté donde se
// cree, que la regla no se registre, que el RPC reciba otra cosa.
//
//   SUPABASE_SERVICE_KEY=... node tests/session-drag.e2e.mjs
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
const PORT = 8899;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };

const api = (path, opts = {}, token = ANON) => fetch(`${URL_}/rest/v1/${path}`, {
  ...opts,
  headers: {
    apikey: ANON, Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
    ...(opts.headers || {})
  }
}).then(r => r.text()).then(t => { try { return JSON.parse(t); } catch { return t; } });

const mk = (t, table, body) => api(table, { method: 'POST', body: JSON.stringify(body) }, t).then(r => r[0].id);

const run = async () => {
  // ── Datos de la prueba ──────────────────────────────────────────────────
  const email = `drag.${Math.floor(Math.random() * 1e6)}@proa-test.dev`;
  const PW = 'ProaSmoke12345';

  const user = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, email_confirm: true, user_metadata: { full_name: 'Drag Test' } })
  }).then(r => r.json());

  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW })
  }).then(r => r.json());
  const T = session.access_token;

  // El perfil arranca sin `onboarded_at` y la app manda al asistente de alta.
  // Se marca como ya hecho: lo que se prueba acá es arrastrar, no el alta.
  await api(`profiles?id=eq.${user.id}`, {
    method: 'PATCH', body: JSON.stringify({ onboarded_at: new Date().toISOString() })
  }, T);

  const ws = await mk(T, 'workspaces', { name: 'Drag', owner_id: user.id });
  const ath = await mk(T, 'athletes', { workspace_id: ws, first_name: 'Ana' });
  const ev = await mk(T, 'events', { athlete_id: ath, date: '2026-09-07', type: 'gym' });
  const B = [];
  for (const [i, kind] of [[1, 'warmup'], [2, 'str'], [3, 'cool']]) {
    B.push(await mk(T, 'session_blocks', { event_id: ev, position: i, kind }));
  }
  const I = [];
  for (const [i, name] of [[1, 'Sentadilla'], [2, 'Peso muerto']]) {
    I.push(await mk(T, 'session_items', { block_id: B[0], position: i, name }));
  }

  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  const browser = await chromium.launch();
  const errs = [];

  try {
    await new Promise(r => setTimeout(r, 700));
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.addInitScript(([ref, s]) => {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s));
    }, [REF, session]);

    await page.goto(`http://localhost:${PORT}/Session.html?event=${ev}`, { waitUntil: 'networkidle' });
    if (process.env.DEBUG) {
      await page.waitForTimeout(3000);
      console.log('URL:', page.url());
      console.log('errores:', errs.slice(0, 5));
      console.log('main hidden:', await page.evaluate(() => { const m = document.getElementById('main'); return m ? m.hidden : 'sin main'; }));
      console.log('storage:', await page.evaluate(() => Object.keys(localStorage)));
    }
    await page.waitForSelector('[data-block]', { timeout: 15000 });

    const shown = await page.$$eval('[data-block]', els => els.map(e => e.dataset.block));
    JSON.stringify(shown) === JSON.stringify(B)
      ? ok('la sesión abrió con los 3 bloques en orden')
      : no('orden inicial en pantalla', { shown, B });

    // Arrastra el último bloque hasta arriba del todo, agarrándolo por la letra.
    const grip = await page.locator(`[data-block="${B[2]}"] [data-grip]`).boundingBox();
    const top = await page.locator(`[data-block="${B[0]}"]`).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    const toY = top.y + 8;
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(grip.x + grip.width / 2,
        grip.y + grip.height / 2 + (toY - (grip.y + grip.height / 2)) * i / 12);
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
    await page.waitForTimeout(900);

    const after = await page.$$eval('[data-block]', els => els.map(e => e.dataset.block));
    JSON.stringify(after) === JSON.stringify([B[2], B[0], B[1]])
      ? ok('en pantalla el bloque quedó primero')
      : no('orden en pantalla tras soltar', { after });

    const rows = await api(`session_blocks?select=id,position&event_id=eq.${ev}&order=position`, {}, T);
    const saved = rows.map(r => r.id);
    JSON.stringify(saved) === JSON.stringify([B[2], B[0], B[1]])
      ? ok('la base guardó el orden nuevo')
      : no('orden guardado', { saved });

    // Recargar tiene que mostrar lo mismo: es la prueba de que se guardó de
    // verdad y no solo en la pantalla.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-block]');
    const again = await page.$$eval('[data-block]', els => els.map(e => e.dataset.block));
    JSON.stringify(again) === JSON.stringify([B[2], B[0], B[1]])
      ? ok('al recargar sigue en el orden nuevo')
      : no('tras recargar', { again });

    // ── Llevar un ejercicio a otro bloque ─────────────────────────────────
    // Es el gesto más delicado: cruza de una lista a otra, y arrastra consigo
    // el detalle que el ejercicio tenga abierto.
    const src = await page.locator(`[data-item="${I[0]}"] [data-grip]`).boundingBox();
    const dst = await page.locator(`[data-block="${B[1]}"] .se-items`).boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    const ty = dst.y + dst.height / 2;
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(src.x + src.width / 2 + 30,
        src.y + src.height / 2 + (ty - (src.y + src.height / 2)) * i / 12);
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
    await page.waitForTimeout(900);

    const moved = await api(`session_items?select=id,block_id&id=eq.${I[0]}`, {}, T);
    moved[0] && moved[0].block_id === B[1]
      ? ok('el ejercicio se mudó de bloque y quedó guardado')
      : no('el ejercicio no se mudó', moved);

    const left = await api(`session_items?select=id&block_id=eq.${B[0]}`, {}, T);
    left.length === 1 && left[0].id === I[1]
      ? ok('el bloque de origen quedó con el que faltaba')
      : no('origen', left);

    errs.length === 0 ? ok('la página no tiró ningún error')
                      : no('errores en la página', errs.slice(0, 3));
  } finally {
    await browser.close();
    server.kill();
    // Limpieza: solo lo de esta prueba.
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
