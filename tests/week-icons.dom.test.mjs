// Los bloques de la semana: icono fijo por tipo, y el nombre solo si entra.
//
// Es una prueba de layout, no de lógica: lo que se afirma es qué SE VE con un
// ancho de verdad. El ancho de un bloque es su duración, así que la respuesta
// cambia entre media hora y dos horas, y eso no se puede comprobar leyendo el
// código ni con un DOM de mentira sin medir.
//
//   node tests/week-icons.dom.test.mjs
//
// No toca la base ni la red: levanta la grilla en Chromium con datos hechos a
// mano. Playwright lo busca tests/playwright.mjs.

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

const css = readFileSync(join(root, 'proa.css'), 'utf8')
  // El @import de la webfont sale a la red; para medir anchos no hace falta.
  .replace(/@import url\([^)]*\);/g, '');
const js = readFileSync(join(root, 'assets', 'week-grid.js'), 'utf8');
// Los bloques entran animados con scaleX(0→1), así que el rect de los primeros
// cuadros es más angosto que el bloque. Acá se mide el resultado, no la entrada.
const SIN_ANIMACION = '*, *::before, *::after { animation: none !important; transition: none !important; }';
const ES = JSON.parse(readFileSync(join(root, 'locales', 'es.json'), 'utf8'));

// Lunes a domingo de una semana cualquiera, y cuatro bloques el mismo día con
// duraciones distintas: media hora, una, hora y media, y dos.
const DATES = ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08'];
const EVENTS = [
  { id: 'e1', date: '2026-03-02', start_time: '08:00', end_time: '08:30', type: 'gym',      title: null },
  { id: 'e2', date: '2026-03-03', start_time: '08:00', end_time: '09:00', type: 'field',    title: null },
  { id: 'e3', date: '2026-03-04', start_time: '08:00', end_time: '09:30', type: 'recovery', title: null },
  { id: 'e4', date: '2026-03-05', start_time: '08:00', end_time: '10:00', type: 'match',    title: 'Partido vs Nacional' },
];

const HTML = `<!DOCTYPE html><html><head><style>${css}</style><style>${SIN_ANIMACION}</style></head>
<body><div id="host" style="width:900px"></div>
<div id="legend"></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.setContent(HTML);

// Los stubs primero y week-grid.js después, en dos pasos: el módulo lee estas
// globales al construirse, así que el orden no puede quedar librado al azar.
await page.evaluate((es) => {
  window.prToday = () => '2026-03-02';
  window.prEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Las traducciones de verdad: si el nombre de un tipo cambiara en es.json,
  // esta prueba tiene que enterarse igual que la pantalla.
  window.PR_I18N = { current: 'es', t: (k) => es[k] || null };
}, ES);

await page.addScriptTag({ content: js });

await page.evaluate(({ dates, events }) => {
  window.prWeek.render({ host: 'host', dates, events, slots: [], editable: true });
  document.getElementById('legend').innerHTML = window.prWeek.eventLegendHtml();
}, { dates: DATES, events: EVENTS });

// ── Lo que se ve en cada bloque ─────────────────────────────────────────────
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('.wk-ev')].map((el) => {
    const i = el.querySelector('i.ti');
    const t = el.querySelector('.wk-ev-t');
    return {
      id: el.dataset.event,
      // offsetWidth y no getBoundingClientRect: el segundo devuelve el ancho ya
      // transformado, y es el de layout el que decide el container query.
      ancho: el.offsetWidth,
      icono: i ? [...i.classList].find((c) => c.startsWith('ti-')) : null,
      textoVisible: t ? getComputedStyle(t).display !== 'none' : false,
      nombre: t ? t.textContent : null,
      etiqueta: el.getAttribute('aria-label'),
    };
  }),
);

const by = (id) => chips.find((c) => c.id === id) || {};

console.log('\nANCHOS REALES');
for (const c of chips) console.log(`  ${c.id}  ${c.ancho}px  ${c.icono}  texto=${c.textoVisible}`);

console.log('\nEL ICONO ES FIJO POR TIPO');
is('gimnasio lleva la pesa',        by('e1').icono, 'ti-barbell');
is('campo lleva el corredor',       by('e2').icono, 'ti-run');
is('recuperación lleva el masaje',  by('e3').icono, 'ti-massage');
is('partido lleva la pelota',       by('e4').icono, 'ti-ball-football');

console.log('\nEL NOMBRE ENTRA O NO ENTRA');
if (by('e1').ancho < 76) ok(`media hora mide ${by('e1').ancho}px, menos que el umbral`);
else no('media hora debería quedar por debajo del umbral', by('e1').ancho);
is('en media hora el nombre se calla',    by('e1').textoVisible, false);
is('en dos horas el nombre se muestra',   by('e4').textoVisible, true);
is('el icono sobrevive en el más angosto', !!by('e1').icono, true);

console.log('\nEL NOMBRE SIGUE ESTANDO PARA QUIEN NO LO VE');
is('media hora conserva su aria-label',   by('e1').etiqueta, 'Gimnasio');
is('el título propio gana al tipo',       by('e4').etiqueta, 'Partido vs Nacional');

// ── Dónde queda el icono según acompañe o esté solo ─────────────────────────
console.log('\nEL ICONO SE ACOMODA');
const sitio = await page.evaluate(() =>
  ['e1', 'e4'].map((id) => {
    const el = document.querySelector(`[data-event="${id}"]`);
    const i = el.querySelector('i.ti');
    // Cuánto sobra a cada lado del icono dentro del bloque.
    return { id, izq: i.offsetLeft, der: el.offsetWidth - (i.offsetLeft + i.offsetWidth) };
  }),
);
const solo = sitio.find((s) => s.id === 'e1');
const junto = sitio.find((s) => s.id === 'e4');
if (Math.abs(solo.izq - solo.der) <= 1) ok(`solo, el icono queda al medio (${solo.izq}px y ${solo.der}px)`);
else no('el icono solo no quedó centrado', solo);
if (junto.izq <= 8) ok(`acompañado, arranca contra el borde (${junto.izq}px)`);
else no('el icono acompañado no arranca a la izquierda', junto);

// ── La leyenda enseña el par ────────────────────────────────────────────────
console.log('\nLA LEYENDA ENSEÑA COLOR + ICONO JUNTOS');
const leyenda = await page.evaluate(() =>
  [...document.querySelectorAll('#legend .pr-legend-item')].map((el) => {
    const i = el.querySelector('i');
    const r = i.getBoundingClientRect();
    return {
      icono: [...i.classList].find((c) => c.startsWith('ti-')) || null,
      pintado: getComputedStyle(i).backgroundColor,
      ancho: Math.round(r.width),
    };
  }),
);
is('hay ocho tipos en la leyenda', leyenda.length, 8);
is('todos traen icono', leyenda.every((l) => l.icono), true);
is('todos traen su color', leyenda.every((l) => l.pintado && l.pintado !== 'rgba(0, 0, 0, 0)'), true);
is('el cuadro creció para que entre', leyenda.every((l) => l.ancho === 16), true);

await browser.close();

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
