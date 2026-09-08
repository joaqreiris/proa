// Los tests: un número contra el nivel propio.
//
// Acá lo que puede mentir no es la pantalla, es la cuenta. Tres cosas:
//
//   · el signo. En un salto, más es mejor; en un sprint, menos. Si el cambio no
//     se normaliza en términos de rendimiento, un sprint más lento se lee como
//     una mejora y el aviso de fatiga aparece justo al revés.
//   · el basal. Se compara contra el PROMEDIO de las tomas previas, no contra
//     la mejor: el récord se hizo un día bueno, y medir todo contra el mejor
//     día de la vida deja al atleta permanentemente en rojo.
//   · con qué derecho. Con una sola toma previa, «bajó un 12%» puede ser que
//     la primera vez la midieron mal. Por eso hacen falta tres.
//
//   node tests/assessments.dom.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8963;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

// CMJ: cuatro tomas alrededor de 40 y la última en 34. El basal de las cuatro
// primeras es 40, así que 34 es una caída del 15% — el corte de alerta.
// Sprint 30 m: baja de 4.30 a 4.10, que en tiempo es MEJOR.
// Salto a una pierna: 30 y 24 el mismo día, 20% de diferencia entre lados.
// Cooper: una sola toma, todavía no hay con qué comparar.
const M = [
  { id: 'm-1', athlete_id: 'a-1', test_key: 'cmj', date: '2026-07-06', value: 40, side: null, notes: null },
  { id: 'm-2', athlete_id: 'a-1', test_key: 'cmj', date: '2026-07-20', value: 41, side: null, notes: null },
  { id: 'm-3', athlete_id: 'a-1', test_key: 'cmj', date: '2026-08-03', value: 39, side: null, notes: null },
  { id: 'm-4', athlete_id: 'a-1', test_key: 'cmj', date: '2026-08-17', value: 40, side: null, notes: null },
  { id: 'm-5', athlete_id: 'a-1', test_key: 'cmj', date: '2026-09-07', value: 34, side: null, notes: null },

  { id: 'm-6',  athlete_id: 'a-1', test_key: 'sprint_30', date: '2026-07-06', value: 4.30, side: null, notes: null },
  { id: 'm-7',  athlete_id: 'a-1', test_key: 'sprint_30', date: '2026-08-03', value: 4.30, side: null, notes: null },
  { id: 'm-8',  athlete_id: 'a-1', test_key: 'sprint_30', date: '2026-08-17', value: 4.30, side: null, notes: null },
  { id: 'm-9',  athlete_id: 'a-1', test_key: 'sprint_30', date: '2026-09-07', value: 4.10, side: null, notes: null },

  { id: 'm-10', athlete_id: 'a-1', test_key: 'slcmj', date: '2026-09-07', value: 30, side: 'L', notes: null },
  { id: 'm-11', athlete_id: 'a-1', test_key: 'slcmj', date: '2026-09-07', value: 24, side: 'R', notes: null },

  { id: 'm-12', athlete_id: 'a-1', test_key: 'cooper', date: '2026-09-01', value: 2800, side: null, notes: null },

  // Flexiones: de 20 a 26, que es un 30% arriba del basal. Eso ya no es el
  // error de medir.
  { id: 'm-13', athlete_id: 'a-1', test_key: 'pushups', date: '2026-07-06', value: 20, side: null, notes: null },
  { id: 'm-14', athlete_id: 'a-1', test_key: 'pushups', date: '2026-08-03', value: 20, side: null, notes: null },
  { id: 'm-15', athlete_id: 'a-1', test_key: 'pushups', date: '2026-08-17', value: 20, side: null, notes: null },
  { id: 'm-16', athlete_id: 'a-1', test_key: 'pushups', date: '2026-09-07', value: 26, side: null, notes: null },
];

