// Editar la ficha de un atleta y borrarlo, sin base de por medio.
//
// La página se levanta de verdad —su HTML, su CSS, su JavaScript— y lo único
// que se reemplaza es Supabase: se intercepta assets/supabase-init.js y se
// responde con un doble que guarda en memoria lo que le mandan. Así se puede
// afirmar QUÉ consulta sale (un update con estos campos, un delete con este
// id) sin credenciales y sin ensuciar el proyecto de verdad.
//
//   node tests/athlete-crud.dom.test.mjs
//
// Lo que no cubre: que la base acepte esa consulta. Eso lo dicen las políticas
// y se prueba contra el proyecto real.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8913;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

// El atleta de mentira. Nombre con acento a propósito: la confirmación del
// borrado se compara sin acentos, y eso hay que probarlo.
const ATLETA = {
  id: 'a-1', workspace_id: 'w-1',
  first_name: 'Martín', last_name: 'Pérez',
  birth_date: '2001-05-14', sex: 'm', sport: 'football',
  position: 'Volante', level: 'pro', dominant_side: 'right',
  club_name: 'Nacional', email: 'martin@ejemplo.com', phone: '+59899123456',
  timezone: 'America/Montevideo', status: 'active', created_at: '2026-01-01T00:00:00Z',
  athlete_accounts: [], athlete_intake: [], athlete_invites: [],
};

