// La prescripción se escribe una vez y se baja.
//
// Un bloque de gimnasio son casi siempre cinco ejercicios con las mismas
// series, las mismas repeticiones y la misma pausa. Escribirlo cinco veces es
// el trabajo que la pantalla tiene que sacarle de encima al preparador.
//
// Y de paso: los botones de cada fila tienen que caer DENTRO de la tarjeta.
// Estaban en una columna de 34 píxeles con dos botones de treinta adentro, así
// que el segundo se dibujaba fuera del borde blanco.
//
//   node tests/session-copy-down.dom.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8959;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

// El primero prescrito, el segundo y el tercero vacíos, y el cuarto con las
// series cargadas una por una: ese no se toca.
const BLOQUES = [{
  id: 'b-1', position: 0, title: 'Fuerza', kind: 'main', method: 'straight', rounds: null, rest_s: null, notes: null,
  session_items: [
    { id: 'i-1', position: 0, exercise_id: null, name: 'Sentadilla',  sets: 4, reps: '6-8', load: '80%', rest_s: 120,
      tempo: null, side: 'both', mode: null, notes: null, exercises: null, session_sets: [] },
    { id: 'i-2', position: 1, exercise_id: null, name: 'Press banca', sets: null, reps: null, load: null, rest_s: null,
      tempo: null, side: 'both', mode: null, notes: null, exercises: null, session_sets: [] },
    { id: 'i-3', position: 2, exercise_id: null, name: 'Remo',        sets: null, reps: null, load: null, rest_s: null,
      tempo: null, side: 'both', mode: null, notes: null, exercises: null, session_sets: [] },
    { id: 'i-4', position: 3, exercise_id: null, name: 'Peso muerto', sets: null, reps: null, load: null, rest_s: null,
      tempo: null, side: 'both', mode: null, notes: null, exercises: null,
      session_sets: [{ id: 's-1', position: 0, reps: '5', load: '100', rest_s: 180, tempo: null, note: null }] },
  ],
}];

