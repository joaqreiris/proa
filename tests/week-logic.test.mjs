// Pruebas de la lógica de la semana. No tocan la base ni el navegador:
// son cuentas puras, que es justo donde más fácil se cuela un error.
//   node tests/week-logic.test.mjs
import fs from 'node:fs';

// El prYMD de verdad usa la fecha LOCAL. Si acá se usara toISOString() el
// simulador daría un día menos y haría fallar pruebas que están bien.
global.window = {
  prYMD: (d) => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
};
eval(fs.readFileSync(new URL('../assets/week-grid.js', import.meta.url), 'utf8'));
const W = global.window.prWeek;

let pass = 0, fail = 0;
const eq = (n, got, exp) => {
  if (JSON.stringify(got) === JSON.stringify(exp)) { console.log('  OK    ' + n); pass++; }
  else { console.log('  FALLA ' + n + ' → ' + JSON.stringify(got) + ' (esperaba ' + JSON.stringify(exp) + ')'); fail++; }
};

const D = '2026-09-07';   // lunes

console.log('Primer hueco libre del día');
eq('día vacío: propone las 08:00, no las 06:00', W.firstFreeSlot([], [], D, 0, 60), { start: '08:00', end: '09:00' });
eq('con facultad 08–13: salta a las 13:00',
   W.firstFreeSlot([{ weekday: 0, start_time: '08:00', end_time: '13:00' }], [], D, 0, 60), { start: '13:00', end: '14:00' });
eq('no pisa un bloque ya planificado',
   W.firstFreeSlot([{ weekday: 0, start_time: '08:00', end_time: '13:00' }],
                   [{ date: D, start_time: '13:00', end_time: '14:30' }], D, 0, 60), { start: '14:30', end: '15:30' });
eq('fusiona franjas que se pisan',
   W.firstFreeSlot([{ weekday: 0, start_time: '08:00', end_time: '12:00' },
                    { weekday: 0, start_time: '11:00', end_time: '16:00' }], [], D, 0, 60), { start: '16:00', end: '17:00' });
eq('si no entra desde las 08:00, prueba desde las 06:00',
   W.firstFreeSlot([{ weekday: 0, start_time: '08:00', end_time: '23:59' }], [], D, 0, 60), { start: '06:00', end: '07:00' });
eq('día lleno: no inventa una hora',
   W.firstFreeSlot([{ weekday: 0, start_time: '06:00', end_time: '23:59' }], [], D, 0, 60), null);
eq('descarta un hueco más corto que lo pedido',
   W.firstFreeSlot([{ weekday: 0, start_time: '08:00', end_time: '13:00' },
                    { weekday: 0, start_time: '13:30', end_time: '22:00' }], [], D, 0, 60), { start: '22:00', end: '23:00' });
eq('mira solo el día pedido',
   W.firstFreeSlot([{ weekday: 1, start_time: '08:00', end_time: '20:00' }], [], D, 0, 60), { start: '08:00', end: '09:00' });

console.log('Cálculo del lunes');
eq('domingo retrocede seis días, no cero', W.mondayOf('2026-09-13'), '2026-09-07');
eq('lunes se queda donde está',            W.mondayOf('2026-09-07'), '2026-09-07');
eq('cruzando fin de mes',                  W.mondayOf('2026-10-01'), '2026-09-28');
eq('cruzando fin de año',                  W.mondayOf('2027-01-01'), '2026-12-28');
eq('los siete días', W.weekDates('2026-09-07'),
   ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13']);

console.log('Horas libres de la semana');
eq('semana vacía: 7 × 18 h', W.freeHours([]), 126);
eq('resta cinco horas de un día', W.freeHours([{ weekday: 0, start_time: '08:00', end_time: '13:00' }]), 121);
eq('dos franjas superpuestas no restan el doble',
   W.freeHours([{ weekday: 0, start_time: '08:00', end_time: '13:00' },
                { weekday: 0, start_time: '11:00', end_time: '13:00' }]), 121);

console.log('');
console.log('RESULTADO: ' + pass + ' bien, ' + fail + ' mal');
process.exit(fail);
