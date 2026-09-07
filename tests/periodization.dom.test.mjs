// La temporada: etapas de trabajo y la carga real debajo.
//
// Lo que se juega acá es que el gráfico no mienta. Dos cosas puntuales:
//
//   · una semana sin partes cargados NO vale cero. Cero significa que el
//     atleta no entrenó, y son dos historias distintas; si se dibujan igual,
//     el entrenador cree que hubo un parate donde solo hubo desprolijidad.
//   · las etapas de arriba y las barras de abajo comparten escala. Si una
//     semana ocupa distinto ancho en cada fila, el pico cae sobre la etapa
//     equivocada y la lectura entera se va al demonio.
//
//   node tests/periodization.dom.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8957;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });
const cerca = (m, got, want, tol) =>
  Math.abs(got - want) <= tol ? ok(m) : no(m, { got, want, tol });

// 16 semanas, cuatro etapas de cuatro. Todas empiezan lunes: así una etapa
// entra justa en sus semanas y el test mide la escala, no el redondeo.
const PLAN = {
  id: 'p-1', athlete_id: 'a-1', name: 'Temporada 2026', model: 'atr',
  start_date: '2026-09-07', end_date: '2026-12-27', goal: 'Llegar entero', notes: null,
};
const BLOQUES = [
  { id: 'b-1', plan_id: 'p-1', name: 'Acumulación',   kind: 'accumulation',   phase: 'preseason', start_date: '2026-09-07', end_date: '2026-10-04', focus: 'Base', target_load: 4000, notes: null },
  { id: 'b-2', plan_id: 'p-1', name: 'Transformación', kind: 'transformation', phase: 'preseason', start_date: '2026-10-05', end_date: '2026-11-01', focus: null, target_load: null, notes: null },
  { id: 'b-3', plan_id: 'p-1', name: 'Realización',    kind: 'realization',    phase: 'inseason',  start_date: '2026-11-02', end_date: '2026-11-29', focus: null, target_load: null, notes: null },
  { id: 'b-4', plan_id: 'p-1', name: 'Transición',     kind: 'transition',     phase: 'offseason', start_date: '2026-11-30', end_date: '2026-12-27', focus: null, target_load: null, notes: null },
];
// Semana 1: tres sesiones reportadas, 1200 UA en total.
// Semana 2: dos sesiones SIN parte cargado -> sin dato, que no es cero.
// Semana 3: una sesión reportada con esfuerzo cero -> cero de verdad.
// Semana 4: nada agendado.
const EVENTOS = [
  { id: 'e-1', date: '2026-09-07', start_time: '18:00:00', type: 'gym',   status: 'done',    au: 300, title: 'Fuerza' },
  { id: 'e-2', date: '2026-09-09', start_time: '18:00:00', type: 'gym',   status: 'done',    au: 400, title: 'Fuerza' },
  { id: 'e-3', date: '2026-09-11', start_time: '10:00:00', type: 'field', status: 'done',    au: 500, title: 'Campo' },
  { id: 'e-4', date: '2026-09-14', start_time: '18:00:00', type: 'gym',   status: 'planned', au: null, title: 'Fuerza' },
  { id: 'e-5', date: '2026-09-16', start_time: '18:00:00', type: 'gym',   status: 'planned', au: null, title: null },
  { id: 'e-6', date: '2026-09-21', start_time: '09:00:00', type: 'gym',   status: 'planned', au: 0,   title: 'Movilidad' },
];
// Lo que hay dentro de cada sesión. e-2 está en el calendario pero vacía por
// dentro: es el caso que hay que poder ver sin abrirla una por una.
const BLOQUES_SESION = [
  { event_id: 'e-1', session_items: [{ name: 'Sentadilla' }, { name: 'Press banca' }] },
  { event_id: 'e-1', session_items: [{ name: 'Remo' }, { name: 'Plancha' }] },
  { event_id: 'e-3', session_items: [{ name: 'Carrera continua' }] },
];

// El caso de la captura: una temporada de año y medio con una sola etapa corta.
const PLAN_LARGO = { ...PLAN, end_date: '2027-12-26' };
const BLOQUE_UNICO = BLOQUES[0];

