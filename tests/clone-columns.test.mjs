// Que la copia de un evento no se olvide columnas.
//
// clone_event enumera a mano las columnas de `events`, y esa lista se quedó
// corta tres veces: primero la duración y el RPE, después el color. El síntoma
// es feo porque no falla nada — arrastrás con Command un bloque naranja y la
// copia sale azul, y hay que ir a mirar SQL para entender por qué.
//
// Esta prueba lee db/schema.sql, junta todas las columnas de events y las
// compara con las que la función copia. Lo que no se copia tiene que estar en
// la lista de abajo, con su razón. Si alguien agrega una columna y no toca
// ninguna de las dos cosas, esto se pone en rojo y dice cuál.
//
//   node tests/clone-columns.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };

// Lo que NO se copia, y por qué. Agregar acá es una decisión, no un descuido.
const NO_SE_COPIAN = {
  id:           'lo pone la base',
  created_at:   'lo pone la base',
  updated_at:   'lo pone la base',
  athlete_id:   'lo elige quien copia',
  date:         'lo elige quien copia',
  created_by:   'es quien copia, no quien creó el original',
  status:       'la copia arranca planificada aunque el original esté hecho',
  rpe:          'devolución del atleta: no se copia',
  actual_min:   'devolución del atleta: no se copia',
  athlete_note: 'devolución del atleta: no se copia',
  done_at:      'devolución del atleta: no se copia',
  au:           'devolución del atleta: no se copia',
};

// ── Las columnas de la tabla ────────────────────────────────────────────────
const iTabla = schema.lastIndexOf('create table if not exists public.events (');
const cuerpoTabla = schema.slice(iTabla, schema.indexOf('\n);', iTabla));
const columnas = new Set();
for (const linea of cuerpoTabla.split('\n').slice(1)) {
  const l = linea.trim();
  if (!l || l.startsWith('--') || l.startsWith('check') || l.startsWith('constraint')) continue;
  const m = /^([a-z_]+)\s+(uuid|text|date|time|timestamptz|smallint|int|boolean|numeric|jsonb)/.exec(l);
  if (m) columnas.add(m[1]);
}
// Y las que se agregaron después con alter table.
for (const m of schema.matchAll(/alter table public\.events\s+add column if not exists\s+([a-z_]+)/g)) {
  columnas.add(m[1]);
}

// ── Las que clone_event toma DEL ORIGINAL ───────────────────────────────────
// No alcanza con mirar los nombres del insert: athlete_id, date, status y
// created_by están ahí, pero con valores nuevos. Lo que importa es cuáles
// salen de `r.`, que es la fila que se está copiando.
const iFn = schema.lastIndexOf('create or replace function public.clone_event(');
const cuerpoFn = schema.slice(iFn, schema.indexOf('$$;', iFn));
const mIns = /insert into public\.events\s*\(([^)]*)\)\s*values\s*\(([\s\S]*?)\)\s*returning/.exec(cuerpoFn);
if (!mIns) { no('no encontré el insert de events dentro de clone_event', null); }

const nombres = (mIns ? mIns[1] : '').split(',').map((c) => c.trim()).filter(Boolean);
const valores = (mIns ? mIns[2] : '').split(',').map((c) => c.trim());
const copiadas = new Set();
nombres.forEach((col, i) => {
  const v = valores[i] || '';
  if (v === 'r.' + col) copiadas.add(col);        // sale tal cual del original
});

console.log(`\nLA TABLA events TIENE ${columnas.size} COLUMNAS; LA COPIA HEREDA ${copiadas.size} DEL ORIGINAL`);
console.log(`  hereda: ${[...copiadas].join(', ')}`);

// ── La comparación ──────────────────────────────────────────────────────────
const olvidadas = [...columnas].filter((c) => !copiadas.has(c) && !(c in NO_SE_COPIAN));
if (olvidadas.length === 0) ok('ninguna columna quedó afuera sin querer');
else no('estas columnas no se copian y nadie dijo por qué', olvidadas);

// El color es el caso que motivó todo esto: se comprueba por su nombre para
// que quede escrito qué se rompió.
if (copiadas.has('color')) ok('la copia conserva el color del bloque');
else no('la copia pierde el color: un bloque naranja se copia del color de su tipo', null);

// Y al revés: que no herede algo que tiene que arrancar de cero. Copiar el
// `status` haría que la copia naciera «hecha», y copiar la devolución del
// atleta le pondría a la copia un RPE que nadie dio.
const deMas = [...copiadas].filter((c) => c in NO_SE_COPIAN);
if (deMas.length === 0) ok('y no hereda nada de lo que tiene que arrancar de cero');
else no('la copia hereda columnas que no debería', deMas.map((c) => `${c} (${NO_SE_COPIAN[c]})`));

// Que la lista de excepciones no envejezca: si se borra una columna, sobra.
const fantasmas = Object.keys(NO_SE_COPIAN).filter((c) => !columnas.has(c));
if (fantasmas.length === 0) ok('la lista de excepciones no tiene columnas que ya no existen');
else no('sobran excepciones de columnas borradas', fantasmas);

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
