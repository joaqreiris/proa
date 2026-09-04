// Prueba de arrastrar y soltar en un navegador de verdad.
//
// El resto de las pruebas de Proa hablan con la base; esta no toca la base:
// levanta una lista de mentira en Chromium, arrastra con el mouse y con el
// teclado, y mira dónde quedó cada cosa. Es la única manera de saber si el
// gesto funciona sin abrir la app y probarlo a mano.
//
//   node tests/sortable.dom.test.mjs
//
// Playwright vive en el repo de ClavaMetrics; el script lo busca ahí solo.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const req = createRequire('/Users/joaquinreiris/Desktop/Clava Metrics/package.json');
const { chromium } = req('playwright');

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

const HTML = `<!DOCTYPE html><html><head><style>
  body { margin: 0; font: 14px sans-serif; }
  .box { padding: 4px; border: 1px solid #ccc; margin-bottom: 20px; }
  .row { height: 40px; display: flex; align-items: center; gap: 8px; background: #eee; margin: 4px 0; }
  [data-grip] { width: 24px; text-align: center; cursor: grab; }
</style></head><body>
  <div class="box" id="A">
    <div class="row" data-item="a1"><span data-grip>1</span>uno</div>
    <div class="row" data-item="a2"><span data-grip>2</span>dos</div>
    <div class="row" data-item="a3"><span data-grip>3</span>tres</div>
  </div>
  <div class="box" id="B">
    <div class="row" data-item="b1"><span data-grip>1</span>otro</div>
  </div>
</body></html>`;

// Arrastra el tirador de `id` hasta el centro de `target`, en pasos: un salto
// de un solo movimiento no reproduce lo que hace una mano.
async function drag(page, id, targetSel, where = 'centro') {
  const g = await page.locator(`[data-item="${id}"] [data-grip]`).boundingBox();
  const t = await page.locator(targetSel).boundingBox();
  const y = where === 'abajo' ? t.y + t.height - 4
          : where === 'arriba' ? t.y + 4
          : t.y + t.height / 2;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + (y - (g.y + g.height / 2)) * i / 8);
  }
  await page.mouse.up();
  await page.waitForTimeout(60);
}

const order = (page, box) =>
  page.$$eval(`#${box} [data-item]`, els => els.map(e => e.dataset.item));

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 500 } });
  page.on('pageerror', e => no('error en la página', String(e)));

  await page.setContent(HTML);
  await page.addScriptTag({ content: readFileSync(join(root, 'assets/sortable.js'), 'utf8') });

  await page.evaluate(() => {
    window.drops = [];
    window.prSortable.rule({
      container: '.box', item: '[data-item]', handle: '[data-grip]', group: 'x',
      id: el => el.dataset.item,
      onDrop(d) { window.drops.push({ el: d.el.dataset.item, to: d.to.id, ids: d.ids }); }
    });
  });

  // ── 1. Bajar una fila un lugar ──────────────────────────────────────────
  await drag(page, 'a1', '[data-item="a2"]', 'abajo');
  is('bajar una fila la deja después de la siguiente', await order(page, 'A'), ['a2', 'a1', 'a3']);
  is('avisa el orden nuevo', (await page.evaluate(() => window.drops.at(-1))).ids, ['a2', 'a1', 'a3']);

  // ── 2. Subir hasta el principio ─────────────────────────────────────────
  await drag(page, 'a3', '[data-item="a2"]', 'arriba');
  is('subir del final al principio', await order(page, 'A'), ['a3', 'a2', 'a1']);

  // ── 3. Un clic sin mover no reordena ni avisa ───────────────────────────
  const antes = await page.evaluate(() => window.drops.length);
  const g = await page.locator('[data-item="a2"] [data-grip]').boundingBox();
  await page.mouse.move(g.x + 12, g.y + 12);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(40);
  is('un clic sin arrastrar no toca nada', await page.evaluate(() => window.drops.length), antes);

  // ── 4. Soltar en otra lista ─────────────────────────────────────────────
  await drag(page, 'a1', '[data-item="b1"]', 'abajo');
  is('se puede soltar en la otra lista', await order(page, 'B'), ['b1', 'a1']);
  is('la lista de origen queda sin él', await order(page, 'A'), ['a3', 'a2']);
  const d = await page.evaluate(() => window.drops.at(-1));
  is('avisa a qué lista fue', [d.to, d.ids], ['B', ['b1', 'a1']]);

  // ── 5. No queda basura en la pantalla ───────────────────────────────────
  is('el fantasma se limpió', await page.$$eval('.pr-ghost', e => e.length), 0);
  is('ninguna fila quedó atenuada', await page.$$eval('.pr-drag-src', e => e.length), 0);

  // ── 6. El teclado hace lo mismo ─────────────────────────────────────────
  await page.locator('[data-item="a3"] [data-grip]').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(40);
  is('flecha abajo baja un lugar', await order(page, 'A'), ['a2', 'a3']);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(40);
  is('en el último lugar, la flecha no hace nada', await order(page, 'A'), ['a2', 'a3']);

  await browser.close();
  console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
  process.exit(fail ? 1 : 0);
};

run().catch(e => { console.error(e); process.exit(1); });
