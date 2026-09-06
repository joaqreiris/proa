// La anamnesis es la puerta de entrada del atleta, no una tarea pendiente.
//
// Sin ella el entrenador no tiene con qué armar el plan: no sabe qué lesiones
// tuvo, cuánto duerme ni a qué hora está libre. Así que mientras no esté
// completa, cualquier pantalla del atleta lleva ahí.
//
// Lo que se prueba, además de que funcione:
//   · Que la propia anamnesis NO se redirija a sí misma. Es el error obvio y
//     deja al atleta con la pantalla parpadeando para siempre.
//   · Que al completarla se pueda salir sin recargar nada.
//   · Que un error de red no encierre a nadie.
//
//   node tests/intake-gate.dom.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from './playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8923;

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });

// El doble: `window.__intake` decide si la anamnesis está completa, y
// `window.__falla` simula que la consulta se cae.
const FALSO = `
  // En localStorage y no en una variable: cada navegación vuelve a cargar este
  // script y una variable suelta se reiniciaría en cada página.
  const est = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  window.__intake = est('t_intake') || null;   // null = sin completar
  window.__falla = est('t_falla') === '1';
  const tabla = (t) => {
    const filas = t === 'athletes' ? [{ id: 'a-1', first_name: 'Ana', last_name: 'Díaz', workspaces: { name: 'Club', accent: 'orange' } }]
                : t === 'athlete_intake' ? [{ athlete_id: 'a-1', completed_at: window.__intake }]
                : [];
    const propios = {
      maybeSingle: () => Promise.resolve(
        window.__falla && t === 'athlete_intake'
          ? { data: null, error: { message: 'se cayó la red' } }
          : { data: filas[0] || null, error: null }),
      single: () => Promise.resolve({ data: filas[0] || null, error: null }),
      upsert: (row) => {
        window.__intake = row.completed_at || new Date().toISOString();
        try { localStorage.setItem('t_intake', window.__intake); } catch (e) {}
        return Promise.resolve({ data: null, error: null });
      },
      then: (res) => Promise.resolve({ data: filas, error: null }).then(res),
    };
    return new Proxy(propios, { get(o, k) { return (k in o) ? o[k] : (typeof k === 'symbol' ? undefined : () => q); } });
  };
  let q;
  window.sb = { from: (t) => (q = tabla(t)), rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } } }),
            getSession: () => Promise.resolve({ data: { session: { user: { id: 'u-1' } } } }) } };
  window.requireAuth = () => Promise.resolve(true);
  window.getProfile = () => Promise.resolve({ id: 'u-1', role: 'athlete', full_name: 'Ana Díaz' });
  window.clearStaleSession = () => Promise.resolve();
  window.applyWorkspaceTheme = () => {};
  window.prToast = (m) => { (window.__toasts = window.__toasts || []).push(m); };
  window.prEsc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  window.prInitials = (n) => String(n||'').trim().slice(0,2).toUpperCase();
  window.prYMD = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  window.prToday = () => '2026-03-02';
  window.prFetchAll = async (f) => { const r = await f(0, 1000); return r.data || []; };
`;

// El guard de verdad, tal como está en el módulo real.
const GUARD = (await import('node:fs')).readFileSync(join(root, 'assets', 'supabase-init.js'), 'utf8')
  .match(/window\.requireAthlete = async function[\s\S]*?\n  };\n\n[\s\S]*?window\.intakeDone = async function[\s\S]*?\n  };/)[0];

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
await (async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/athlete/Week.html`, { method: 'HEAD' }); if (r.ok) return; } catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  console.error('el servidor no levantó'); server.kill(); process.exit(1);
})();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, locale: 'es-ES' });
  await page.addInitScript(() => { try { localStorage.setItem('pr_lang', 'es'); } catch (e) {} });
  await page.route('**/assets/supabase-init.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FALSO + '\n' + '(function(){' + GUARD + '})();' }));
  await page.route('**/assets/vendor/supabase-js-*.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: '' }));

  const irA = async (pagina) => {
    await page.goto(`http://localhost:${PORT}/athlete/${pagina}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    return page.url().split('/').pop().split('?')[0];
  };

  console.log('\nSIN LA FICHA COMPLETA, TODO LLEVA A LA FICHA');
  is('la semana redirige a la anamnesis', await irA('Week.html'), 'Intake.html');
  is('la sesión también', await irA('Session.html'), 'Intake.html');

  console.log('\nY LA ANAMNESIS NO SE REDIRIGE A SÍ MISMA');
  // Es el error obvio de este tipo de guard: la pantalla queda parpadeando.
  is('la anamnesis se abre y se queda', await irA('Intake.html'), 'Intake.html');

  console.log('\nDESDE LA FICHA SE PUEDE SALIR');
  // Sin esto el atleta queda encerrado: mientras la ficha no esté completa
  // esta es la única pantalla a la que puede llegar.
  await page.goto(`http://localhost:${PORT}/athlete/Intake.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  is('hay botón de salir', await page.isVisible('#logout'), true);
  is('y el de volver a la semana está oculto, porque rebotaría',
    await page.evaluate(() => document.getElementById('ai-back').hidden), true);

  console.log('\nCON LA FICHA COMPLETA, SE PASA');
  await page.evaluate(() => {
    try { localStorage.setItem('t_intake', '2026-03-01T10:00:00Z'); sessionStorage.clear(); } catch (e) {}
  });
  is('la semana ya no redirige', await irA('Week.html'), 'Week.html');

  console.log('\nSI LA CONSULTA SE CAE, NO SE ENCIERRA A NADIE');
  await page.evaluate(() => {
    try { localStorage.removeItem('t_intake'); localStorage.setItem('t_falla', '1'); sessionStorage.clear(); } catch (e) {}
  });
  const conFalla = await irA('Week.html');
  is('con la red caída se deja pasar', conFalla, 'Week.html');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
