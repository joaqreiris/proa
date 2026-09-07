// El menú del lado del atleta, y su semana entera abrible.
//
// El entrenador cargaba el menú y del otro lado no llegaba: meal_items no se
// consultaba en ninguna pantalla del atleta, así que un bloque de comida abría
// el parte —«¿cómo te fue?»— sin decirle nunca qué tenía que comer. Y la
// grilla de la semana no era tocable: solo se podían abrir los bloques de hoy,
// con lo que la comida del jueves se leía el jueves.
//
//   node tests/athlete-meal.dom.test.mjs
//
// No toca la base: se mira qué se pide y qué se muestra.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8923;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

const ATLETA = { id: 'a-1', first_name: 'Ana', last_name: 'Díaz', workspaces: { name: 'Joaquín', accent: 'orange' } };

// Semana del lunes 2026-03-02; hoy es ese lunes.
const ALMUERZO = {
  id: 'ev-meal', athlete_id: 'a-1', date: '2026-03-02', start_time: '13:00', end_time: '13:45',
  type: 'meal', title: 'Almuerzo', notes: null, location: null, color: null,
  status: 'planned', rpe: null, actual_min: null, athlete_note: null, au: null,
  meal_items: [
    // Del catálogo, por unidades: se lee «2 unidades», no «2».
    { id: 'i-1', position: 0, food_id: 'f-1', name: 'Huevo', qty_g: 110, unit_qty: 2, qty_text: null,
      kcal: 155, protein_g: 13, carbs_g: 1.1, fats_g: 11, fiber_g: 0, notes: null,
      foods: { food_group: 'egg', unit_name: 'unit' } },
    // Del catálogo, en gramos.
    { id: 'i-2', position: 1, food_id: 'f-2', name: 'Arroz', qty_g: 150, unit_qty: null, qty_text: null,
      kcal: 195, protein_g: 4, carbs_g: 42, fats_g: 0.5, fiber_g: 0.6, notes: 'Bien cocido',
      foods: { food_group: 'grain', unit_name: null } },
    // Bebida: va agrupada aparte de la comida.
    { id: 'i-3', position: 2, food_id: 'f-3', name: 'Agua', qty_g: 500, unit_qty: null, qty_text: null,
      kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0, notes: null,
      foods: { food_group: 'drink', unit_name: null } },
  ],
};
const GYM = {
  id: 'ev-gym', athlete_id: 'a-1', date: '2026-03-05', start_time: '10:00', end_time: '11:00',
  type: 'gym', title: 'Fuerza', notes: null, location: null, color: null,
  status: 'planned', rpe: null, actual_min: null, athlete_note: null, au: null, meal_items: [],
};
// Una comida del JUEVES: el caso que antes no se podía abrir.
const CENA_JUE = {
  id: 'ev-cena', athlete_id: 'a-1', date: '2026-03-05', start_time: '21:00', end_time: '21:30',
  type: 'meal', title: 'Cena', notes: null, location: null, color: null,
  status: 'planned', rpe: null, actual_min: null, athlete_note: null, au: null, meal_items: [],
};

