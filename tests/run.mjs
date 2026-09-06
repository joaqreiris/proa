// Correr todas las pruebas de Proa de una.
//
//   npm test                  todas las que se puedan correr acá
//   npm test -- week          solo las que tengan «week» en el nombre
//   npm test -- --lista       decir cuáles hay y qué necesita cada una
//
// Por qué existe: son veinte pruebas y había que llamarlas a mano, una por una.
// Con veinte comandos sueltos, correrlas se vuelve opcional, y una prueba que
// no se corre no protege nada.
//
// Las que hablan con la base de verdad necesitan SUPABASE_SERVICE_KEY. Sin la
// clave NO se hacen pasar por buenas: se saltan y se dicen aparte, para que la
// diferencia entre «pasó» y «ni se intentó» quede siempre a la vista.
//
//   SUPABASE_SERVICE_KEY=... npm test

import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const args = process.argv.slice(2);
const soloLista = args.includes('--lista');
const filtro = args.find((a) => !a.startsWith('--'));

// ── Qué hay y qué necesita cada una ─────────────────────────────────────────
const NO_SON_PRUEBAS = new Set(['run.mjs', 'playwright.mjs']);

const pruebas = readdirSync(here)
  .filter((f) => (f.endsWith('.mjs') || f.endsWith('.sh')) && !NO_SON_PRUEBAS.has(f))
  .sort()
  .map((f) => {
    const src = readFileSync(join(here, f), 'utf8');
    return {
      archivo: f,
      cmd: f.endsWith('.sh') ? 'bash' : 'node',
      // Se lee del propio archivo en vez de mantener una lista acá: una lista
      // aparte se desactualiza el día que alguien agrega una prueba.
      necesitaClave: src.includes('SUPABASE_SERVICE_KEY'),
      necesitaNavegador: src.includes('chromium'),
    };
  })
  .filter((p) => !filtro || p.archivo.includes(filtro));

const hayClave = !!process.env.SUPABASE_SERVICE_KEY;

if (soloLista) {
  console.log(`\n${pruebas.length} pruebas\n`);
  for (const p of pruebas) {
    const necesita = [p.necesitaClave && 'clave de la base', p.necesitaNavegador && 'navegador']
      .filter(Boolean).join(' + ') || 'nada';
    console.log(`  ${p.archivo.padEnd(30)} ${necesita}`);
  }
  console.log('');
  process.exit(0);
}

// ── Correr ──────────────────────────────────────────────────────────────────
// En serie y no en paralelo: cada una levanta su servidor y su navegador, y
// varias peleando por la máquina dan rojos que no son del código. Ya pasó.
function correr(p) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const hijo = spawn(p.cmd, [join(here, p.archivo)], { cwd: root, env: process.env });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('close', (code) => {
      resolve({ ...p, code, salida, seg: ((Date.now() - t0) / 1000).toFixed(1) });
    });
  });
}

// La línea que resume, si la prueba la escribe.
const resumenDe = (salida) => {
  const m = /RESULTADO:\s*(\d+)\s*bien,\s*(\d+)\s*mal/.exec(salida);
  if (m) return { bien: +m[1], mal: +m[2] };
  return null;
};

const corridas = [];
const saltadas = [];

for (const p of pruebas) {
  if (p.necesitaClave && !hayClave) { saltadas.push(p); continue; }
  process.stdout.write(`  ${p.archivo.padEnd(30)} `);
  const r = await correr(p);
  corridas.push(r);
  const res = resumenDe(r.salida);
  const detalle = res ? `${res.bien} bien, ${res.mal} mal` : (r.code === 0 ? 'sin quejas' : 'falló');
  console.log(`${r.code === 0 ? 'OK  ' : 'MAL '} ${detalle}  (${r.seg}s)`);
}

// ── Lo que falló, con su salida ─────────────────────────────────────────────
const malas = corridas.filter((r) => r.code !== 0);
for (const r of malas) {
  console.log(`\n${'─'.repeat(70)}\n${r.archivo}\n${'─'.repeat(70)}`);
  // Las líneas que importan: las que fallaron y el final.
  const lineas = r.salida.split('\n');
  const fallas = lineas.filter((l) => /FALLA|Error|error:/i.test(l)).slice(0, 12);
  if (fallas.length) console.log(fallas.join('\n'));
  else console.log(lineas.slice(-15).join('\n'));
}

// ── El resumen ──────────────────────────────────────────────────────────────
const totalBien = corridas.reduce((n, r) => n + (resumenDe(r.salida)?.bien || 0), 0);
const totalMal = corridas.reduce((n, r) => n + (resumenDe(r.salida)?.mal || 0), 0);
const seg = corridas.reduce((n, r) => n + Number(r.seg), 0).toFixed(0);

console.log(`\n${'═'.repeat(70)}`);
console.log(`${corridas.length - malas.length} de ${corridas.length} pruebas bien` +
            (totalBien + totalMal ? `  ·  ${totalBien} afirmaciones, ${totalMal} fallidas` : '') +
            `  ·  ${seg}s`);

if (saltadas.length) {
  console.log(`\n${saltadas.length} SIN CORRER, y no es lo mismo que «bien»:`);
  for (const p of saltadas) console.log(`  ${p.archivo}`);
  console.log('\nHablan con la base de verdad. Para correrlas:');
  console.log('  SUPABASE_SERVICE_KEY=... npm test');
}

console.log('');
process.exit(malas.length ? 1 : 0);
