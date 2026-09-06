// La suplementación: la indica el entrenador, el atleta la lee.
//
// No es comida y por eso no está en el catálogo de alimentos: un magnesio no se
// pesa en gramos ni aporta calorías. Lo que importa es la dosis y el CUÁNDO,
// que es la mitad de la indicación — el mismo suplemento antes de dormir o
// antes de entrenar no es lo mismo.
//
//   node tests/supplements.dom.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8953;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

// A propósito desordenados y con uno sin momento: el orden lo pone la pantalla.
const SUPS = [
  { id: 's-1', athlete_id: 'a-1', position: 0, name: 'Magnesio',  dose: '400 mg',     timing: 'bed',        notes: 'Lejos del café' },
  { id: 's-2', athlete_id: 'a-1', position: 1, name: 'Omega 3',   dose: '2 cápsulas', timing: 'lunch',      notes: null },
  { id: 's-3', athlete_id: 'a-1', position: 2, name: 'Creatina',  dose: '5 g',        timing: 'post_training', notes: null },
  { id: 's-4', athlete_id: 'a-1', position: 3, name: 'Vitamina D', dose: '2000 UI',   timing: null,         notes: null },
];

const FALSO = `
  window.__sql = [];
  const A = { id:'a-1', workspace_id:'w-1', first_name:'Ignacio', last_name:'Amarilla', sex:'m',
              birth_date:'2002-04-11', timezone:'America/Montevideo', status:'active',
              athlete_accounts:[{user_id:'u-2'}],
              athlete_intake:[{ athlete_id:'a-1', height_cm:180, weight_kg:78, completed_at:'2026-09-01' }],
              workspaces:{ name:'Espacio', accent:'orange' } };
  window.__sups = ${JSON.stringify(SUPS)};
  const tabla = (t) => {
    const filas = t === 'athletes' ? [A]
                : t === 'athlete_supplements' ? window.__sups
                : [];
    const propios = {
      insert(row) { window.__sql.push({ op:'insert', t, row }); return q; },
      update(row) { window.__sql.push({ op:'update', t, row }); return q; },
      delete() { window.__sql.push({ op:'delete', t }); return q; },
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
  window.prToday=()=>'2026-09-07';
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, locale: 'es-ES' });
  await page.addInitScript(() => { try { localStorage.setItem('pr_lang', 'es'); } catch (e) {} });
  page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.goto(`http://localhost:${PORT}/Athlete.html?id=a-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-tab="profile"]', { timeout: 15000 });
  await page.click('[data-tab="profile"]');
  await page.waitForSelector('#sp-body .sp-row', { timeout: 10000 });

  console.log('\nSE LEE EN EL ORDEN DEL DÍA, NO ALFABÉTICO');
  // Ver la lista tiene que ser leer la rutina de arriba abajo.
  const filas = await page.evaluate(() =>
    [...document.querySelectorAll('#sp-body .sp-row')].map((r) => ({
      nombre: r.querySelector('.sp-what b').textContent.trim(),
      dosis: r.querySelector('.sp-dose').textContent.trim(),
      cuando: r.querySelector('.sp-when').textContent.trim(),
    })));
  // El orden asume entrenamiento de mañana, así que «después de entrenar» cae
  // antes del almuerzo. Lo que importa es que NO sea el orden en que se
  // cargaron ni el alfabético.
  is('van del despertar a la noche', filas.map((f) => f.nombre),
    ['Creatina', 'Omega 3', 'Magnesio', 'Vitamina D']);
  is('con su dosis tal como se escribió', filas.map((f) => f.dosis),
    ['5 g', '2 cápsulas', '400 mg', '2000 UI']);
  is('y el momento en castellano', filas[2].cuando, 'Antes de dormir');
  is('el que no tiene momento lo dice', filas[3].cuando, 'Sin momento fijo');

  console.log('\nSE AGREGA UNO NUEVO');
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#sp-add');
  await page.waitForTimeout(300);
  await page.fill('#sp-name', 'Zinc');
  await page.fill('#sp-dose', '15 mg');
  await page.selectOption('#sp-timing', 'dinner');
  await page.click('#f-sp button[type="submit"]');
  await page.waitForTimeout(400);
  const alta = await page.evaluate(() => window.__sql.find((x) => x.op === 'insert'));
  is('se guarda en su tabla, no como alimento', alta && alta.t, 'athlete_supplements');
  is('con lo que se escribió', alta && [alta.row.name, alta.row.dose, alta.row.timing],
    ['Zinc', '15 mg', 'dinner']);

  console.log('\nLA DOSIS ES TEXTO LIBRE, QUE ES COMO VIENEN');
  // mg, UI, cápsulas, gramos, cucharadas: un número con unidad fija dejaría
  // afuera la mitad.
  is('conviven mg, UI, cápsulas y gramos',
    new Set(filas.map((f) => f.dosis.replace(/[\d.,\s]/g, ''))).size >= 3, true);

  console.log('\nY EL ATLETA LA VE EN SU SEMANA');
  await page.goto(`http://localhost:${PORT}/athlete/Week.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const suyo = await page.evaluate(() => {
    const c = document.getElementById('sup-card');
    if (!c || c.hidden) return { visible: false };
    return {
      visible: true,
      filas: [...c.querySelectorAll('.sp-row')].map((r) => r.querySelector('.sp-what b').textContent.trim()),
      // El atleta no indica su suplementación: solo la lee.
      botones: c.querySelectorAll('button').length,
    };
  });
  is('la ve', suyo.visible, true);
  is('en el mismo orden', suyo.filas, ['Creatina', 'Omega 3', 'Magnesio', 'Vitamina D']);
  is('y no la puede tocar', suyo.botones, 0);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
