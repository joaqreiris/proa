// Lo fijo del atleta: subirlo desde la semana y cargarlo de a varios días.
//
// Son dos caras de lo mismo. availability_slots es de DÍA DE LA SEMANA y por eso
// pinta el fondo de todas; events es de fecha. Cargar dos veces lo mismo —una en
// la semana y otra en la anamnesis— era el paso que sobraba, y la anamnesis la
// llena el atleta desde el teléfono, así que cada vuelta de más se paga cara.
//
//   node tests/fixed-week.dom.test.mjs
//
// No toca la base: se mira qué se le pide guardar, no lo que la base hace.

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8921;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

const ATLETA = {
  id: 'a-1', workspace_id: 'w-1', first_name: 'Ana', last_name: 'Díaz',
  timezone: 'America/Montevideo', status: 'active',
};

// Semana del lunes 2026-03-02. Hay de todo a propósito:
const EVENTOS = [
  // Se repiten todas las semanas → suben.
  { id: 'e-1', date: '2026-03-02', start_time: '08:00', end_time: '13:00', type: 'other',         title: 'Facultad' },
  { id: 'e-2', date: '2026-03-03', start_time: '19:00', end_time: '20:30', type: 'team_training', title: '1er equipo' },
  { id: 'e-3', date: '2026-03-05', start_time: '19:00', end_time: '20:30', type: 'team_training', title: '1er equipo' },
  // El mismo lunes escrito dos veces: es UNA franja fija, no dos.
  { id: 'e-4', date: '2026-03-02', start_time: '08:00', end_time: '13:00', type: 'other',         title: 'Facultad' },
  // Ya está cargado como fijo → no se vuelve a subir.
  { id: 'e-5', date: '2026-03-06', start_time: '08:00', end_time: '13:00', type: 'other',         title: 'Facultad' },
  // Lo que planifica el entrenador no es fijo.
  { id: 'e-6', date: '2026-03-04', start_time: '10:00', end_time: '11:00', type: 'gym',      title: 'Fuerza' },
  { id: 'e-7', date: '2026-03-03', start_time: '17:00', end_time: '18:00', type: 'field',    title: 'Campo' },
  { id: 'e-8', date: '2026-03-04', start_time: '21:00', end_time: '21:30', type: 'recovery', title: 'Movilidad' },
  // Un partido es de un sábado concreto: de fondo taparía todos los sábados.
  { id: 'e-9', date: '2026-03-07', start_time: '16:00', end_time: '18:00', type: 'match',    title: 'vs Danubio' },
  // Sin horario no hay franja posible.
  { id: 'e-10', date: '2026-03-08', start_time: null,   end_time: null,    type: 'other',    title: 'Trámite' },
].map((e) => Object.assign({ athlete_id: 'a-1', color: null, status: 'planned' }, e));

const SLOTS = [
  { weekday: 4, start_time: '08:00:00', end_time: '13:00:00', kind: 'commitment', label: 'Facultad' },
];

