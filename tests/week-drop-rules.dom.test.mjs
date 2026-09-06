// Qué pasa al soltar un bloque: las cuatro combinaciones.
//
// Mover y copiar se deciden con Option apretado, y el destino puede ser otro
// día, otra hora o el mismo lugar. Las reglas son dos:
//
//   · Soltar donde estaba no es un cambio. Da igual Option: una copia
//     exactamente encima del original no se ve —parecen un solo bloque— y el
//     que la hizo se entera después, cuando mueve uno y aparece el otro.
//   · Cualquier otro destino sí es un cambio, y Option decide si el original
//     se queda donde estaba.
//
//   node tests/week-drop-rules.dom.test.mjs
//
// No toca la base: se mira qué se le pide guardar, no lo que la base hace.

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
const dragjs = readFileSync(join(root, 'assets', 'week-drag.js'), 'utf8');
const ES = JSON.parse(readFileSync(join(root, 'locales', 'es.json'), 'utf8'));

const DATES = ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08'];
const EVENTS = [
  { id: 'ev', date: '2026-03-03', start_time: '19:00', end_time: '20:30', type: 'team_training', title: '1er equipo' },
];

const HTML = `<!DOCTYPE html><html><head><style>${css}</style>
<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head>
<body><div class="wk" style="width:1000px"><div id="scale"></div><div id="host"></div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
await page.setContent(HTML);
await page.evaluate((es) => {
  window.prToday = () => '2026-03-02';
  window.prEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  window.PR_I18N = { current: 'es', t: (k) => es[k] || null };
  window.sb = null;
  window.__drops = [];
}, ES);
await page.addScriptTag({ content: grid });
await page.addScriptTag({ content: dragjs });

async function montar(modo) {
  await page.evaluate(({ dates, events, modo }) => {
    window.prWeek.setLayout(modo, { persist: false });
    const sc = document.getElementById('scale');
    if (sc) sc.outerHTML = window.prWeek.scaleHtml() + window.prWeek.scaleColsHtml();
    window.prWeek.render({ host: 'host', dates, events, slots: [], editable: true });
    window.prWeekDrag.enable({
      host: document.getElementById('host'),
      onDrop: (info) => { window.__drops.push(info); return Promise.resolve(); },
    });
  }, { dates: DATES, events: EVENTS, modo });
}

// Un gesto completo. `destino` dice adónde llevarlo; `option`, si se copia.
async function arrastrar({ destino, option, modo }) {
  await montar(modo);
  await page.evaluate(() => { window.__drops = []; });

  const pos = await page.evaluate((destino) => {
    const el = document.querySelector('[data-event="ev"]');
    const r = el.getBoundingClientRect();
    const pista = el.closest('.wk-track').getBoundingClientRect();
    const cols = document.getElementById('host').classList.contains('wk-cols');
    const desde = { x: r.left + r.width / 2, y: r.top + 8 };
    if (destino === 'mismo-lugar') return { desde, hasta: desde, vuelta: true };
    if (destino === 'otra-hora') {
      // Dos horas más tarde, sobre el eje del tiempo que corresponda.
      const salto = (cols ? pista.height : pista.width) / 18 * 2;
      return { desde, hasta: cols ? { x: desde.x, y: desde.y + salto } : { x: desde.x + salto, y: desde.y } };
    }
    const otro = document.querySelector('[data-date="2026-03-05"]').getBoundingClientRect();
    return { desde, hasta: cols ? { x: otro.left + otro.width / 2, y: desde.y } : { x: desde.x, y: otro.top + otro.height / 2 } };
  }, destino);

  await page.mouse.move(pos.desde.x, pos.desde.y);
  await page.mouse.down();
  if (option) await page.keyboard.down('Alt');
  if (pos.vuelta) {
    // Hay que pasar el umbral de los 6 px para que sea un arrastre y no un clic.
    await page.mouse.move(pos.desde.x + 40, pos.desde.y + 40, { steps: 6 });
    await page.mouse.move(pos.desde.x, pos.desde.y, { steps: 6 });
  } else {
    await page.mouse.move(pos.hasta.x, pos.hasta.y, { steps: 12 });
  }
  await page.mouse.up();
  if (option) await page.keyboard.up('Alt');
  await page.waitForTimeout(200);

  return page.evaluate(() => ({
    drops: window.__drops,
    sucio: document.querySelectorAll('.wk-drag, .wk-drop, .wk-drop-tag, .is-moving').length,
  }));
}

for (const modo of ['rows', 'cols']) {
  console.log(`\n${modo === 'cols' ? 'DÍAS EN COLUMNAS' : 'DÍAS EN FILAS'}`);

  const quieto = await arrastrar({ destino: 'mismo-lugar', option: false, modo });
  is('soltar donde estaba no guarda nada', quieto.drops.length, 0);

  // Este es el que duplicaba: Option apretado y sin moverse creaba una copia
  // exacta encima del original.
  const quietoCopia = await arrastrar({ destino: 'mismo-lugar', option: true, modo });
  is('con Option tampoco, si no se movió', quietoCopia.drops.length, 0);

  const otroDia = await arrastrar({ destino: 'otro-dia', option: false, modo });
  is('a otro día, mueve', otroDia.drops.length, 1);
  is('y no copia', otroDia.drops[0] && otroDia.drops[0].copy, false);
  is('al día correcto', otroDia.drops[0] && otroDia.drops[0].date, '2026-03-05');

  const copiaDia = await arrastrar({ destino: 'otro-dia', option: true, modo });
  is('a otro día con Option, copia', copiaDia.drops[0] && copiaDia.drops[0].copy, true);

  const otraHora = await arrastrar({ destino: 'otra-hora', option: true, modo });
  is('mismo día a otra hora con Option, copia', otraHora.drops[0] && otraHora.drops[0].copy, true);
  is('sigue siendo el mismo día', otraHora.drops[0] && otraHora.drops[0].date, '2026-03-03');
  is('a las 21:00, dos horas más tarde', otraHora.drops[0] && otraHora.drops[0].start, '21:00');

  is('no queda nada colgado en pantalla', otraHora.sucio, 0);
}

await browser.close();
console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