const FALSO = `
  window.__sql = [];
  const EV = { id:'e-1', date:'2026-09-07', start_time:'15:00:00', end_time:'16:00:00', type:'gym',
               title:'Gym', location:null, notes:null, athlete_id:'a-1',
               athletes:{ first_name:'Ignacio', last_name:'Amarilla' } };
  window.__blocks = ${JSON.stringify(BLOQUES)};
  // Para poder probar otra composición del bloque después de recargar: el
  // falso se vuelve a ejecutar en cada carga y pisaría lo que se haya tocado.
  try { const otro = JSON.parse(localStorage.getItem('__otrosItems') || 'null');
        if (otro) window.__blocks[0].session_items = otro; } catch (e) {}
  const tabla = (t) => {
    const filas = t === 'session_blocks' ? window.__blocks
                : t === 'events' ? [EV]
                : [];
    let escribe = false;
    const propios = {
      insert(row) { escribe = true; window.__sql.push({ op:'insert', t, row }); return q; },
      update(row) { escribe = true; window.__sql.push({ op:'update', t, row }); return q; },
      delete() { escribe = true; window.__sql.push({ op:'delete', t }); return q; },
      // .in('id', [...]) guarda a quiénes se les escribió: es lo que hay que
      // comprobar, que sean exactamente los de abajo y ninguno más.
      in(col, vals) { const u = window.__sql[window.__sql.length-1];
                      if (u && escribe) u.ids = vals; return q; },
      // Un update filtrado por la RLS vuelve con cero filas y sin error: el
      // falso devuelve tantas como se pidieron para no tapar ese caso.
      select() { if (!escribe) return q;
                 const u = window.__sql[window.__sql.length-1];
                 const n = (u && u.ids) ? u.ids.length : 1;
                 return Promise.resolve({ data: Array.from({length:n}, (_,k)=>({id:'x'+k})), error:null }); },
      single: () => Promise.resolve({ data: filas[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: filas[0] || null, error: null }),
      then: (res) => Promise.resolve({ data: filas, error: null }).then(res),
    };
    return new Proxy(propios, { get(o,k){ return (k in o) ? o[k] : (typeof k === 'symbol' ? undefined : () => q); } });
  };
  let q;
  window.sb = { from:(t)=>(q=tabla(t)), rpc:()=>Promise.resolve({data:null,error:null}),
    auth:{ getUser:()=>Promise.resolve({data:{user:{id:'u-1'}}}) } };
  window.requireCoach=()=>Promise.resolve(true);
  window.requireAuth=()=>Promise.resolve(true);
  window.getProfile=()=>Promise.resolve({id:'u-1',role:'coach',full_name:'Joaquín Reiris'});
  window.getWorkspace=()=>Promise.resolve({id:'w-1',accent:'orange',name:'Espacio'});
  window.getWorkspaceId=()=>Promise.resolve('w-1');
  window.getSeatUsage=()=>Promise.resolve({used:1,limit:5,left:4});
  window.applyWorkspaceTheme=()=>{};
  window.prToast=(m,k)=>{ window.__toast = { m, k }; };
  window.prEsc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  window.prInitials=(n)=>String(n||'').trim().slice(0,2).toUpperCase();
  window.prYMD=(d)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  window.prToday=()=>'2026-09-07';
  window.prFetchAll=async(f)=>{const r=await f(0,1000);return r.data||[];};
`;

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/Session.html`, { method: 'HEAD' }); if (r.ok) return; } catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  console.error('el servidor no levantó'); server.kill(); process.exit(1);
})();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
  await page.addInitScript(() => { try { localStorage.setItem('pr_lang', 'es'); } catch (e) {} });
  page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.goto(`http://localhost:${PORT}/Session.html?event=e-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.se-item', { timeout: 15000 });

  console.log('\nLOS BOTONES CAEN DENTRO DE LA TARJETA');
  // El bug: la columna medía 34px y adentro había dos botones de treinta, así
  // que el segundo se dibujaba pasando el borde blanco.
  const dentro = await page.evaluate(() => {
    const tarjeta = document.querySelector('[data-block]').getBoundingClientRect();
    return [...document.querySelectorAll('.se-item .se-del button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { ancho: Math.round(r.width), sobra: Math.round(r.right - tarjeta.right) };
    });
  });
  is('ninguno se sale por la derecha', dentro.every((b) => b.sobra <= 0), true);
  is('y ninguno quedó aplastado', dentro.every((b) => b.ancho >= 24), true);

  console.log('\nEL BOTÓN APARECE DONDE TIENE SENTIDO');
  const donde = await page.evaluate(() =>
    [...document.querySelectorAll('.se-item')].map((it) => ({
      nombre: it.querySelector('.se-item-name span:nth-child(2)').textContent.trim(),
      tiene: !!it.querySelector('[data-act="copy-down"]'),
    })));
  is('en el que está prescrito y tiene gente debajo', donde[0].tiene, true);
  is('no en los que están vacíos', [donde[1].tiene, donde[2].tiene], [false, false]);
  is('ni en el último', donde[3].tiene, false);

  console.log('\nCOPIA LO QUE HAY ESCRITO, NO LO QUE ESTABA GUARDADO');
  // Lo que el preparador acaba de teclear puede no haber disparado su change.
  await page.evaluate(() => { window.__sql = []; });
  const primera = page.locator('.se-item').first();
  await primera.locator('.se-in[data-f="sets"]').fill('5');
  await primera.locator('[data-act="copy-down"]').click({ force: true });
  await page.waitForTimeout(500);

  const escrito = await page.evaluate(() =>
    window.__sql.filter((x) => x.op === 'update' && x.t === 'session_items').pop());
  is('manda un solo update', !!escrito, true);
  is('con lo que hay en pantalla', escrito && escrito.row,
    { sets: 5, reps: '6-8', load: '80%', rest_s: 120 });
  // El cuarto tiene sus series cargadas una por una: pisarle la prescripción
  // pareja sería contradecir lo que se escribió serie por serie.
  is('a los dos de abajo y no al de series detalladas', escrito && escrito.ids, ['i-2', 'i-3']);
  is('y lo dice', await page.evaluate(() => window.__toast && window.__toast.m),
    'Copiado a 2 ejercicios');

  console.log('\nSI NO HAY A QUIÉN COPIARLE, NO INVENTA UN GUARDADO');
  // Sólo queda el prescrito y el de series detalladas debajo.
  await page.evaluate((items) => localStorage.setItem('__otrosItems', JSON.stringify(items)),
    [BLOQUES[0].session_items[0], BLOQUES[0].session_items[3]]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { window.__sql = []; window.__toast = null; });
  await page.waitForSelector('.se-item', { timeout: 10000 });
  await page.locator('.se-item').first().locator('[data-act="copy-down"]').click({ force: true });
  await page.waitForTimeout(400);
  const nada = await page.evaluate(() => ({
    guardo: window.__sql.some((x) => x.op === 'update'),
    aviso: window.__toast && window.__toast.m,
  }));
  is('no manda nada', nada.guardo, false);
  is('y explica por qué', nada.aviso, 'No hay ningún ejercicio debajo al que copiárselo.');
  await page.evaluate(() => localStorage.removeItem('__otrosItems'));
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
