// Las acciones de un bloque: borrar y duplicar.
//
// Borrar no andaba y no se sabía si el bloque era de verdad o el fantasma que
// quedaba colgado del arrastre. Esta prueba responde la mitad que se puede
// responder sin la base: que el botón mande la orden correcta.
//
//   node tests/block-actions.dom.test.mjs

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8919;

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
  start_time: '19:00', end_time: '20:30', type: 'meal',
  title: 'Colación', color: null, status: 'planned',
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
      // Declarada desde el vamos: el Proxy devuelve una FUNCIÓN para cualquier
      // propiedad que no conozca, y una función es truthy, así que sin esto la
      // consulta se cree que siempre está borrando.
      __borrando: false,
      insert(row) { window.__sql.push({ op: 'insert', t, row }); return q; },
      update(row) { window.__sql.push({ op: 'update', t, row }); return q; },
      delete() { window.__sql.push({ op: 'delete', t }); q.__borrando = true; return q; },
      // Al borrar, lo que vuelve son las filas borradas. window.__borraNada imita
      // el caso feo: las reglas de acceso filtran la fila y PostgREST contesta
      // que todo bien, con cero filas y sin error.
      select() { return q; },
      single: () => Promise.resolve({ data: filas[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: filas[0] || null, error: null }),
      then: (res) => Promise.resolve({
        data: q.__borrando ? (window.__borraNada ? [] : [{ id: EVENTO.id }]) : filas,
        error: null,
      }).then(res),
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
  await page.addInitScript(() => {
    try { localStorage.setItem('pr_lang', 'es'); localStorage.setItem('pr_week_layout', 'rows'); } catch (e) {}
  });
  page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
  // El confirm del navegador: se acepta, que es lo que hace la persona.
  page.on('dialog', (d) => d.accept());
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '/* no hace falta */' }));

  await page.goto(`http://localhost:${PORT}/Athlete.html?id=a-1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#wb-rows .wk-ev[data-event="e-1"]', { timeout: 15000 });

  console.log('\nTODOS LOS BOTONES SE VEN, NO SOLO ESTÁN');
  // El pie llega a tener siete botones y flex los comprimía hasta que los de
  // solo icono desaparecían. El de borrar era el primero de la fila: estaba en
  // el HTML, visible para el código, y no se veía en la pantalla.
  await page.click('#wb-rows .wk-ev[data-event="e-1"]');
  await page.waitForTimeout(400);
  const pie = await page.evaluate(() => {
    const foot = document.querySelector('#m-ev .pr-modal-foot');
    const caja = foot.getBoundingClientRect();
    return ['e-del', 'e-dup', 'e-rep'].map((id) => {
      const b = document.getElementById(id);
      const r = b.getBoundingClientRect();
      return {
        id,
        // Ancho de verdad y dentro del pie: no alcanza con que no esté hidden.
        ancho: Math.round(r.width),
        dentro: r.left >= caja.left - 1 && r.right <= caja.right + 1,
      };
    });
  });
  for (const b of pie) {
    if (b.ancho >= 28 && b.dentro) ok(`${b.id} se ve entero (${b.ancho}px, dentro del pie)`);
    else no(`${b.id} no se ve`, b);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  console.log('\nOPTION+CLIC ABRE EL MENÚ CORTO');
  await page.click('#wb-rows .wk-ev[data-event="e-1"]', { modifiers: ['Alt'] });
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.wb-menu');
    return m ? {
      abierto: true,
      opciones: [...m.querySelectorAll('[data-k]')].map((b) => b.dataset.k),
      modalCerrado: document.getElementById('m-ev').hidden,
    } : { abierto: false };
  });
  is('se abre el menú', menu.abierto, true);
  is('sin abrir el formulario', menu.modalCerrado, true);
  is('con abrir, editar, duplicar, repetir y borrar', menu.opciones, ['open', 'edit', 'dup', 'rep', 'del']);

  console.log('\nY BORRA DESDE AHÍ, SIN ENTRAR');
  await page.evaluate(() => { window.__sql = []; });
  await page.click('.wb-menu [data-k="del"]');
  await page.waitForTimeout(500);
  const borrado = await page.evaluate(() => window.__sql.filter((x) => x.op === 'delete'));
  is('sale el borrado', borrado.length, 1);
  is('de la tabla de eventos', borrado[0] && borrado[0].t, 'events');

  console.log('\nESCAPE CIERRA EL MENÚ');
  await page.click('#wb-rows .wk-ev[data-event="e-1"]', { modifiers: ['Alt'] });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  is('no queda colgado', await page.evaluate(() => !document.querySelector('.wb-menu')), true);

  console.log('\nABRIR UN BLOQUE');
  await page.click('#wb-rows .wk-ev[data-event="e-1"]');
  await page.waitForTimeout(300);
  is('el clic abre el bloque', await page.evaluate(() => !document.getElementById('m-ev').hidden), true);
  is('y el botón de borrar está a la vista', await page.isVisible('#e-del'), true);

  console.log('\nBORRAR MANDA LA ORDEN CORRECTA');
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#e-del');
  await page.waitForTimeout(500);

  const sql = await page.evaluate(() => window.__sql);
  const del = sql.filter((x) => x.op === 'delete' && x.t === 'events');
  is('sale un borrado, y uno solo', del.length, 1);
  is('el modal se cierra', await page.evaluate(() => document.getElementById('m-ev').hidden), true);
  const quejas = await page.evaluate(() => window.__toasts || []);
  is('sin avisos de error', quejas.filter((q) => /error|denied|permission/i.test(q)), []);

  console.log('\nSI LA BASE NO BORRA NADA, SE DICE');
  // Es el caso que deja a todo el mundo mirando la pantalla: PostgREST no
  // devuelve error cuando el RLS filtra la fila, así que sin comprobar cuántas
  // se borraron la app cierra el modal y el bloque sigue ahí.
  await page.evaluate(() => { window.__borraNada = true; window.__toasts = []; });
  await page.click('#wb-rows .wk-ev[data-event="e-1"]');
  await page.waitForTimeout(300);
  await page.click('#e-del');
  await page.waitForTimeout(400);
  is('el modal NO se cierra', await page.evaluate(() => document.getElementById('m-ev').hidden), false);
  const aviso = await page.evaluate(() => window.__toasts || []);
  is('y se avisa', aviso.length >= 1, true);
  if (aviso[0] && !/^wk\./.test(aviso[0])) ok(`con un mensaje en castellano: «${aviso[0]}»`);
  else no('el aviso salió sin traducir', aviso[0]);
  await page.evaluate(() => { window.__borraNada = false; });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  console.log('\nDUPLICAR TAMBIÉN');
  await page.click('#wb-rows .wk-ev[data-event="e-1"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#e-dup');
  await page.waitForTimeout(500);
  const rpc = await page.evaluate(() => window.__sql.filter((x) => x.op === 'rpc'));
  is('duplicar llama a la función de copiar', rpc[0] && rpc[0].n, 'copy_event_to_athletes');
  is('con el bloque correcto', rpc[0] && rpc[0].args && rpc[0].args.p_event, 'e-1');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
