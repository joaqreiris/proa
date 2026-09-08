// Elegir un ejercicio: se reconoce por cómo se ve, no por cómo se llama.
//
// Entre veinte variantes de sentadilla, el nombre no alcanza. La miniatura
// sale del propio YouTube —no hay nada que subir ni que guardar— y el video se
// mira sin salir del buscador: irse a otra pestaña era perder el modal y
// volver a empezar.
//
// Y un ejercicio que no está se crea acá, quedando en la biblioteca. Antes era
// un prompt() que guardaba el nombre suelto en esa sesión: al día siguiente
// había que volver a escribirlo, sin video ni etiquetas.
//
//   node tests/exercise-picker.dom.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8961;

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

const CATALOGO = [
  { id: 'x-1', name: 'Back Squat', name_es: 'Sentadilla trasera', name_pt: null, category: 'strength',
    muscle_group: 'Tren inferior', equipment: 'Barra', complexity: 'medium',
    video_url: 'https://www.youtube.com/watch?v=ABCDEFGHIJK' },
  { id: 'x-2', name: 'Bulgarian Split Squat', name_es: 'Sentadilla búlgara', name_pt: null, category: 'strength',
    muscle_group: 'Tren inferior', equipment: 'Mancuernas', complexity: 'high', video_url: null },
  { id: 'x-3', name: 'Plank', name_es: 'Plancha', name_pt: null, category: 'core',
    muscle_group: 'Core', equipment: null, complexity: 'low',
    video_url: 'https://youtu.be/ZYXWVUTSRQP' },
  // El video que alguien borró de YouTube: la miniatura ya no existe.
  { id: 'x-4', name: 'Nordic curl', name_es: 'Curl nórdico', name_pt: null, category: 'strength',
    muscle_group: 'Isquiosurales', equipment: null, complexity: 'high',
    video_url: 'https://youtu.be/BORRADO1234' },
];