const FALSO = `
  window.__sql = [];
  const ATLETA = ${JSON.stringify(ATLETA)};
  const EVENTOS = ${JSON.stringify([ALMUERZO, GYM, CENA_JUE])};
  const DIA = ${JSON.stringify(ALMUERZO.meal_items.map(i =>
    ({ kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fats_g: i.fats_g, fiber_g: i.fiber_g })))};
  const OBJETIVO = { kcal: 2600, protein_g: 150, carbs_g: 300, fats_g: 80 };

  const tabla = (t) => {
    let uno = null;
    const filas = t === 'athletes' ? [ATLETA]
                : t === 'events' ? EVENTOS
                : t === 'meal_items' ? DIA
                : t === 'nutrition_targets' ? (window.__sinObjetivo ? [] : [OBJETIVO])
                : t === 'availability_slots' ? []
                : t === 'athlete_intake' ? [{ completed_at: '2026-03-01T10:00:00Z' }]
                : [];
    const propios = {
      __id: null,
      insert() { return q; }, update() { return q; }, upsert() { return q; }, delete() { return q; },
      select() { return q; },
      // La pantalla del menú pide UN evento por id: hay que contestar ese.
      eq(col, val) { if (col === 'id') q.__id = val; return q; },
      single: () => Promise.resolve({ data: elegido(), error: null }),
      maybeSingle: () => Promise.resolve({ data: elegido(), error: null }),
      then: (res) => Promise.resolve({ data: filas, error: null }).then(res),
    };
    function elegido() {
      if (t === 'events' && q.__id) return EVENTOS.find((e) => e.id === q.__id) || null;
      return filas[0] || null;
    }
    const q = new Proxy(propios, {
      get(o, p) {
        if (p in o) return o[p];
        if (typeof p === 'symbol') return undefined;
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
  window.requireAthlete = () => Promise.resolve(true);
  window.intakeDone = () => Promise.resolve(true);
  window.myCoachName = (n) => Promise.resolve(n);
  window.logout = () => {};
  window.prToast = (m) => { (window.__toasts = window.__toasts || []).push(m); };
  window.prEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  window.prYMD = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  window.prToday = () => '2026-03-02';
`;

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/athlete/Meal.html`, { method: 'HEAD' }); if (r.ok) return; }
    catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  console.error('el servidor no levantó'); server.kill(); process.exit(1);
})();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, locale: 'es-ES' });
  await page.addInitScript(() => {
    try { localStorage.setItem('pr_lang', 'es'); localStorage.setItem('pr_week_layout', 'rows'); } catch (e) {}
  });
  page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '/* no hace falta */' }));

  // ── El menú ───────────────────────────────────────────────────────────────
  await page.goto(`http://localhost:${PORT}/athlete/Meal.html?event=ev-meal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.am-it', { timeout: 15000 });

  console.log('\nEL ATLETA VE QUÉ TIENE QUE COMER');
  const filas = await page.evaluate(() =>
    [...document.querySelectorAll('#items .am-it')].map((r) => ({
      nombre: r.querySelector('.am-it-name').textContent,
      cantidad: (r.querySelector('.am-it-qty') || {}).textContent || '',
      kcal: r.querySelector('.am-it-k').textContent,
    })));
  is('los tres alimentos', filas.length, 3);
  is('el del catálogo por unidades se lee con su unidad',
     [filas[0].nombre, filas[0].cantidad, filas[0].kcal], ['Huevo', '2 unidades', '155 kcal']);
  is('el que va en gramos, en gramos',
     [filas[1].nombre, filas[1].cantidad, filas[1].kcal], ['Arroz', '150 g', '195 kcal']);
  is('y el agua no escribe un cero', filas[2].kcal, '—');
  is('el peso queda debajo de la unidad, que es como se cocina',
     await page.textContent('#items .am-it:nth-child(2) .am-it-note'), '110 g');
  is('la bebida se lee aparte de la comida',
     await page.evaluate(() => [...document.querySelectorAll('#items .am-group')].map((g) => g.textContent)),
     ['Comida', 'Bebidas']);

  console.log('\nCON SUS TOTALES');
  is('el total de la comida', await page.textContent('#meal-kcal'), '350');
  // Separados los lee el flex, no un espacio en el texto: por eso se miran uno a uno.
  is('y sus macros', await page.evaluate(() =>
    [...document.querySelectorAll('#meal-macros span')].map((s) => s.textContent.replace(/\s+/g, ' ').trim())),
    ['17 Prot', '43.1 Carb', '11.5 Gras']);

  const dia = await page.evaluate(() =>
    [...document.querySelectorAll('#day > div')].map((d) => ({
      valor: d.querySelector('b').textContent,
      objetivo: d.querySelector('em').textContent,
      falta: (d.querySelector('.am-left') || {}).textContent || '',
      barra: !!d.querySelector('.am-bar'),
    })));
  is('el día va contra el objetivo', [dia[0].valor, dia[0].objetivo, dia[0].falta],
     ['350', '/ 2600', 'Falta 2250']);
  is('con barra, porque hay objetivo', dia.every((d) => d.barra), true);

  console.log('\nEL PARTE DE UNA COMIDA NO PREGUNTA ESFUERZO');
  // Un plato no dura cuarenta minutos ni sale «8 de 10»: si lo preguntara,
  // además ensuciaría la carga, que es minutos por RPE.
  await page.click('#log');
  await page.waitForSelector('#m-log:not([hidden])', { timeout: 5000 });
  is('pregunta si lo comió', await page.textContent('#m-log-title'), '¿Comiste esto?');
  is('con las palabras de comer', await page.evaluate(() =>
    [...document.querySelectorAll('#m-log [data-did] span')].map((s) => s.textContent)),
    ['Lo comí', 'No lo comí']);
  await page.click('#m-log [data-did="done"]');
  await page.waitForTimeout(200);
  is('y nunca muestra el esfuerzo ni los minutos',
     await page.evaluate(() => document.getElementById('log-detail').hidden), true);

  await page.evaluate(() => { window.__sql = []; });
  await page.click('#log-save');
  await page.waitForTimeout(400);
  const parte = await page.evaluate(() => window.__sql.find((x) => x.n === 'athlete_log_event'));
  is('se guarda como hecho', parte && parte.args.p_status, 'done');
  is('sin RPE', parte && parte.args.p_rpe, null);
  is('y sin minutos', parte && parte.args.p_min, null);

  console.log('\nSIN OBJETIVO CARGADO, LOS NÚMEROS IGUAL SE VEN');
  await page.addInitScript(() => { window.__sinObjetivo = true; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.am-it', { timeout: 15000 });
  const sin = await page.evaluate(() =>
    [...document.querySelectorAll('#day > div')].map((d) => ({
      valor: d.querySelector('b').textContent,
      barra: !!d.querySelector('.am-bar'),
      falta: !!d.querySelector('.am-left'),
    })));
  is('el total del día sigue estando', sin[0].valor, '350');
  is('sin barra vacía que no mide nada', sin.some((d) => d.barra), false);
  is('ni un «falta» inventado', sin.some((d) => d.falta), false);

  // ── La semana ─────────────────────────────────────────────────────────────
  console.log('\nLA SEMANA ENTERA SE ABRE, NO SOLO HOY');
  await page.goto(`http://localhost:${PORT}/athlete/Week.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#wk-rows .wk-ev', { timeout: 15000 });
  is('los bloques de la grilla son botones', await page.evaluate(() =>
    [...document.querySelectorAll('#wk-rows .wk-ev')].every((b) => b.tagName === 'BUTTON')), true);
  is('y no le aparece un «+» para crear', await page.evaluate(() =>
    document.querySelectorAll('#wk-rows .wk-add').length), 0);

  // La cena del jueves: antes había que esperar al jueves para leerla.
  await page.click('#wk-rows .wk-ev[data-event="ev-cena"]');
  await page.waitForURL(/Meal\.html\?event=ev-cena/, { timeout: 5000 });
  ok('la comida del jueves abre su menú');

  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForSelector('#wk-rows .wk-ev', { timeout: 15000 });
  await page.click('#wk-rows .wk-ev[data-event="ev-gym"]');
  await page.waitForURL(/Session\.html\?event=ev-gym/, { timeout: 5000 });
  ok('y el gimnasio del jueves, su sesión');

  console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(fail ? 1 : 0);
