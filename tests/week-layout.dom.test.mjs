// Las dos orientaciones de la semana, medidas en un navegador.
//
// El render no sabe para dónde corre el tiempo: escribe la posición en
// variables y el CSS decide el eje. Esta prueba comprueba las dos mitades de
// esa idea, que es donde puede romperse:
//
//   · Que un bloque caiga donde dice el reloj en las DOS vistas. Un bloque de
//     08:00 a 09:30 tiene que arrancar a un noveno del día y medir un doceavo,
//     mida el día 900 px de ancho o 684 de alto.
//   · Que arrastrar siga entendiendo dónde se soltó. El gesto se calcula sobre
//     el eje del tiempo, y ese eje cambia: en columnas hay que mirar la Y.
//
// No toca la base: el arrastre se sigue hasta el hueco de destino, que es
// donde está la cuenta, y se suelta fuera para no guardar nada.
//
//   node tests/week-layout.dom.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });
const cerca = (m, got, want, tol) =>
  Math.abs(got - want) <= tol ? ok(`${m} (${got}, esperado ~${want})`) : no(m, { got, want, tol });

const css = readFileSync(join(root, 'proa.css'), 'utf8').replace(/@import url\([^)]*\);/g, '');
const grid = readFileSync(join(root, 'assets', 'week-grid.js'), 'utf8');
const drag = readFileSync(join(root, 'assets', 'week-drag.js'), 'utf8');
const ES = JSON.parse(readFileSync(join(root, 'locales', 'es.json'), 'utf8'));
const SIN_ANIM = '*, *::before, *::after { animation: none !important; transition: none !important; }';

const DATES = ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08'];
const EVENTS = [
  { id: 'e1', date: '2026-03-02', start_time: '08:00', end_time: '09:30', type: 'gym', title: 'Fuerza' },
];

