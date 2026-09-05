// Pruebas de husos horarios. No tocan la base ni el navegador: es lógica pura.
//
// Los casos no son inventados: son los tres que rompen a todo el mundo.
//   · Cruzar el mundo cambia el DÍA, no solo la hora.
//   · Los dos hemisferios cambian el horario de verano en meses opuestos, así
//     que la diferencia entre Montevideo y Madrid no es fija: es 4, 5 o 6 horas
//     según el mes.
//   · Hay husos a media hora y a 45 minutos.
//
//   node tests/tz.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
globalThis.window = globalThis;
new Function(readFileSync(join(here, '..', 'assets/tz.js'), 'utf8'))();
const T = globalThis.prTz;

let pass = 0, fail = 0;
const is = (m, got, want) => {
  JSON.stringify(got) === JSON.stringify(want)
    ? (console.log('  OK    ' + m), pass++)
    : (console.log(`  FALLA ${m} :: dio ${JSON.stringify(got)}, esperaba ${JSON.stringify(want)}`), fail++);
};

const MVD = 'America/Montevideo';
const PNH = 'Asia/Phnom_Penh';     // Camboya, GMT+7 todo el año
const MAD = 'Europe/Madrid';
const KOL = 'Asia/Kolkata';        // GMT+5:30
const KTM = 'Asia/Kathmandu';      // GMT+5:45

// ── Lo esencial: la sesión de Ana vista desde Camboya ──────────────────────
// Uruguay GMT-3, Camboya GMT+7: diez horas. Las 18:00 de ella son las 04:00
// del día siguiente para él.
is('18:00 en Montevideo son las 04:00 del día siguiente en Camboya',
   T.convert('2026-09-08', '18:00', MVD, PNH), { ymd: '2026-09-09', hhmm: '04:00', shift: 1 });

is('y al revés, vuelve al punto de partida',
   T.convert('2026-09-09', '04:00', PNH, MVD), { ymd: '2026-09-08', hhmm: '18:00', shift: -1 });

// El caso que se lee mal si uno no mira el día: temprano allá es el día
// anterior acá.
is('07:00 en Camboya es la noche anterior en Montevideo',
   T.convert('2026-09-09', '07:00', PNH, MVD), { ymd: '2026-09-08', hhmm: '21:00', shift: -1 });

// ── El horario de verano no es una constante ───────────────────────────────
// Uruguay ya no lo usa; España sí. En enero hay 4 horas de diferencia y en
// julio, 5. Un número fijo estaría mal la mitad del año.
is('en enero, Madrid le lleva 4 horas a Montevideo',
   T.convert('2026-01-15', '12:00', MVD, MAD).hhmm, '16:00');
is('en julio le lleva 5',
   T.convert('2026-07-15', '12:00', MVD, MAD).hhmm, '17:00');

// ── Husos que no caen en hora redonda ──────────────────────────────────────
is('India está a media hora', T.convert('2026-09-08', '12:00', 'UTC', KOL).hhmm, '17:30');
is('Nepal, a 45 minutos',    T.convert('2026-09-08', '12:00', 'UTC', KTM).hhmm, '17:45');
is('y el desfase se escribe entero', T.gmt(KTM, Date.UTC(2026, 8, 8)), 'GMT+5:45');

// ── Ida y vuelta: nada se pierde por el camino ─────────────────────────────
let redondo = true;
for (const tz of [MVD, PNH, MAD, KOL, 'America/Sao_Paulo', 'Pacific/Auckland']) {
  for (const ymd of ['2026-01-15', '2026-03-29', '2026-07-15', '2026-10-25']) {
    for (const hhmm of ['00:00', '09:30', '18:00', '23:45']) {
      const v = T.convert(ymd, hhmm, tz, 'UTC');
      const back = T.convert(v.ymd, v.hhmm, 'UTC', tz);
      if (back.ymd !== ymd || back.hhmm !== hhmm) { redondo = false; }
    }
  }
}
is('ir y volver por cualquier huso devuelve lo mismo', redondo, true);

// ── El mismo huso no se toca ───────────────────────────────────────────────
is('mismo huso, misma hora', T.convert('2026-09-08', '18:00', MVD, MVD), { ymd: '2026-09-08', hhmm: '18:00', shift: 0 });
is('un huso inválido no rompe: deja la hora como está',
   T.convert('2026-09-08', '18:00', 'Marte/Olympus', PNH), { ymd: '2026-09-08', hhmm: '18:00', shift: 0 });
is('un huso inválido se reconoce', T.valid('Marte/Olympus'), false);
is('uno válido también', T.valid(MVD), true);

// ── Etiquetas ──────────────────────────────────────────────────────────────
is('la ciudad sale del nombre del huso', T.city('America/Argentina/Buenos_Aires'), 'Buenos Aires');
is('con guiones bajos convertidos en espacios', T.city(PNH), 'Phnom Penh');
is('media hora se escribe con dos puntos', T.gmt(KOL, Date.UTC(2026, 8, 8)), 'GMT+5:30');

// ── La lista para el selector ──────────────────────────────────────────────
const L = T.list();
is('la lista trae husos de sobra', L.length > 100, true);
is('y están los que nos importan', [MVD, PNH, MAD].every(x => L.includes(x)), true);

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
