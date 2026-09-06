// El menú: cargar en unidades y que lo escrito a mano cuente.
//
// Los valores del catálogo vienen por 100 g, que es como vienen las tablas de
// composición, y por eso todo se cargaba en gramos. Pero nadie come «55 gramos
// de huevo»: come un huevo.
//
// Y el agujero de al lado: un alimento fuera del catálogo se guardaba en cero
// calorías, con el campo de cantidad deshabilitado. El total del día salía
// corto y no había nada en pantalla que lo dijera.
//
//   node tests/meal-units.dom.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8927;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

// Huevo: 143 kcal por 100 g, y una unidad pesa 55 g.
const FALSO = `
  window.__guardado = [];
  const EV = { id: 'e-1', athlete_id: 'a-1', date: '2026-09-07', start_time: '08:15',
               type: 'meal', title: 'Desayuno', athletes: { first_name: 'Ignacio', last_name: 'Amarilla' } };
  const HUEVO = { id: 'f-1', name: 'Whole egg', name_es: 'Huevo entero', name_pt: 'Ovo inteiro',
                  food_group: 'dairy', kcal: 143, protein_g: 13, carbs_g: 0.7, fats_g: 10, fiber_g: 0,
                  unit_name: 'unit', unit_g: 55 };
  const ARROZ = { id: 'f-2', name: 'White rice', name_es: 'Arroz blanco cocido', name_pt: 'Arroz branco',
                  food_group: 'grain', kcal: 130, protein_g: 2.7, carbs_g: 28, fats_g: 0.3, fiber_g: 0.4,
                  unit_name: 'cup', unit_g: 158 };
  const CAFE  = { id: 'f-3', name: 'Coffee', name_es: 'Café', name_pt: 'Café',
                  food_group: 'drink', kcal: 1, protein_g: 0.1, carbs_g: 0, fats_g: 0, fiber_g: 0,
                  unit_name: 'cup', unit_g: 240 };
  const CREA  = { id: 'f-4', name: 'Creatine', name_es: 'Creatina', name_pt: 'Creatina',
                  food_group: 'supp', kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0,
                  unit_name: null, unit_g: null };
  const POLLO = { id: 'f-5', name: 'Chicken', name_es: 'Pechuga de pollo', name_pt: 'Frango',
                  food_group: 'meat', kcal: 165, protein_g: 31, carbs_g: 0, fats_g: 3.6, fiber_g: 0,
                  unit_name: null, unit_g: null };
  const guardadoLocal = (() => { try { return JSON.parse(localStorage.getItem('t_items') || 'null'); } catch (e) { return null; } })();
  window.__items = guardadoLocal || [
    { id: 'i-1', event_id: 'e-1', position: 0, food_id: 'f-1', name: 'Huevo entero',
      qty_g: 55, unit_qty: 1, kcal: 78.7, protein_g: 7.2, carbs_g: 0.4, fats_g: 5.5, fiber_g: 0 },
    { id: 'i-3', event_id: 'e-1', position: 1, food_id: 'f-2', name: 'Arroz blanco cocido',
      qty_g: 158, unit_qty: 1, kcal: 205, protein_g: 4.3, carbs_g: 44.2, fats_g: 0.5, fiber_g: 0.6 },
    { id: 'i-2', event_id: 'e-1', position: 2, food_id: null, name: 'Torta de la abuela',
      qty_g: null, unit_qty: null, qty_text: '1 porción', kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0 },
  ];
  const tabla = (t) => {
    const filas = t === 'events' ? [EV] : t === 'foods' ? [HUEVO, ARROZ, CAFE, CREA, POLLO]
                : t === 'meal_items' ? window.__items
                : t === 'recipes' ? (window.__recipes || [])
                : [];
    const propios = {
      __creada: null,
      update(row) { window.__guardado.push({ t, row }); return q; },
      insert(row) {
        window.__guardado.push({ t, op: 'insert', row });
        // Lo que devuelve un insert con .select().single() es la fila creada,
        // no la primera de la tabla. Sin esto, guardar un plato devuelve null y
        // el código se cae al pedirle el id.
        propios.__creada = Object.assign({ id: t === 'recipes' ? 'r-1' : 'x-1' }, row);
        // Un plato guardado vuelve como tal: así se puede probar el ciclo
        // entero —guardar y volver a meterlo— sin base de verdad.
        if (t === 'recipes') {
          window.__recipes = (window.__recipes || []).concat([
            Object.assign({ id: 'r-1', recipe_items: [] }, row)]);
        }
        if (t === 'recipe_items' && window.__recipes && window.__recipes[0]) {
          window.__recipes[0].recipe_items = [].concat(row);
        }
        return q;
      },
      delete() { window.__guardado.push({ t, op: 'delete' }); return q; },
      single: () => Promise.resolve({ data: propios.__creada || filas[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: t === 'events' ? EV : null, error: null }),
      then: (res) => Promise.resolve({ data: filas, error: null }).then(res),
    };
    return new Proxy(propios, { get(o, k) { return (k in o) ? o[k] : (typeof k === 'symbol' ? undefined : () => q); } });
  };
  let q;
  window.sb = { from: (t) => (q = tabla(t)), rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) } };
  window.requireCoach = () => Promise.resolve(true);
  window.getWorkspace = () => Promise.resolve({ id: 'w-1', accent: 'orange' });
  window.getWorkspaceId = () => Promise.resolve('w-1');
  window.applyWorkspaceTheme = () => {};
  window.getSeatUsage = () => Promise.resolve({ used: 1, limit: 10, left: 9 });
  window.getProfile = () => Promise.resolve({ id: 'u-1', role: 'coach', full_name: 'Joaquín Reiris' });
  window.requireAuth = () => Promise.resolve(true);
  window.prFetchAll = async (f) => { const r = await f(0, 1000); return r.data || []; };
  window.prToast = (m) => { (window.__toasts = window.__toasts || []).push(m); };
  window.prEsc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  window.prInitials = (n) => String(n||'').trim().slice(0,2).toUpperCase();
  window.prYMD = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  window.prToday = () => '2026-09-07';
`;

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/Meal.html`, { method: 'HEAD' }); if (r.ok) return; } catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  console.error('el servidor no levantó'); server.kill(); process.exit(1);
})();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: 'es-ES' });
  await page.addInitScript(() => { try { localStorage.setItem('pr_lang', 'es'); } catch (e) {} });
  page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.goto(`http://localhost:${PORT}/Meal.html?event=e-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-item="i-1"]', { timeout: 15000 });

  console.log('\nUN HUEVO SE DICE «1 UNIDAD», NO «55 GRAMOS»');
  const huevo = await page.evaluate(() => {
    const row = document.querySelector('[data-item="i-1"]');
    return {
      cantidad: row.querySelector('.ml-qty').value,
      medida: row.querySelector('[data-u]') ? row.querySelector('[data-u]').value : null,
      opciones: [...row.querySelectorAll('[data-u] option')].map((o) => o.textContent.trim()),
      pie: row.querySelector('.ml-name small') ? row.querySelector('.ml-name small').textContent.trim() : null,
    };
  });
  is('la cantidad dice 1', huevo.cantidad, '1');
  is('y la medida es la unidad', huevo.medida, 'u');
  is('las dos opciones están en castellano', huevo.opciones, ['gramos', 'unidades']);
  is('debajo queda el peso, que es lo que se cumple', huevo.pie, '55 g');

  console.log('\nDOS HUEVOS SON 110 g Y SUS MACROS');
  await page.fill('[data-item="i-1"] .ml-qty', '2');
  await page.evaluate(() => document.querySelector('[data-item="i-1"] .ml-qty').blur());
  await page.waitForTimeout(400);
  const guardado = await page.evaluate(() => window.__guardado.filter((g) => g.t === 'meal_items'));
  const u = guardado[guardado.length - 1];
  is('guarda 110 gramos', u && u.row.qty_g, 110);
  is('y recuerda que eran 2 unidades', u && u.row.unit_qty, 2);
  is('las calorías salen de los gramos', u && Math.round(u.row.kcal), 157);

  console.log('\nCOMIDA, BEBIDA Y SUPLEMENTO, CADA UNO EN LO SUYO');
  // Al armar un desayuno nadie está pensando en la creatina.
  await page.click('#add');
  await page.waitForTimeout(400);

  const leer = () => page.evaluate(() => ({
    filas: [...document.querySelectorAll('#fp-list .fp-row .fp-name')].map((x) => x.textContent.trim()),
    grupos: [...document.querySelectorAll('#fp-list .fp-group')].map((x) => x.textContent.trim()),
  }));

  const todo = await leer();
  is('en «Todo» están los cinco', todo.filas.length, 5);
  is('agrupados por categoría, y no alfabéticamente',
    todo.grupos, ['Carnes', 'Lácteos y huevo', 'Cereales y panificados', 'Bebidas', 'Suplementos']);

  await page.click('.fp-tabs [data-kind="drink"]');
  await page.waitForTimeout(250);
  const bebidas = await leer();
  is('en «Bebidas» solo el café', bebidas.filas, ['Café']);

  await page.click('.fp-tabs [data-kind="supp"]');
  await page.waitForTimeout(250);
  is('en «Suplementos» solo la creatina', (await leer()).filas, ['Creatina']);

  await page.click('.fp-tabs [data-kind="food"]');
  await page.waitForTimeout(250);
  const comida = await leer();
  is('y en «Comida» lo que se come, sin bebidas ni suplementos',
    comida.filas.sort(), ['Arroz blanco cocido', 'Huevo entero', 'Pechuga de pollo']);

  console.log('\nBUSCANDO NO SE AGRUPA: SE BUSCA');
  await page.click('.fp-tabs [data-kind="all"]');
  await page.fill('#fp-q', 'caf');
  await page.waitForTimeout(250);
  const buscado = await leer();
  is('sale lo que se buscó', buscado.filas, ['Café']);
  is('sin encabezados de sección de por medio', buscado.grupos.length, 0);
  await page.fill('#fp-q', '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\nUNA COMIDA SE GUARDA COMO PLATO Y VUELVE ENTERA');
  // Una boloñesa son siete alimentos cargados de a uno, y la semana que viene
  // otra vez. Se arma una vez y se usa siempre.
  page.on('dialog', (d) => d.accept('Boloñesa'));
  await page.evaluate(() => { window.__guardado = []; });
  is('el botón de guardar aparece con alimentos cargados',
    await page.isVisible('#save-recipe'), true);
  await page.click('#save-recipe');
  await page.waitForTimeout(500);

  const guardadoPlato = await page.evaluate(() => window.__guardado);
  const receta = guardadoPlato.find((g) => g.t === 'recipes');
  const ingredientes = guardadoPlato.find((g) => g.t === 'recipe_items');
  is('se guarda el plato con su nombre', receta && receta.row.name, 'Boloñesa');
  is('con los ingredientes que tenían alimento y cantidad', (ingredientes && ingredientes.row.length) || 0, 2);
  // El escrito a mano no entra: sin alimento del catálogo no se puede reusar.
  is('y no el escrito a mano',
    (ingredientes && ingredientes.row.some((i) => i.name === 'Torta de la abuela')) || false, false);

  console.log('\nY SE VUELVE A METER, EN MEDIA PORCIÓN');
  await page.evaluate(() => { window.__guardado = []; });
  await page.click('#add-recipe');
  await page.waitForTimeout(400);
  const hay = await page.evaluate(() => document.querySelectorAll('#rp-list [data-recipe]').length);
  is('el plato aparece en la lista', hay, 1);

  await page.fill('#rp-serv', '1/2');
  await page.click('#rp-list [data-recipe]');
  await page.waitForTimeout(500);
  const metido = await page.evaluate(() => window.__guardado.filter((g) => g.t === 'meal_items'));
  const filas = metido[0] && metido[0].row;
  is('entran sus ingredientes de una', (filas && filas.length) || 0, 2);
  // El huevo estaba en 55 g: media receta son 27.5.
  const medioHuevo = filas && filas.find((f) => f.name === 'Huevo entero');
  is('con las cantidades a la mitad', medioHuevo && medioHuevo.qty_g, 27.5);
  is('y sus calorías recalculadas', medioHuevo && Math.round(medioHuevo.kcal), 39);

  console.log('\nMEDIA TAZA SE ESCRIBE «1/2», NO «0.5»');
  // Nadie mide en decimales cuando cocina. Obligar a traducir mentalmente antes
  // de escribir es fricción en lo que más se repite: cargar comida.
  await page.evaluate(() => { window.__guardado = []; });
  await page.fill('[data-item="i-3"] .ml-qty', '1/2');
  await page.evaluate(() => document.querySelector('[data-item="i-3"] .ml-qty').blur());
  await page.waitForTimeout(400);
  const media = await page.evaluate(() => window.__guardado.filter((g) => g.t === 'meal_items').pop());
  is('media taza de arroz son 79 gramos', media && media.row.qty_g, 79);
  is('y se recuerda que era media', media && media.row.unit_qty, 0.5);
  is('con sus calorías, que salen de los gramos', media && Math.round(media.row.kcal), 103);

  // Y de vuelta: lo guardado se muestra como fracción, no como 0.5.
  await page.evaluate(() => {
    const it = window.__items.find((x) => x.id === 'i-3');
    it.qty_g = 79; it.unit_qty = 0.5;
    try { localStorage.setItem('t_items', JSON.stringify(window.__items)); } catch (e) {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-item="i-3"]', { timeout: 15000 });
  is('al volver dice 1/2, no 0.5',
    await page.inputValue('[data-item="i-3"] .ml-qty'), '1/2');

  console.log('\nY LAS OTRAS FORMAS DE ESCRIBIRLO');
  for (const [escrito, gramos] of [['1 1/2', 237], ['½', 79], ['2', 316], ['0.25', 40]]) {
    await page.evaluate(() => { window.__guardado = []; });
    await page.fill('[data-item="i-3"] .ml-qty', escrito);
    await page.evaluate(() => document.querySelector('[data-item="i-3"] .ml-qty').blur());
    await page.waitForTimeout(350);
    const g = await page.evaluate(() => window.__guardado.filter((x) => x.t === 'meal_items').pop());
    is(`«${escrito}» son ${gramos} g`, g && Math.round(g.row.qty_g), gramos);
  }

  await page.evaluate(() => { try { localStorage.removeItem('t_items'); } catch (e) {} });

  console.log('\nCAMBIAR DE MEDIDA NO CAMBIA LO QUE COME');
  await page.evaluate(() => { window.__guardado = []; });
  await page.selectOption('[data-item="i-1"] [data-u]', 'g');
  await page.waitForTimeout(400);
  const cambio = await page.evaluate(() => window.__guardado[0]);
  is('pasar a gramos solo suelta la unidad', cambio && cambio.row, { unit_qty: null });

  console.log('\nLO ESCRITO A MANO AVISA QUE NO CUENTA');
  const mano = await page.evaluate(() => {
    const row = document.querySelector('[data-item="i-2"]');
    return {
      avisa: !!row.querySelector('.ml-warn'),
      texto: row.querySelector('.ml-warn') ? row.querySelector('.ml-warn').textContent.trim() : null,
      atenuada: row.classList.contains('is-empty'),
      cantidadEditable: !row.querySelector('.ml-qty').disabled,
      macrosEditables: row.querySelectorAll('.ml-macro-in').length,
      sinMedida: !row.querySelector('.ml-unit'),
    };
  });
  is('la fila avisa', mano.avisa, true);
  is('con un texto que se entiende', mano.texto, 'Sin calorías: no suma al total.');
  is('y se ve distinta', mano.atenuada, true);
  is('la cantidad ya no está deshabilitada', mano.cantidadEditable, true);
  is('y no lleva medida que elegir, así entra el texto entero', mano.sinMedida, true);
  is('y los cuatro macros se pueden escribir', mano.macrosEditables, 4);

  console.log('\nY SE LE PUEDEN PONER LAS CALORÍAS');
  await page.evaluate(() => { window.__guardado = []; });
  await page.fill('[data-item="i-2"] [data-m="kcal"]', '320');
  await page.evaluate(() => document.querySelector('[data-item="i-2"] [data-m="kcal"]').blur());
  await page.waitForTimeout(400);
  const kcal = await page.evaluate(() => window.__guardado[0]);
  is('se guardan las calorías escritas', kcal && kcal.row, { kcal: 320 });
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