const FALSO = `
  window.__sql = [];
  const A = { id:'a-1', workspace_id:'w-1', first_name:'Ignacio', last_name:'Amarilla', sex:'m',
              birth_date:'2002-04-11', timezone:'America/Montevideo', status:'active',
              athlete_accounts:[{user_id:'u-2'}],
              athlete_intake:[{ athlete_id:'a-1', height_cm:180, weight_kg:78, completed_at:'2026-09-01' }],
              workspaces:{ name:'Espacio', accent:'orange' } };
  window.__mediciones = ${JSON.stringify(M)};
  const tabla = (t) => {
    const filas = t === 'athletes' ? [A]
                : t === 'assessments' ? window.__mediciones
                : [];
    let escribe = false;
    const propios = {
      insert(row) { escribe = true; window.__sql.push({ op:'insert', t, row }); return q; },
      upsert(row, opts) { escribe = true; window.__sql.push({ op:'upsert', t, row, opts }); return q; },
      update(row) { escribe = true; window.__sql.push({ op:'update', t, row }); return q; },
      delete() { escribe = true; window.__sql.push({ op:'delete', t }); return q; },
      select() {
        if (!escribe) return q;
        const u = window.__sql[window.__sql.length-1] || {};
        const n = Array.isArray(u.row) ? u.row.length : 1;
        return Promise.resolve({ data: Array.from({length:n}, (_,k)=>({id:'nuevo'+k})), error:null });
      },
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
  window.requireAthlete=()=>Promise.resolve(true);
  window.getProfile=()=>Promise.resolve({id:'u-1',role:'coach',full_name:'Joaquín Reiris'});
  window.getWorkspace=()=>Promise.resolve({id:'w-1',accent:'orange',name:'Espacio'});
  window.getWorkspaceId=()=>Promise.resolve('w-1');
  window.getSeatUsage=()=>Promise.resolve({used:1,limit:5,left:4});
  window.myCoachName=(f)=>Promise.resolve('Joaquín Reiris');
  window.intakeDone=()=>Promise.resolve(true);
  window.applyWorkspaceTheme=()=>{};
  window.prToast=()=>{};
  window.prEsc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  window.prInitials=(n)=>String(n||'').trim().slice(0,2).toUpperCase();
  window.prYMD=(d)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  window.prToday=()=>'2026-09-08';
  window.prFetchAll=async(f)=>{const r=await f(0,1000);return r.data||[];};
  window.prWeekBoard={ mount:()=>Promise.resolve() };
`;

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/Athlete.html`, { method: 'HEAD' }); if (r.ok) return; } catch (e) {}
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

  await page.goto(`http://localhost:${PORT}/Athlete.html?id=a-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-tab="tests"]', { timeout: 15000 });
  await page.click('[data-tab="tests"]');
  await page.waitForSelector('.as-card', { timeout: 10000 });

  console.log('\nLA CUENTA, QUE ES LO QUE PUEDE MENTIR');
  const tarjetas = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('.as-card')].map((c) => [
      c.dataset.testHist,
      {
        titulo: c.querySelector('.as-card-head b').textContent.trim(),
        valores: [...c.querySelectorAll('.as-val > b')].map((b) => b.textContent.trim()),
        deltas: [...c.querySelectorAll('.as-delta')].map((d) => ({
          txt: d.textContent.replace(/\s+/g, ' ').trim(),
          estado: [...d.classList].find((x) => x.startsWith('is-')),
        })),
        sinBase: [...c.querySelectorAll('.as-nobase')].map((e) => e.textContent.trim()),
      },
    ])));

  // Basal = (40+41+39+40)/4 = 40. Hoy 34 → −15%.
  is('el salto se compara contra el promedio, no contra el récord',
    tarjetas.cmj.deltas[0].txt, '−15.0% de su nivel');
  is('y una caída de ese tamaño se marca en rojo', tarjetas.cmj.deltas[0].estado, 'is-alert');

  // 4.30 → 4.10 son 0.2 s MENOS: en un sprint eso es mejor, no peor.
  is('un sprint más rápido se lee como mejora, no como caída',
    tarjetas.sprint_30.deltas[0].txt.startsWith('+4.7%'), true);
  // Y queda neutro, no en verde: por debajo del 10% la diferencia se la come
  // el error de medir, y pintar de verde una mejora que puede ser el
  // cronómetro es tan mentiroso como pintar de rojo una caída que no existe.
  is('sin alarma, y sin cantar una mejora que puede ser ruido',
    tarjetas.sprint_30.deltas[0].estado, 'is-ok');

  is('una mejora que sí supera el ruido se marca',
    [tarjetas.pushups.deltas[0].txt, tarjetas.pushups.deltas[0].estado],
    ['+30.0% de su nivel', 'is-up']);

  console.log('\nCON UNA SOLA TOMA NO SE OPINA');
  // «Bajó un 12%» con un solo antecedente puede ser que la primera vez se
  // midió mal. Se dice cuántas faltan en vez de inventar una lectura.
  is('el Cooper no muestra ningún porcentaje', tarjetas.cooper.deltas.length, 0);
  is('dice qué falta para poder compararlo',
    tarjetas.cooper.sinBase[0], 'faltan 2 tomas para comparar');

  console.log('\nLOS DOS LADOS SE COMPARAN ENTRE ELLOS');
  const asim = await page.evaluate(() => {
    const c = document.querySelector('[data-test-hist="slcmj"]');
    const a = c.querySelector('.as-asym');
    return {
      lados: [...c.querySelectorAll('.as-side')].map((s) => s.textContent.trim()),
      pct: a.querySelector('b').textContent.trim(),
      cual: a.querySelector('em').textContent.trim(),
      estado: [...a.classList].find((x) => x.startsWith('is-')),
    };
  });
  // 30 contra 24: la diferencia es el 20% del lado más alto.
  is('se ven los dos lados', asim.lados.slice(0, 2), ['Izquierda', 'Derecha']);
  is('con su diferencia', asim.pct, '20%');
  is('diciendo cuál es el que más rinde', asim.cual, 'más la izquierda');
  is('y marcada, porque pasa el 15%', asim.estado, 'is-alert');

  console.log('\nLA HISTORIA, TOMA POR TOMA');
  await page.click('[data-test-hist="cmj"]');
  await page.waitForSelector('.as-hist-row', { timeout: 5000 });
  const hist = await page.evaluate(() => ({
    como: document.getElementById('hist-how').textContent.trim().slice(0, 30),
    filas: [...document.querySelectorAll('.as-hist-row')].map((r) => ({
      fecha: r.querySelector('span').textContent.trim(),
      valor: r.querySelector('b').textContent.trim(),
      borrar: !!r.querySelector('[data-del-as]'),
    })),
  }));
  is('están las cinco tomas', hist.filas.length, 5);
  is('la más reciente arriba', hist.filas[0].valor, '34.0 cm');
  is('explica cómo se toma el test', hist.como.startsWith('De pie, manos en la cintura'), true);
  is('y cada una se puede borrar', hist.filas.every((f) => f.borrar), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  console.log('\nUN NÚMERO IMPOSIBLE NO ENTRA');
  // Un salto de 400 cm es un dedo corrido de tecla, y entra a la serie
  // arruinando el basal de todo lo que venga después.
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#as-add');
  await page.waitForTimeout(300);
  await page.selectOption('#as-test', 'cmj');
  await page.fill('#as-v', '400');
  await page.click('#f-as button[type="submit"]');
  await page.waitForTimeout(300);
  const rechazo = await page.evaluate(() => ({
    aviso: document.getElementById('as-msg').hidden ? null : document.getElementById('as-msg').textContent,
    guardo: window.__sql.some((x) => x.op === 'upsert'),
  }));
  is('lo dice y dice qué se esperaba',
    rechazo.aviso, 'Para este test se espera un valor entre 5 y 90 cm. Revisa el número.');
  is('y no lo guarda', rechazo.guardo, false);

  console.log('\nUN TEST DE A UN LADO PIDE LOS DOS CAMPOS');
  await page.selectOption('#as-test', 'slcmj');
  await page.waitForTimeout(300);
  is('aparecen izquierda y derecha',
    await page.evaluate(() => [!!document.getElementById('as-v-L'), !!document.getElementById('as-v-R')]),
    [true, true]);
  await page.fill('#as-v-L', '31');
  await page.fill('#as-v-R', '29');
  await page.click('#f-as button[type="submit"]');
  await page.waitForTimeout(400);
  const alta = await page.evaluate(() => window.__sql.find((x) => x.op === 'upsert'));
  is('se guardan las dos en una sola ida', alta && alta.row.length, 2);
  is('cada una con su lado', alta && alta.row.map((r) => [r.side, r.value]), [['L', 31], ['R', 29]]);
  // El mismo test, el mismo día y el mismo lado es la misma medición: se
  // corrige, no se duplica.
  is('y corrigiendo la del día en vez de duplicarla',
    alta && alta.opts && alta.opts.onConflict, 'athlete_id,test_key,date,side');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