const FALSO_SUPABASE = `
  window.__llamadas = [];
  const registrar = (op, tabla, extra) => window.__llamadas.push(Object.assign({ op, tabla }, extra || {}));
  const ATLETA = ${JSON.stringify(ATLETA)};
  let filas = [ATLETA];

  function consulta(tabla) {
    const q = {
      _tabla: tabla, _filtro: null,
      select() { return q; },
      eq(col, val) { q._filtro = { col, val }; return q; },
      order() { return Promise.resolve({ data: filas, error: null }); },
      insert(row) { registrar('insert', tabla, { row }); return q; },
      update(row) { registrar('update', tabla, { row }); return q; },
      delete() { registrar('delete', tabla); return q; },
      single() { return Promise.resolve({ data: { id: 'a-1' }, error: null }); },
      then(res) { return Promise.resolve({ data: filas, error: null }).then(res); },
    };
    // eq() cierra la consulta en update/delete: ahí se anota contra quién fue.
    const eqOriginal = q.eq;
    q.eq = (col, val) => {
      const ultima = window.__llamadas[window.__llamadas.length - 1];
      if (ultima && (ultima.op === 'update' || ultima.op === 'delete')) ultima[col] = val;
      return eqOriginal(col, val);
    };
    return q;
  }

  window.sb = {
    from: consulta,
    rpc: (nombre, args) => { registrar('rpc', nombre, { args }); return Promise.resolve({ data: { token: 't-1' }, error: null }); },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }) },
  };
  window.requireCoach = () => Promise.resolve(true);
  window.getWorkspace  = () => Promise.resolve({ id: 'w-1', sport: 'football', seat_limit: 10, accent: 'orange' });
  window.getWorkspaceId = () => Promise.resolve('w-1');
  window.getSeatUsage = () => Promise.resolve({ used: filas.length, limit: 10, left: 10 - filas.length });
  window.applyWorkspaceTheme = () => {};
  window.prYMD = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  window.prToday = () => window.prYMD(new Date());
  window.prToast = (m) => { (window.__toasts = window.__toasts || []).push(m); };
  window.prEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  window.prInitials = (n) => String(n || '').trim().split(/\\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
`;

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
  await page.addInitScript(() => { try { localStorage.setItem('pr_lang', 'es'); } catch (e) {} });
  page.on('pageerror', (err) => console.log('  [error de la pagina] ' + err.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [consola] ' + m.text()); });

  // El doble reemplaza al módulo real: mismo lugar en la carga, otro contenido.
  await page.route('**/assets/supabase-init.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FALSO_SUPABASE }));
  await page.route('**/assets/vendor/supabase-js-*.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '/* no hace falta */' }));

  await page.goto(`http://localhost:${PORT}/Athletes.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('tr[data-id="a-1"]');

  // ── El editor trae los datos que ya estaban ──────────────────────────────
  console.log('\nEDITAR LA FICHA');
  await page.click('tr[data-id="a-1"] [data-act="edit"]');
  await page.waitForSelector('#m-new:not([hidden])');

  const cargado = await page.evaluate(() => ({
    titulo: document.getElementById('m-new-title').textContent,
    boton: document.getElementById('new-save').textContent,
    first: document.getElementById('n-first').value,
    last: document.getElementById('n-last').value,
    birth: document.getElementById('n-birth').value,
    sex: document.getElementById('n-sex').value,
    position: document.getElementById('n-position').value,
    level: document.getElementById('n-level').value,
    side: document.getElementById('n-side').value,
    club: document.getElementById('n-club').value,
    email: document.getElementById('n-email').value,
    phone: document.getElementById('n-phone').value,
    tz: document.getElementById('n-tz').value,
  }));

  is('el modal se abre en modo edición', cargado.titulo, 'Editar ficha');
  is('el botón dice guardar, no dar de alta', cargado.boton, 'Guardar');
  is('trae el nombre', cargado.first, 'Martín');
  is('trae el apellido', cargado.last, 'Pérez');
  is('trae la fecha de nacimiento', cargado.birth, '2001-05-14');
  is('trae el sexo', cargado.sex, 'm');
  is('trae la posición', cargado.position, 'Volante');
  is('trae el nivel', cargado.level, 'pro');
  is('trae el lado dominante', cargado.side, 'right');
  is('trae el club', cargado.club, 'Nacional');
  is('trae el correo', cargado.email, 'martin@ejemplo.com');
  is('trae el teléfono', cargado.phone, '+59899123456');
  is('trae dónde vive', cargado.tz, 'America/Montevideo');

  // ── Guardar manda un update, no un alta nueva ────────────────────────────
  await page.fill('#n-position', 'Volante central');
  await page.click('#new-save');
  await page.waitForFunction(() => document.getElementById('m-new').hidden);

  const guardado = await page.evaluate(() => window.__llamadas.filter(l => l.tabla === 'athletes'));
  const upd = guardado.find(l => l.op === 'update');
  is('guardar no crea un atleta nuevo', guardado.some(l => l.op === 'insert'), false);
  is('guardar actualiza', !!upd, true);
  is('actualiza al atleta correcto', upd && upd.id, 'a-1');
  is('manda el campo cambiado', upd && upd.row.position, 'Volante central');
  is('no toca el espacio de trabajo', upd && ('workspace_id' in upd.row), false);

  // ── Borrar pide el nombre escrito ────────────────────────────────────────
  console.log('\nBORRAR PIDE EL NOMBRE');
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click('tr[data-id="a-1"] [data-act="delete"]');
  await page.waitForSelector('#m-del:not([hidden])');

  const arranque = await page.evaluate(() => ({
    deshabilitado: document.getElementById('del-go').disabled,
    lead: document.getElementById('del-lead').textContent,
    cuantos: document.querySelectorAll('#del-what li').length,
    etiqueta: document.getElementById('del-label').textContent,
  }));
  is('el botón arranca apagado', arranque.deshabilitado, true);
  is('dice a quién se borra', arranque.lead.includes('Martín Pérez'), true);
  is('enumera lo que se pierde', arranque.cuantos, 4);
  is('pide escribir el nombre', arranque.etiqueta.includes('Martín Pérez'), true);

  await page.fill('#del-name', 'Martin');
  is('con el nombre a medias sigue apagado',
    await page.evaluate(() => document.getElementById('del-go').disabled), true);

  await page.fill('#del-name', 'Otro Nombre');
  is('con un nombre que no es sigue apagado',
    await page.evaluate(() => document.getElementById('del-go').disabled), true);

  // Sin acentos y en minúscula: se acepta, porque la idea es que lea el
  // nombre, no que pelee con el teclado.
  await page.fill('#del-name', 'martin perez');
  is('sin acentos y en minúscula alcanza',
    await page.evaluate(() => document.getElementById('del-go').disabled), false);

  await page.click('#del-go');
  await page.waitForFunction(() => document.getElementById('m-del').hidden);

  const borrado = await page.evaluate(() => window.__llamadas.filter(l => l.op === 'delete'));
  is('sale un solo borrado', borrado.length, 1);
  is('borra de athletes', borrado[0] && borrado[0].tabla, 'athletes');
  is('borra al atleta correcto', borrado[0] && borrado[0].id, 'a-1');

  // ── Dar de alta sigue siendo dar de alta ─────────────────────────────────
  console.log('\nEL ALTA NO SE ROMPIÓ');
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click('#btn-new');
  await page.waitForSelector('#m-new:not([hidden])');
  const alta = await page.evaluate(() => ({
    titulo: document.getElementById('m-new-title').textContent,
    boton: document.getElementById('new-save').textContent,
    first: document.getElementById('n-first').value,
  }));
  is('el modal vuelve a modo alta', alta.titulo, 'Nuevo atleta');
  is('el botón vuelve a dar de alta', alta.boton, 'Dar de alta');
  is('el formulario quedó limpio', alta.first, '');

  await page.fill('#n-first', 'Nueva');
  await page.click('#new-save');
  await page.waitForTimeout(400);
  const creado = await page.evaluate(() => window.__llamadas.filter(l => l.tabla === 'athletes'));
  const ins = creado.find(l => l.op === 'insert');
  is('el alta inserta', !!ins, true);
  is('el alta no actualiza', creado.some(l => l.op === 'update'), false);
  is('el alta sí manda el espacio de trabajo', ins && ins.row.workspace_id, 'w-1');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