const HTML = `<!DOCTYPE html><html><head><style>${css}</style><style>${SIN_ANIM}</style></head>
<body><div class="wk" style="width:1000px"><div id="scale"></div><div id="host"></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
await page.setContent(HTML);
await page.evaluate((es) => {
  window.prToday = () => '2026-03-02';
  window.prEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  window.PR_I18N = { current: 'es', t: (k) => es[k] || null };
  // Nadie guarda nada: la preferencia no tiene que salir a la red en la prueba.
  window.sb = null;
}, ES);
await page.addScriptTag({ content: grid });
await page.addScriptTag({ content: drag });

const pintar = (modo) => page.evaluate(({ dates, events, modo }) => {
  window.prWeek.setLayout(modo, { persist: false });
  const sc = document.getElementById('scale');
  if (sc) sc.outerHTML = window.prWeek.scaleHtml() + window.prWeek.scaleColsHtml();
  window.prWeek.render({ host: 'host', dates, events, slots: [], editable: true });
}, { dates: DATES, events: EVENTS, modo });

const medir = () => page.evaluate(() => {
  const el = document.querySelector('[data-event="e1"]');
  const tr = el.closest('.wk-track');
  const r = el.getBoundingClientRect(), t = tr.getBoundingClientRect();
  return {
    // Dónde arranca y cuánto ocupa, como fracción del día. 06:00 a 24:00 son
    // 18 horas: las 08:00 caen en 2/18 y noventa minutos son 1.5/18.
    desdeX: (r.left - t.left) / t.width, largoX: r.width / t.width,
    desdeY: (r.top - t.top) / t.height, largoY: r.height / t.height,
    anchoPista: Math.round(t.width), altoPista: Math.round(t.height),
    clase: document.getElementById('host').className,
  };
});

// ── En filas, el tiempo va a lo ancho ───────────────────────────────────────
console.log('\nEN FILAS EL TIEMPO CORRE A LO ANCHO');
await pintar('rows');
const filas = await medir();
is('la grilla no lleva la clase de columnas', filas.clase.includes('wk-cols'), false);
cerca('el bloque arranca a las 08:00', filas.desdeX, 2 / 18, 0.01);
cerca('y dura hora y media', filas.largoX, 1.5 / 18, 0.01);
cerca('ocupa todo el alto de su carril', filas.largoY, 1, 0.02);

// ── En columnas, baja ───────────────────────────────────────────────────────
console.log('\nEN COLUMNAS EL TIEMPO BAJA');
await pintar('cols');
const cols = await medir();
is('la grilla lleva la clase de columnas', cols.clase.includes('wk-cols'), true);
cerca('el bloque arranca a las 08:00', cols.desdeY, 2 / 18, 0.01);
cerca('y dura hora y media', cols.largoY, 1.5 / 18, 0.01);
cerca('ocupa todo el ancho de su carril', cols.largoX, 1, 0.02);
if (cols.altoPista > 400) ok(`la pista se hizo alta (${cols.altoPista}px)`);
else no('la pista quedó sin alto', cols.altoPista);
if (cols.anchoPista < 200) ok(`y angosta, una por día (${cols.anchoPista}px)`);
else no('la pista no se angostó', cols.anchoPista);

// ── La escala de horas acompaña ─────────────────────────────────────────────
console.log('\nLA ESCALA ACOMPAÑA A LA VISTA');
const escalas = await page.evaluate(() => {
  const v = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display !== 'none' : null; };
  return { horizontal: v('.wk-scale'), vertical: v('.wk-scale-cols'), marcas: document.querySelectorAll('.wk-scale-cols span').length };
});
is('en columnas se ve la escala de costado', escalas.vertical, true);
is('y se guarda la de arriba', escalas.horizontal, false);
is('trae una marca por hora', escalas.marcas, 18);

// ── Arrastrar, con el tiempo bajando ────────────────────────────────────────
// Se agarra el bloque de las 08:00 y se lo lleva al jueves, tres horas más
// abajo. Si el arrastre siguiera midiendo la X, el destino sería cualquier cosa.
console.log('\nARRASTRAR EN COLUMNAS');
await page.evaluate(() => {
  window.prWeekDrag.enable({
    host: document.getElementById('host'),
    onMove: () => {}, onCopy: () => {},
  });
});

const caja = await page.evaluate(() => {
  const el = document.querySelector('[data-event="e1"]');
  const r = el.getBoundingClientRect();
  const jue = document.querySelector('[data-date="2026-03-05"]').getBoundingClientRect();
  const pista = document.querySelector('[data-date="2026-03-02"]').getBoundingClientRect();
  return {
    x: r.left + r.width / 2, y: r.top + 5,
    jueX: jue.left + jue.width / 2,
    // Tres horas más abajo del punto donde se agarró.
    bajar: (pista.height / 18) * 3,
  };
});

await page.mouse.move(caja.x, caja.y);
await page.mouse.down();
await page.mouse.move(caja.jueX, caja.y + caja.bajar, { steps: 12 });

const destino = await page.evaluate(() => {
  const d = document.querySelector('.wk-drop');
  const tag = document.querySelector('.wk-drop-tag');
  if (!d) return null;
  const tr = d.closest('.wk-track');
  const r = d.getBoundingClientRect(), t = tr.getBoundingClientRect();
  return {
    dia: tr.dataset.date,
    desdeY: (r.top - t.top) / t.height,
    largoY: r.height / t.height,
    anchoCompleto: Math.abs(r.width - t.width) < 2,
    cartel: tag ? tag.textContent : null,
  };
});

if (!destino) { no('no apareció el hueco de destino', null); }
else {
  is('el hueco cayó en el jueves', destino.dia, '2026-03-05');
  cerca('tres horas más abajo, o sea a las 11:00', destino.desdeY, 5 / 18, 0.02);
  cerca('conservando la hora y media', destino.largoY, 1.5 / 18, 0.02);
  is('y ocupando el ancho del día', destino.anchoCompleto, true);
  is('el cartel anuncia el horario nuevo', /11:00.*12:30/.test(destino.cartel || ''), true);
}

// Se suelta fuera de la grilla: no hay base a la que guardar.
await page.mouse.move(5, 5, { steps: 4 });
await page.mouse.up();

await browser.close();
console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
