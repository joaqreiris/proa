// Los atajos del tablero, con el tablero de verdad.
//
// Lo que se prueba no es tanto que funcionen como que NO molesten. Un atajo que
// se dispara mientras escribís te come el texto y te hace desconfiar del
// teclado para siempre, así que las dos reglas —no con el foco en un campo, y
// con un modal abierto mandan los suyos— pesan más que los atajos mismos.
//
//   node tests/shortcuts.dom.test.mjs
//
// Se levanta Athletes.html… no: el tablero vive en la ficha del atleta, así que
// se monta week-board.js sobre un Supabase de mentira, igual que en la prueba
// de editar y borrar.

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8917;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

const ATLETA = {
  id: 'a-1', workspace_id: 'w-1', first_name: 'Ana', last_name: 'Díaz',
  timezone: 'America/Montevideo', status: 'active',
};
const EVENTO = {
  id: 'e-1', athlete_id: 'a-1', date: '2026-03-03',
  start_time: '19:00', end_time: '20:30', type: 'team_training',
  title: '1er equipo', color: null, status: 'planned',
};

const FALSO = `
  window.__sql = [];
  const ATLETA = ${JSON.stringify(ATLETA)};
  const EVENTO = ${JSON.stringify(EVENTO)};
  // El doble contesta a cualquier filtro encadenado sin tener que enumerarlos:
  // select, eq, neq, gte, order, limit… todos devuelven la misma consulta. Solo
  // se escriben los que hacen algo distinto — los que escriben y los que
  // terminan la cadena.
  const tabla = (t) => {
    const filas = t === 'athletes' ? [ATLETA] : t === 'events' ? [EVENTO] : [];
    const propios = {
      insert(row) { window.__sql.push({ op: 'insert', t, row }); return q; },
      update(row) { window.__sql.push({ op: 'update', t, row }); return q; },
      delete() { window.__sql.push({ op: 'delete', t }); return q; },
      single: () => Promise.resolve({ data: filas[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: filas[0] || null, error: null }),
      then: (res) => Promise.resolve({ data: filas, error: null }).then(res),
    };
    const q = new Proxy(propios, {
      get(obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop === 'symbol') return undefined;
        return () => q;             // cualquier otro filtro sigue la cadena
      },
    });
    return q;
  };
  window.sb = {
    from: tabla,
    rpc: (n, args) => { window.__sql.push({ op: 'rpc', n, args }); return Promise.resolve({ data: null, error: null }); },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
  };
  window.requireCoach = () => Promise.resolve(true);
  window.getWorkspace = () => Promise.resolve({ id: 'w-1', sport: 'football', seat_limit: 10, accent: 'orange' });
  window.getWorkspaceId = () => Promise.resolve('w-1');
  window.getSeatUsage = () => Promise.resolve({ used: 1, limit: 10, left: 9 });
  window.applyWorkspaceTheme = () => {};
  window.prToast = (m) => { (window.__toasts = window.__toasts || []).push(m); };
  window.prEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  window.prInitials = (n) => String(n||'').trim().split(/\\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  window.prYMD = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  window.prToday = () => '2026-03-02';
`;

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/Athlete.html`, { method: 'HEAD' }); if (r.ok) return; }
    catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  console.error('el servidor no levantó'); server.kill(); process.exit(1);
})();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'es-ES' });
  await page.addInitScript(() => { try { localStorage.setItem('pr_lang', 'es'); } catch (e) {} });
  page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '/* no hace falta */' }));

  await page.goto(`http://localhost:${PORT}/Athlete.html?id=a-1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#wb-rows .wk-row', { timeout: 15000 });

  const rango = () => page.textContent('#wb-range');
  const modalVisible = (id) => page.evaluate((i) => !document.getElementById(i).hidden, id);

  // ── Moverse por las semanas ───────────────────────────────────────────────
  console.log('\nMOVERSE SIN TOCAR EL MOUSE');
  const inicio = await rango();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const siguiente = await rango();
  if (siguiente !== inicio) ok(`la flecha derecha cambia de semana (${inicio} → ${siguiente})`);
  else no('la flecha derecha no hizo nada', { inicio, siguiente });

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  is('la izquierda vuelve', await rango(), inicio);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.press('t');
  await page.waitForTimeout(250);
  is('la T vuelve a esta semana', await rango(), inicio);

  // ── Crear ─────────────────────────────────────────────────────────────────
  console.log('\nCREAR Y CERRAR');
  await page.keyboard.press('n');
  await page.waitForTimeout(200);
  is('la N abre un bloque nuevo', await modalVisible('m-ev'), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  is('Escape lo cierra', await modalVisible('m-ev'), false);

  // ── La regla que importa ──────────────────────────────────────────────────
  console.log('\nESCRIBIENDO, LOS ATAJOS NO EXISTEN');
  await page.keyboard.press('n');
  await page.waitForTimeout(200);
  await page.click('#e-title');
  await page.type('#e-title', 'Nota nueva');
  is('lo escrito llega entero', await page.inputValue('#e-title'), 'Nota nueva');
  is('y no se abrió nada encima', await modalVisible('m-keys'), false);

  const antes = await rango();
  await page.type('#e-title', ' t');
  is('la t escribe, no viaja en el tiempo', await page.inputValue('#e-title'), 'Nota nueva t');
  is('la semana no se movió', await rango(), antes);

  // ── Guardar con el teclado ────────────────────────────────────────────────
  console.log('\nGUARDAR SIN SOLTAR EL TECLADO');
  await page.evaluate(() => { window.__sql = []; });
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(400);
  const guardado = await page.evaluate(() => window.__sql.filter(x => x.t === 'events'));
  is('Ctrl+Enter guarda el bloque abierto', guardado.length >= 1, true);
  is('y es un alta', guardado[0] && guardado[0].op, 'insert');

  // ── La ayuda ──────────────────────────────────────────────────────────────
  console.log('\nLA LISTA SE PUEDE ENCONTRAR');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('?');
  await page.waitForTimeout(250);
  is('el ? abre la lista', await modalVisible('m-keys'), true);
  const cuantos = await page.evaluate(() => document.querySelectorAll('#wb-keys-list > div').length);
  is('con los ocho atajos', cuantos, 8);
  const sinTraducir = await page.evaluate(() =>
    [...document.querySelectorAll('#wb-keys-list dd')].filter(d => /^wk\./.test(d.textContent)).length);
  is('todos traducidos', sinTraducir, 0);
  await page.keyboard.press('Escape');

  is('y hay un botón que lleva a ella', await page.isVisible('#wb-keys'), true);

  // ── Dar vuelta la semana ──────────────────────────────────────────────────
  console.log('\nLA V DA VUELTA LA SEMANA');
  const antesV = await page.evaluate(() => document.getElementById('wb-rows').className);
  await page.keyboard.press('v');
  await page.waitForTimeout(300);
  const despuesV = await page.evaluate(() => document.getElementById('wb-rows').className);
  if (antesV !== despuesV) ok(`cambia de vista (${antesV.includes('wk-cols') ? 'columnas' : 'filas'} → ${despuesV.includes('wk-cols') ? 'columnas' : 'filas'})`);
  else no('la V no cambió la vista', { antesV, despuesV });
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