const FALSO = `
  window.__sql = [];
  const ATLETA = ${JSON.stringify(ATLETA)};
  const EVENTOS = ${JSON.stringify(EVENTOS)};
  const SLOTS = ${JSON.stringify(SLOTS)};
  const tabla = (t) => {
    const filas = t === 'athletes' ? [ATLETA]
                : t === 'events' ? EVENTOS
                : t === 'availability_slots' ? (window.__slots || SLOTS)
                : [];
    const propios = {
      __borrando: false,
      insert(row) { window.__sql.push({ op: 'insert', t, row }); return q; },
      update(row) { window.__sql.push({ op: 'update', t, row }); return q; },
      upsert(row) { window.__sql.push({ op: 'upsert', t, row }); return q; },
      delete() { window.__sql.push({ op: 'delete', t }); q.__borrando = true; return q; },
      select() { return q; },
      single: () => Promise.resolve({ data: filas[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: filas[0] || null, error: null }),
      then: (res) => Promise.resolve({ data: filas, error: null }).then(res),
    };
    const q = new Proxy(propios, {
      get(obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop === 'symbol') return undefined;
        return () => q;
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
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '/* no hace falta */' }));

  // ── La semana → la ficha ──────────────────────────────────────────────────
  await page.goto(`http://localhost:${PORT}/Athlete.html?id=a-1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#wb-rows .wk-ev[data-event="e-2"]', { timeout: 15000 });

  console.log('\nQUÉ SE OFRECE SUBIR A LA SEMANA TIPO');
  await page.click('#wb-fixed');
  await page.waitForSelector('#m-fixed:not([hidden])', { timeout: 5000 });
  const lista = await page.evaluate(() =>
    [...document.querySelectorAll('#fx-list .wb-fixed-it')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()));

  is('tres franjas, no diez', lista.length, 3);
  is('el lunes de la facultad, una sola vez', lista[0], 'Lun 08:00–13:00 Facultad');
  is('los dos días del club', [lista[1], lista[2]],
     ['Mar 19:00–20:30 1er equipo', 'Jue 19:00–20:30 1er equipo']);
  if (lista.join(' ').match(/Fuerza|Campo|Movilidad|Danubio|Trámite/)) {
    no('subió algo que el entrenador planifica cada semana', lista);
  } else {
    ok('el gimnasio, el campo, la recuperación, el partido y lo que no tiene hora quedan afuera');
  }
  is('avisa de la que ya estaba, en singular', await page.textContent('#fx-had'), '1 ya estaba en su semana tipo.');

  console.log('\nLO QUE SE GUARDA');
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#f-fixed button[type="submit"]');
  await page.waitForTimeout(500);
  const ins = await page.evaluate(() => window.__sql.filter((x) => x.op === 'insert'));
  is('un solo insert', ins.length, 1);
  is('a la tabla de lo fijo', ins[0] && ins[0].t, 'availability_slots');
  is('con las tres franjas, del tipo que les toca', ins[0] && ins[0].row, [
    { athlete_id: 'a-1', weekday: 0, start_time: '08:00', end_time: '13:00', kind: 'commitment',    label: 'Facultad' },
    { athlete_id: 'a-1', weekday: 1, start_time: '19:00', end_time: '20:30', kind: 'team_training', label: '1er equipo' },
    { athlete_id: 'a-1', weekday: 3, start_time: '19:00', end_time: '20:30', kind: 'team_training', label: '1er equipo' },
  ]);
  is('y se cierra', await page.evaluate(() => document.getElementById('m-fixed').hidden), true);

  console.log('\nSE PUEDE DEJAR UNA AFUERA');
  await page.click('#wb-fixed');
  await page.waitForSelector('#m-fixed:not([hidden])', { timeout: 5000 });
  await page.evaluate(() => {
    window.__sql = [];
    document.querySelector('#fx-list [data-fx="0"]').checked = false;
  });
  await page.click('#f-fixed button[type="submit"]');
  await page.waitForTimeout(400);
  const ins2 = await page.evaluate(() => window.__sql.filter((x) => x.op === 'insert'));
  is('sube solo lo marcado', (ins2[0] && ins2[0].row || []).map((r) => r.weekday), [1, 3]);

  console.log('\nSI YA ESTÁ TODO, NO SE INVENTA NADA');
  // La ficha ya tiene las tres: el botón lo dice y no abre un modal vacío.
  await page.evaluate(() => {
    window.__slots = [
      { weekday: 0, start_time: '08:00:00', end_time: '13:00:00', kind: 'commitment',    label: 'Facultad' },
      { weekday: 1, start_time: '19:00:00', end_time: '20:30:00', kind: 'team_training', label: '1er equipo' },
      { weekday: 3, start_time: '19:00:00', end_time: '20:30:00', kind: 'team_training', label: '1er equipo' },
      { weekday: 4, start_time: '08:00:00', end_time: '13:00:00', kind: 'commitment',    label: 'Facultad' },
    ];
    window.__toasts = [];
    window.prWeekBoard.reload();
  });
  await page.waitForTimeout(600);
  await page.click('#wb-fixed');
  await page.waitForTimeout(300);
  is('no abre el modal', await page.evaluate(() => document.getElementById('m-fixed').hidden), true);
  is('y lo dice', await page.evaluate(() => (window.__toasts || []).pop()),
     'Todo lo fijo de esta semana ya está en su semana tipo.');

  // ── La anamnesis: varios días de una ──────────────────────────────────────
  console.log('\nUNA FRANJA, VARIOS DÍAS');
  // La facultad de lunes a viernes era cinco vueltas al mismo modal.
  await page.goto(`http://localhost:${PORT}/Intake.html?id=a-1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#s-days .pr-daypick-d', { state: 'attached', timeout: 15000 });
  is('están los siete días', await page.evaluate(() => document.querySelectorAll('#s-days [data-day]').length), 7);
  is('y ninguno marcado de entrada',
     await page.evaluate(() => document.querySelectorAll('#s-days [data-day].is-on').length), 0);

  // El «+» de un día lo deja marcado: es el día que se tocó.
  await page.click('#wk-rows .wk-row:nth-child(3) .wk-add');
  await page.waitForSelector('#m-slot:not([hidden])', { timeout: 5000 });
  is('el + del miércoles marca el miércoles',
     await page.evaluate(() => [...document.querySelectorAll('#s-days [data-day].is-on')].map((b) => b.dataset.day)), ['2']);

  await page.click('#s-days [data-day="0"]');
  await page.click('#s-days [data-day="1"]');
  await page.click('#s-days [data-day="2"]');      // el miércoles se destilda
  await page.fill('#s-start', '08:00');
  await page.fill('#s-end', '13:00');
  await page.fill('#s-label', 'Facultad');
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#f-slot button[type="submit"]');
  await page.waitForTimeout(400);

  const ins3 = await page.evaluate(() => window.__sql.filter((x) => x.op === 'insert'));
  is('un solo insert para los dos días', ins3.length, 1);
  is('una fila por día marcado', ins3[0] && ins3[0].row, [
    { athlete_id: 'a-1', weekday: 0, start_time: '08:00', end_time: '13:00', kind: 'commitment', label: 'Facultad' },
    { athlete_id: 'a-1', weekday: 1, start_time: '08:00', end_time: '13:00', kind: 'commitment', label: 'Facultad' },
  ]);

  console.log('\nSIN NINGÚN DÍA NO SE GUARDA');
  await page.click('#wk-rows .wk-row:nth-child(1) .wk-add');
  await page.waitForSelector('#m-slot:not([hidden])', { timeout: 5000 });
  await page.click('#s-days [data-day="0"]');      // queda sin ninguno
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#f-slot button[type="submit"]');
  await page.waitForTimeout(300);
  is('no manda nada', await page.evaluate(() => window.__sql.length), 0);
  is('y avisa por qué', await page.textContent('#slot-msg'), 'Marca al menos un día.');

  console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(fail ? 1 : 0);
