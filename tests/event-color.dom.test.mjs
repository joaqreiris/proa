// El color propio de un bloque.
//
// Los nueve colores de los TIPOS siguen siendo fijos —se aprenden, y en eso
// está su valor—. Esto es otra cosa: pintar un bloque suelto para que salte a
// la vista. Lo que se comprueba acá:
//
//   · Que el color propio gane y que, sin él, mande el del tipo.
//   · Que el texto se lea igual. Los nueve de fábrica están elegidos para el
//     blanco, pero a mano se puede elegir un amarillo, y blanco sobre amarillo
//     no se lee. La tinta se decide por luminancia, no a ojo.
//
//   node tests/event-color.dom.test.mjs

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

const css = readFileSync(join(root, 'proa.css'), 'utf8').replace(/@import url\([^)]*\);/g, '');
const grid = readFileSync(join(root, 'assets', 'week-grid.js'), 'utf8');
const ES = JSON.parse(readFileSync(join(root, 'locales', 'es.json'), 'utf8'));

const DATES = ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08'];
const EVENTS = [
  // Sin color: manda el del tipo.
  { id: 'auto',  date: '2026-03-02', start_time: '08:00', end_time: '09:30', type: 'gym' },
  // Con color oscuro: texto blanco.
  { id: 'osc',   date: '2026-03-03', start_time: '08:00', end_time: '09:30', type: 'gym', color: '#111827' },
  // Con color claro: texto oscuro, o no se lee.
  { id: 'claro', date: '2026-03-04', start_time: '08:00', end_time: '09:30', type: 'gym', color: '#FACC15' },
];

const HTML = `<!DOCTYPE html><html><head><style>${css}</style>
<style>*,*::before,*::after{animation:none!important}</style></head>
<body><div class="wk" style="width:1000px"><div id="host"></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
await page.setContent(HTML);
await page.evaluate((es) => {
  window.prToday = () => '2026-03-02';
  window.prEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  window.PR_I18N = { current: 'es', t: (k) => es[k] || null };
  window.sb = null;
}, ES);
await page.addScriptTag({ content: grid });
await page.evaluate(({ dates, events }) => {
  window.prWeek.setLayout('rows', { persist: false });
  window.prWeek.render({ host: 'host', dates, events, slots: [], editable: true });
}, { dates: DATES, events: EVENTS });

const pintado = await page.evaluate(() =>
  ['auto', 'osc', 'claro'].map((id) => {
    const el = document.querySelector(`[data-event="${id}"]`);
    const cs = getComputedStyle(el);
    return { id, fondo: cs.backgroundColor, tinta: cs.color };
  }),
);
const de = (id) => pintado.find((p) => p.id === id);

console.log('\nEL COLOR PROPIO GANA; SIN ÉL, EL DEL TIPO');
// El naranja de gimnasio, tal como lo define la paleta.
is('sin color propio, el bloque es del color de su tipo', de('auto').fondo, 'rgb(255, 61, 0)');
is('con color propio, manda el propio', de('osc').fondo, 'rgb(17, 24, 39)');
is('y el otro también', de('claro').fondo, 'rgb(250, 204, 21)');

console.log('\nEL TEXTO SE SIGUE LEYENDO');
is('sobre el color del tipo, blanco', de('auto').tinta, 'rgb(255, 255, 255)');
is('sobre un color oscuro, blanco', de('osc').tinta, 'rgb(255, 255, 255)');
is('sobre un amarillo, tinta oscura', de('claro').tinta, 'rgb(20, 24, 31)');

// El contraste, medido: la WCAG pide 4.5 para texto chico, y estos son de 10px
// en negrita, así que cuanto más lejos de ahí, mejor.
console.log('\nY CON CUÁNTO CONTRASTE');
const contraste = await page.evaluate(() => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number).map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return ['auto', 'osc', 'claro'].map((id) => {
    const cs = getComputedStyle(document.querySelector(`[data-event="${id}"]`));
    const a = lum(cs.backgroundColor), b = lum(cs.color);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return { id, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 };
  });
});
// El umbral se exige donde la tinta la elige inkOn, o sea en los colores
// propios. Los nueve de fábrica son una decisión de marca escrita en
// docs/plan.md y no los decide esta función: el naranja de gimnasio con blanco
// da 3.55:1, por debajo del 4.5 de la WCAG. Se informa, no se falsea, y no se
// hace fallar una prueba de esta rama por algo que ya estaba y que se arregla
// en la paleta, no acá.
for (const c of contraste) {
  if (c.id === 'auto') { console.log(`  DATO  color de marca (gimnasio + blanco): ${c.ratio}:1`); continue; }
  if (c.ratio >= 4.5) ok(`${c.id}: ${c.ratio}:1`);
  else no(`${c.id} no llega al mínimo legible`, c.ratio);
}

// Y que la tinta elegida sea siempre la MEJOR de las dos, para cada color de
// la paleta. Esto sí es responsabilidad de inkOn.
const eleccion = await page.evaluate(() => {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const canal = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  };
  const ratio = (a, b) => { const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
  return window.prWeek.EVENT_PALETTE.map((c) => {
    const L = lum(c);
    const conBlanco = ratio(L, 1), conOscuro = ratio(L, lum('#14181F'));
    const elegida = window.prWeek.inkOn(c);
    return {
      color: c,
      acerto: (conBlanco >= conOscuro) === (elegida === '#fff'),
      mejor: Math.round(Math.max(conBlanco, conOscuro) * 100) / 100,
    };
  });
});
is('para cada color elige la tinta que más contrasta', eleccion.every((e) => e.acerto), true);
const flojo = eleccion.filter((e) => e.mejor < 4.5);
is('y ninguno de los diez queda por debajo del mínimo', flojo.map((f) => `${f.color} (${f.mejor})`), []);

console.log('\nLA PALETA');
const paleta = await page.evaluate(() => ({
  cuantos: window.prWeek.EVENT_PALETTE.length,
  hex: window.prWeek.EVENT_PALETTE.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)),
  repetidos: new Set(window.prWeek.EVENT_PALETTE).size,
  // La tinta que le tocaría a cada uno, para que ninguno quede ilegible.
  tintas: window.prWeek.EVENT_PALETTE.map((c) => window.prWeek.inkOn(c)),
}));
is('son diez colores', paleta.cuantos, 10);
is('todos en #rrggbb', paleta.hex, true);
is('sin repetidos', paleta.repetidos, 10);
is('todos tienen tinta asignada', paleta.tintas.every(Boolean), true);
is('y no todos usan la misma', new Set(paleta.tintas).size, 2);

await browser.close();
console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