const FALSO = `
  window.__sql = [];
  const A = { id:'a-1', workspace_id:'w-1', first_name:'Ignacio', last_name:'Amarilla', sex:'m',
              birth_date:'2002-04-11', timezone:'America/Montevideo', status:'active',
              athlete_accounts:[{user_id:'u-2'}],
              athlete_intake:[{ athlete_id:'a-1', height_cm:180, weight_kg:78, completed_at:'2026-09-01' }],
              workspaces:{ name:'Espacio', accent:'orange' } };
  window.__plan = ${JSON.stringify([PLAN])};
  window.__blocks = ${JSON.stringify(BLOQUES)};
  // Para poder probar otra temporada sin levantar otro servidor.
  try { const otro = JSON.parse(localStorage.getItem('__otroPlan') || 'null');
        if (otro) { window.__plan = [otro.plan]; window.__blocks = otro.blocks; } } catch (e) {}
  window.__events = ${JSON.stringify(EVENTOS)};
  window.__sesion = ${JSON.stringify(BLOQUES_SESION)};
  const tabla = (t) => {
    const filas = t === 'athletes' ? [A]
                : t === 'training_plans' ? window.__plan
                : t === 'training_blocks' ? window.__blocks
                : t === 'events' ? window.__events
                : t === 'session_blocks' ? window.__sesion
                : [];
    let escribe = false;
    const propios = {
      insert(row) { escribe = true; window.__sql.push({ op:'insert', t, row }); return q; },
      update(row) { escribe = true; window.__sql.push({ op:'update', t, row }); return q; },
      delete() { escribe = true; window.__sql.push({ op:'delete', t }); return q; },
      // insert(...).select() tiene que devolver una fila: el código comprueba
      // que haya vuelto algo para no dar por guardado lo que la RLS filtró.
      // En una lectura, en cambio, select() sigue la cadena.
      select() { return escribe ? Promise.resolve({ data:[{id:'nuevo'}], error:null }) : q; },
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
  await page.addInitScript(() => { try { localStorage.setItem('pr_lang', 'es'); } catch (e) {} });
  page.on('pageerror', (e) => console.log('  [error de la pagina] ' + e.message));
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.goto(`http://localhost:${PORT}/Athlete.html?id=a-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-tab="plan"]', { timeout: 15000 });
  await page.click('[data-tab="plan"]');
  await page.waitForSelector('.pe-blk', { timeout: 10000 });

  console.log('\nEL AÑO SE LEE DE UN VISTAZO');
  const etapas = await page.evaluate(() =>
    [...document.querySelectorAll('.pe-blk')].map((b) => ({
      nombre: b.querySelector('span').textContent.trim(),
      semanas: b.querySelector('small').textContent.trim(),
      izq: Math.round(parseFloat(b.style.left)),
      ancho: Math.round(parseFloat(b.style.width)),
    })));
  is('están las cuatro etapas, en orden', etapas.map((e) => e.nombre),
    ['Acumulación', 'Transformación', 'Realización', 'Transición']);
  is('cada una dice cuánto dura', etapas.map((e) => e.semanas),
    ['4 sem', '4 sem', '4 sem', '4 sem']);
  is('cuatro etapas iguales ocupan lo mismo',
    etapas.map((e) => e.ancho), [25, 25, 25, 25]);
  is('y van una tras otra sin huecos', etapas.map((e) => e.izq), [0, 25, 50, 75]);

  console.log('\nARRIBA Y ABAJO COMPARTEN ESCALA');
  // Si no coincidieran, el pico de carga caería sobre la etapa equivocada.
  const escala = await page.evaluate(() => {
    const pista = document.querySelector('.pe-track').getBoundingClientRect();
    const barras = [...document.querySelectorAll('.pe-load i')].map((i) => i.getBoundingClientRect());
    const primera = document.querySelector('.pe-blk').getBoundingClientRect();
    return {
      semanas: barras.length,
      // La primera etapa son 4 semanas: su borde derecho tiene que caer donde
      // termina la cuarta barra de carga.
      finEtapa: primera.right - pista.left,
      finCuartaSemana: barras[3].right - pista.left,
    };
  });
  is('hay una barra de carga por semana del plan', escala.semanas, 16);
  cerca('la etapa termina donde termina su última semana',
    escala.finEtapa, escala.finCuartaSemana, 4);

  console.log('\nSIN DATO NO ES CERO');
  const cargas = await page.evaluate(() =>
    [...document.querySelectorAll('.pe-load i')].slice(0, 4).map((i) => ({
      titulo: i.getAttribute('title'),
      opacidad: i.style.opacity || '',
      alto: i.style.height,
    })));
  is('la semana reportada muestra su carga', cargas[0].titulo, 'Semana 1 · 7 sept · 1200 UA');
  is('la de sesiones sin parte lo dice', cargas[1].titulo, 'Semana 2 · 14 sept · sin partes cargados');
  is('y se dibuja apagada', cargas[1].opacidad !== '', true);
  is('en cambio un esfuerzo cero es cero', cargas[2].titulo, 'Semana 3 · 21 sept · 0 UA');
  is('y no se apaga: es un dato', cargas[2].opacidad, '');
  is('la semana sin nada agendado también es sin dato', cargas[3].titulo,
    'Semana 4 · 28 sept · sin partes cargados');

  console.log('\nLA LÍNEA DE TIEMPO DICE MESES, NO NÚMEROS DE SEMANA');
  const tiempo = await page.evaluate(() => {
    const meses = [...document.querySelectorAll('.pe-months span')].map((m) => ({
      texto: m.textContent.replace(/\s+/g, ' ').trim(),
      izq: Math.round(parseFloat(m.style.left)),
    }));
    const ejes = [...document.querySelectorAll('.pe-axis span')].map((s) => s.textContent.trim());
    return { meses, ejes, divisiones: document.querySelectorAll('.pe-grid i').length };
  });
  // Del 7 de septiembre al 27 de diciembre: cuatro meses.
  is('están los meses del plan', tiempo.meses.map((m) => m.texto),
    ['sept 2026', 'oct', 'nov', 'dic']);
  is('el año se escribe una sola vez',
    tiempo.meses.filter((m) => m.texto.includes('2026')).length, 1);
  is('y hay una división entre mes y mes', tiempo.divisiones, 3);
  is('el eje da fechas de verdad, no «Semana 1»',
    [tiempo.ejes[0], tiempo.ejes[2]], ['7 sept 2026', '27 dic 2026']);

  console.log('\nY MARCA DÓNDE ESTÁ PARADO EL ATLETA');
  // Es la primera pregunta al abrir un plan: en qué semana estamos.
  const ahora = await page.evaluate(() => {
    const n = document.querySelector('.pe-now');
    return n ? { pos: parseFloat(n.style.left), rotulo: n.textContent.trim() } : null;
  });
  // Hoy es el 7 de septiembre, el primer día del plan: arranca en cero.
  is('la marca está', !!ahora, true);
  is('al principio de la primera semana', ahora && Math.round(ahora.pos), 0);
  is('y dice qué es', ahora && ahora.rotulo, 'hoy');

  console.log('\nUNA ETAPA ANGOSTA NO MUESTRA EL NOMBRE CORTADO');
  // «A…» no dice nada. Se deja la duración, y el nombre entero va en la lista.
  const angostas = await page.evaluate(() => {
    const etapas = [...document.querySelectorAll('.pe-blk')];
    return {
      anchas: etapas.filter((e) => !e.classList.contains('is-tight')).length,
      // Con cuatro etapas en 16 semanas hay lugar de sobra para los nombres.
      nombreVisible: getComputedStyle(etapas[0].querySelector('span')).display !== 'none',
      lista: [...document.querySelectorAll('.pe-stage')].map((s) => ({
        nombre: s.querySelector('b').textContent.trim(),
        fechas: s.querySelector('time').childNodes[0].textContent.replace(/\s+/g, ' ').trim(),
      })),
    };
  });
  is('acá entran todos', angostas.anchas, 4);
  is('y el nombre se ve', angostas.nombreVisible, true);
  is('la lista repite las etapas con sus fechas',
    angostas.lista.map((s) => s.nombre + ': ' + s.fechas),
    ['Acumulación: 7 sept – 4 oct', 'Transformación: 5 oct – 1 nov',
     'Realización: 2 nov – 29 nov', 'Transición: 30 nov – 27 dic']);

  console.log('\nLO PREVISTO CONTRA LO QUE PASÓ');
  const detalle = await page.evaluate(() => {
    const d = document.querySelector('.pe-detail');
    return [...d.querySelectorAll('div')].slice(0, 4).map((c) => ({
      que: (c.querySelector('dt') || {}).textContent,
      valor: (c.querySelector('dd') || {}).textContent,
      pie: (c.querySelector('small') || {}).textContent,
    }));
  });
  // 1200 + 0 = 1200 reportadas contra 4000 previstas: 70% por debajo.
  is('la carga real sale de los partes', detalle[2].valor.replace(/\s+/g, ' ').trim(), '1200 / 4000');
  is('y el desvío contra lo previsto', detalle[2].pie, '-70% de lo previsto');

  console.log('\nSE BAJA A LA ETAPA Y SE VUELVE');
  await page.click('.pe-blk');
  await page.waitForSelector('.pe-wk', { timeout: 5000 });
  const semanas = await page.evaluate(() =>
    [...document.querySelectorAll('.pe-wk')].map((w) => ({
      n: w.querySelector('.pe-wk-n').childNodes[0].textContent.trim(),
      sesiones: w.querySelector('.pe-wk-s').textContent.trim(),
      carga: w.querySelector('.pe-wk-l').textContent.trim(),
    })));
  is('están las cuatro semanas de la etapa', semanas.length, 4);
  is('con sus sesiones', semanas.map((s) => s.sesiones),
    ['3 sesiones', '2 sesiones', '1 sesión', '0 sesiones']);
  is('y la carga o su ausencia', semanas.map((s) => s.carga),
    ['1200 UA', 'sin partes cargados', '0 UA', 'sin partes cargados']);
  console.log('\nDESDE LA ETAPA SE VE QUÉ HAY EN CADA SESIÓN');
  // «3 sesiones» no dice nada: lo que se quiere saber es de qué son y si ya
  // están armadas, sin abrirlas una por una.
  await page.click('.pe-wk-row[data-week="2026-09-07"]');
  await page.waitForSelector('.pe-ses', { timeout: 5000 });
  await page.waitForTimeout(400);
  const sesiones = await page.evaluate(() =>
    [...document.querySelectorAll('.pe-ses')].map((a) => ({
      dia: a.querySelector('.pe-ses-day b').textContent.trim(),
      que: a.querySelector('.pe-ses-what b').textContent.trim(),
      dentro: a.querySelector('.pe-ses-what em').textContent.trim(),
      alerta: !!a.querySelector('.pe-ses-what em.is-warn'),
      hora: a.querySelector('.pe-ses-when').textContent.trim(),
      carga: a.querySelector('.pe-ses-load').textContent.trim(),
      donde: a.getAttribute('href'),
    })));
  is('están las tres de esa semana', sesiones.length, 3);
  is('con su día', sesiones.map((s) => s.dia), ['Lun', 'Mié', 'Vie']);
  is('y su hora', sesiones.map((s) => s.hora), ['18:00', '18:00', '10:00']);
  is('se ve qué tiene adentro sin abrirla',
    sesiones[0].dentro, 'Sentadilla · Press banca · Remo · +1');
  // Una sesión en el calendario y vacía por dentro es lo único de esta lista
  // que pide hacer algo, así que se marca.
  is('la que está vacía lo dice', sesiones[1].dentro, 'sin ejercicios cargados');
  is('y lo dice avisando', sesiones[1].alerta, true);
  is('la carga reportada se ve acá', sesiones[0].carga, '300 UA');
  is('y se entra a la sesión de un clic', sesiones[0].donde, 'Session.html?event=e-1');

  console.log('\nY SE SALTA AL TABLERO EN ESA SEMANA');
  // Buscarla a flechazos desde la de hoy era lo que dejaba las dos pestañas
  // sin hablarse.
  // El tablero de verdad se carga después del falso y lo pisa, así que se
  // espía el goTo real: es el que va a correr en producción.
  is('el tablero sabe ir a una semana concreta',
    await page.evaluate(() => typeof window.prWeekBoard.goTo), 'function');
  await page.evaluate(() => {
    window.prWeekBoard.goTo = (d) => { window.__goto = d; return Promise.resolve(); };
  });
  await page.click('.pe-seeweek');
  await page.waitForTimeout(400);
  const salto = await page.evaluate(() => ({
    semana: window.__goto,
    enLaSemana: !document.getElementById('pane-week').hidden,
  }));
  is('el tablero va al lunes de esa semana', salto.semana, '2026-09-07');
  is('y se ve la pestaña de la semana', salto.enLaSemana, true);

  await page.click('[data-tab="plan"]');
  await page.waitForTimeout(400);
  const sigueAbierta = await page.evaluate(() => document.querySelectorAll('.pe-ses').length);
  is('al volver, la semana sigue desplegada', sigueAbierta, 3);
  await page.click('.pe-wk-row[data-week="2026-09-07"]');
  await page.waitForTimeout(300);
  is('y se puede cerrar',
    await page.evaluate(() => document.querySelectorAll('.pe-ses').length), 0);

  console.log('\nUNA SEMANA VACÍA NO SE PUEDE DESPLEGAR');
  // No hay nada que mostrar: un desplegable vacío es una promesa incumplida.
  is('la fila no responde',
    await page.evaluate(() => document.querySelector('.pe-wk-row[data-week="2026-09-28"]').disabled),
    true);

  await page.click('#pe-zoom [data-z="year"]');
  await page.waitForSelector('.pe-blk', { timeout: 5000 });
  ok('se vuelve a la temporada');

  console.log('\nUNA ETAPA NUEVA EMPIEZA DONDE TERMINÓ LA ANTERIOR');
  await page.evaluate(() => { window.__sql = []; });
  await page.click('#pe-newblock');
  await page.waitForTimeout(300);
  const propuesta = await page.evaluate(() => ({
    desde: document.getElementById('bk-from').value,
    hasta: document.getElementById('bk-to').value,
  }));
  is('arranca el día después de la última', propuesta.desde, '2026-12-28');
  is('y dura cuatro semanas', propuesta.hasta, '2027-01-24');

  console.log('\nUNA ETAPA FUERA DEL PLAN NO SE GUARDA');
  // Se dibujaría en ningún lado: mejor decirlo que guardarla invisible.
  await page.fill('#bk-name', 'Se pasa');
  await page.click('#f-blk button[type="submit"]');
  await page.waitForTimeout(300);
  const rechazo = await page.evaluate(() => ({
    msg: document.getElementById('bk-msg').hidden ? null : document.getElementById('bk-msg').textContent,
    guardo: window.__sql.some((x) => x.op === 'insert'),
    abierto: !document.getElementById('m-blk').hidden,
  }));
  is('lo dice', rechazo.msg, 'La etapa tiene que caer dentro del plan.');
  is('no la guarda', rechazo.guardo, false);
  is('y deja el modal abierto para corregir', rechazo.abierto, true);

  console.log('\nY DENTRO DEL PLAN, SÍ');
  await page.fill('#bk-from', '2026-12-14');
  await page.fill('#bk-to', '2026-12-27');
  await page.selectOption('#bk-kind', 'transition');
  await page.click('#f-blk button[type="submit"]');
  await page.waitForTimeout(400);
  const alta = await page.evaluate(() => window.__sql.find((x) => x.op === 'insert'));
  is('va a training_blocks', alta && alta.t, 'training_blocks');
  is('colgada del plan', alta && alta.row.plan_id, 'p-1');
  // El momento quedó sin elegir y se guarda nulo, no como cadena vacía: la
  // columna no distingue «sin definir» de «vacío» si le entra un ''.
  is('con sus dos ejes', alta && [alta.row.kind, alta.row.phase], ['transition', null]);

  console.log('\nCON PLAN HECHO, EL PLAN SE PUEDE EDITAR');
  // Si el botón se escondiera, el plan quedaría sin forma de corregirse.
  const botonPlan = await page.evaluate(() => {
    const b = document.getElementById('pe-newplan');
    return { visible: !b.hidden, rotulo: b.querySelector('span').textContent.trim() };
  });
  is('el botón sigue ahí', botonPlan.visible, true);
  is('y ahora dice editar', botonPlan.rotulo, 'Editar el plan');
  await page.click('#pe-newplan');
  await page.waitForTimeout(300);
  const conDatos = await page.evaluate(() => ({
    nombre: document.getElementById('pl-name').value,
    desde: document.getElementById('pl-from').value,
    modelo: document.getElementById('pl-model').value,
    borrar: !document.getElementById('pl-del').hidden,
  }));
  is('abre con lo que ya hay', [conDatos.nombre, conDatos.desde, conDatos.modelo],
    ['Temporada 2026', '2026-09-07', 'atr']);
  is('y ofrece borrarlo', conDatos.borrar, true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  console.log('\nUNA TEMPORADA LARGA NO SE APRIETA HASTA VOLVERSE ILEGIBLE');
  // El caso que la rompía: 68 semanas y una etapa de cuatro. Comprimida en el
  // ancho de la pantalla, la etapa medía 40px y el nombre quedaba en «A…».
  await page.evaluate((datos) => localStorage.setItem('__otroPlan', JSON.stringify(datos)),
    { plan: PLAN_LARGO, blocks: [BLOQUE_UNICO] });
  await page.goto(`http://localhost:${PORT}/Athlete.html?id=a-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-tab="plan"]', { timeout: 15000 });
  await page.click('[data-tab="plan"]');
  await page.waitForSelector('.pe-blk', { timeout: 10000 });
  await page.waitForTimeout(400);

  const largo = await page.evaluate(() => {
    const caja = document.querySelector('.pe-time');
    const etapa = document.querySelector('.pe-blk');
    return {
      semanas: document.querySelectorAll('.pe-load i').length,
      // Se desplaza en horizontal en vez de aplastar 68 semanas en la pantalla.
      seDesplaza: caja.scrollWidth > caja.clientWidth + 4,
      avisaQueSigue: caja.classList.contains('is-scroll'),
      anchoEtapa: Math.round(etapa.getBoundingClientRect().width),
      // Angosta: no se muestra el nombre a medias.
      apretada: etapa.classList.contains('is-tight'),
      nombreOculto: getComputedStyle(etapa.querySelector('span')).display === 'none',
      duracion: etapa.querySelector('small').textContent.trim(),
      // El nombre entero y sus fechas quedan escritos abajo.
      enLaLista: [...document.querySelectorAll('.pe-stage')].map((x) =>
        x.querySelector('b').textContent.trim()),
      meses: document.querySelectorAll('.pe-months span').length,
    };
  });
  is('están las 68 semanas', largo.semanas, 68);
  is('la línea se desplaza en vez de aplastarse', largo.seDesplaza, true);
  is('y avisa que sigue', largo.avisaQueSigue, true);
  is('la etapa de cuatro semanas mide sus cuatro semanas', largo.anchoEtapa, 72);
  is('como no entra el nombre, no se pone cortado', [largo.apretada, largo.nombreOculto], [true, true]);
  is('queda la duración, que sí entra', largo.duracion, '4 sem');
  is('y el nombre entero está en la lista', largo.enLaLista, ['Acumulación']);
  is('los dieciséis meses están rotulados', largo.meses, 16);
  await page.evaluate(() => localStorage.removeItem('__otroPlan'));

  console.log('\nLOS MODALES CIERRAN');
  // La cruz y el «Cancelar» no estaban conectados a nada en esta pantalla.
  await page.click('#pe-newplan');
  await page.waitForTimeout(200);
  await page.click('#m-plan [data-close]');
  await page.waitForTimeout(200);
  is('la cruz cierra', await page.evaluate(() => document.getElementById('m-plan').hidden), true);
  await page.click('#pe-newplan');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  is('y la tecla de escape también',
    await page.evaluate(() => document.getElementById('m-plan').hidden), true);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