const FALSO = `
  window.__sql = [];
  const EV = { id:'e-1', date:'2026-09-07', start_time:'15:00:00', end_time:'16:00:00', type:'gym',
               title:'Gym', location:null, notes:null, athlete_id:'a-1',
               athletes:{ first_name:'Ignacio', last_name:'Amarilla' } };
  window.__blocks = ${JSON.stringify(BLOQUES)};
  window.__catalogo = ${JSON.stringify(CATALOGO)};
  // Para poder probar otra composición del bloque después de recargar: el
  // falso se vuelve a ejecutar en cada carga y pisaría lo que se haya tocado.
  try { const otro = JSON.parse(localStorage.getItem('__otrosItems') || 'null');
        if (otro) window.__blocks[0].session_items = otro; } catch (e) {}
  const tabla = (t) => {
    const filas = t === 'session_blocks' ? window.__blocks
                : t === 'events' ? [EV]
                : t === 'exercises' ? window.__catalogo
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
      // insert(...).select() se espera directamente o sigue con .single():
      // devolver una promesa a secas rompía la segunda forma.
      select() {
        if (!escribe) return q;
        const u = window.__sql[window.__sql.length-1] || {};
        const creada = Object.assign({ id:'x-nuevo' }, u.row);
        const lista = u.ids ? u.ids.map((v,k)=>({ id:'x'+k })) : [creada];
        return {
          single: () => Promise.resolve({ data: creada, error: null }),
          maybeSingle: () => Promise.resolve({ data: creada, error: null }),
          then: (res) => Promise.resolve({ data: lista, error: null }).then(res),
        };
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
  // Las miniaturas se piden a YouTube: acá no se sale a internet, así que se
  // responde con un píxel y se comprueba a QUÉ url apuntaban. El video que no
  // existe se corta a propósito, para ver el rescate.
  const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://img.youtube.com/**', (r) =>
    r.request().url().includes('BORRADO')
      ? r.abort()
      : r.fulfill({ contentType: 'image/png', body: PIXEL }));

  await page.goto(`http://localhost:${PORT}/Session.html?event=e-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.se-item', { timeout: 15000 });
  await page.click('[data-act="add-item"]');
  await page.waitForSelector('.px-row', { timeout: 10000 });

  console.log('\nSE RECONOCE POR CÓMO SE VE');
  const filas = await page.evaluate(() =>
    [...document.querySelectorAll('.px-row')].map((r) => ({
      nombre: r.querySelector('.px-name').childNodes[0].textContent.trim(),
      meta: (r.querySelector('.px-name em') || {}).textContent,
      tag: r.querySelector('.px-tag').textContent.trim(),
      miniatura: (r.querySelector('.px-thumb img') || {}).getAttribute
        ? r.querySelector('.px-thumb img').getAttribute('src') : null,
      icono: !!r.querySelector('.px-thumb .ti'),
      play: !!r.querySelector('[data-play]'),
    })));
  is('están los cuatro del catálogo', filas.length, 4);
  is('el nombre va en el idioma de la pantalla',
    filas.map((f) => f.nombre),
    ['Sentadilla trasera', 'Sentadilla búlgara', 'Plancha', 'Curl nórdico']);
  is('la miniatura sale del video, sin subir nada',
    filas[0].miniatura, 'https://img.youtube.com/vi/ABCDEFGHIJK/mqdefault.jpg');
  // El enlace corto es el que se pega desde el teléfono: si no se reconociera,
  // media biblioteca quedaría sin miniatura.
  is('y también con el enlace corto',
    filas[2].miniatura, 'https://img.youtube.com/vi/ZYXWVUTSRQP/mqdefault.jpg');
  is('el que no tiene video muestra el icono de su categoría',
    [filas[1].miniatura, filas[1].icono, filas[1].play], [null, true, false]);
  is('el músculo y el material se leen debajo del nombre',
    filas[0].meta.trim(), 'Tren inferior · Barra');
  is('y la categoría con su complejidad, al costado', filas[1].tag, 'Fuerza · Alta');
  is('el pie dice cuántos hay',
    await page.evaluate(() => document.getElementById('px-count').textContent.trim()), '4 ejercicios');

  console.log('\nUN VIDEO BORRADO NO DEJA LA IMAGEN ROTA');
  // YouTube devuelve una imagen que no carga y quedaba el icono roto del
  // navegador, que es peor que no tener miniatura.
  await page.waitForTimeout(600);
  const rescate = await page.evaluate(() => {
    const hueco = [...document.querySelectorAll('.px-thumb')].pop();
    return { img: hueco.querySelectorAll('img').length, icono: !!hueco.querySelector('.ti') };
  });
  is('la imagen que no carga se retira', rescate.img, 0);
  is('y queda el icono de su familia', rescate.icono, true);

  console.log('\nEL VIDEO SE MIRA SIN PERDER EL BUSCADOR');
  await page.click('[data-play="x-1"]');
  await page.waitForTimeout(400);
  const video = await page.evaluate(() => ({
    abierto: !document.getElementById('m-vid').hidden,
    buscadorSigue: !document.getElementById('m-pick').hidden,
    src: (document.querySelector('#vid-body iframe') || {}).src,
    titulo: document.getElementById('m-vid-title').textContent.trim(),
    // Elegir el video no puede meter el ejercicio en la sesión sin querer.
    metio: window.__sql.some((x) => x.t === 'session_items' && x.op === 'insert'),
  }));
  is('se abre acá adentro', video.abierto, true);
  is('sin dominio que rastree', video.src.startsWith('https://www.youtube-nocookie.com/embed/ABCDEFGHIJK'), true);
  is('con el nombre del ejercicio', video.titulo, 'Sentadilla trasera');
  is('el buscador queda debajo, no se cierra', video.buscadorSigue, true);
  is('y mirar no es elegir', video.metio, false);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const trasCerrar = await page.evaluate(() => ({
    video: document.getElementById('m-vid').hidden,
    buscador: !document.getElementById('m-pick').hidden,
    // Si el iframe se queda, el video sigue sonando detrás.
    iframe: document.querySelectorAll('#vid-body iframe').length,
  }));
  is('al cerrarlo vuelve el buscador', [trasCerrar.video, trasCerrar.buscador], [true, true]);
  is('y el video deja de sonar', trasCerrar.iframe, 0);

  console.log('\nLOS FILTROS SALEN DE LA BIBLIOTECA, NO DE UNA LISTA FIJA');
  const facetas = await page.evaluate(() =>
    [...document.querySelectorAll('#px-facets select')].map((s) => ({
      cual: s.dataset.f,
      opciones: [...s.options].map((o) => o.textContent.trim()),
    })));
  is('hay músculo y material', facetas.map((f) => f.cual), ['muscle', 'equip']);
  is('con lo que hay cargado y nada más',
    facetas[1].opciones, ['Todo el material', 'Barra', 'Mancuernas']);
  is('y el músculo también sale de ahí',
    facetas[0].opciones, ['Todos los músculos', 'Core', 'Isquiosurales', 'Tren inferior']);

  await page.selectOption('#px-facets [data-f="equip"]', 'Barra');
  await page.waitForTimeout(300);
  is('filtrar deja lo que corresponde',
    await page.evaluate(() => [...document.querySelectorAll('.px-name')].map((n) => n.childNodes[0].textContent.trim())),
    ['Sentadilla trasera']);

  // Una opción que ya no existe dentro de la categoría dejaría la lista vacía
  // sin motivo visible.
  await page.click('#px-cats [data-cat="core"]');
  await page.waitForTimeout(300);
  const trasCat = await page.evaluate(() => ({
    filas: document.querySelectorAll('.px-row').length,
    material: document.querySelector('#px-facets [data-f="equip"]'),
  }));
  is('cambiar de categoría suelta los filtros de antes', trasCat.filas, 1);

  console.log('\nUN EJERCICIO QUE NO ESTÁ SE CREA ACÁ');
  await page.fill('#px-q', 'Nordic hamstring');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#px-new');
  await page.waitForTimeout(400);
  is('el nombre viene de lo que se estaba buscando',
    await page.inputValue('#nx-name'), 'Nordic hamstring');
  await page.fill('#nx-muscle', 'Isquiosurales');
  await page.fill('#nx-video', 'https://www.youtube.com/watch?v=NORDICHAM01');
  await page.click('#f-newex button[type="submit"]');
  await page.waitForTimeout(600);

  const alta = await page.evaluate(() => ({
    biblioteca: window.__sql.find((x) => x.t === 'exercises' && x.op === 'insert'),
    enSesion: window.__sql.find((x) => x.t === 'session_items' && x.op === 'insert'),
    cerro: document.getElementById('m-pick').hidden && document.getElementById('m-newex').hidden,
  }));
  is('queda en la biblioteca del espacio', alta.biblioteca && alta.biblioteca.row.workspace_id, 'w-1');
  is('con lo que se escribió',
    alta.biblioteca && [alta.biblioteca.row.name, alta.biblioteca.row.muscle_group],
    ['Nordic hamstring', 'Isquiosurales']);
  // Crearlo para después tener que buscarlo sería la mitad del trabajo.
  is('y entra a la sesión de una vez', alta.enSesion && alta.enSesion.row.name, 'Nordic hamstring');
  is('quedando colgado del ejercicio, no suelto',
    alta.enSesion && alta.enSesion.row.exercise_id, 'x-nuevo');
  is('y los modales se cierran', alta.cerro, true);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
