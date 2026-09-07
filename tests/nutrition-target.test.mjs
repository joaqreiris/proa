// Las cuentas del objetivo nutricional.
//
// Son cuentas puras, así que se prueban sin navegador. Lo que se verifica no es
// que el código corra, sino que los NÚMEROS sean los que dice la literatura:
// una fórmula mal transcrita da un objetivo plausible y equivocado, y nadie se
// da cuenta hasta que el atleta no baja de peso en dos meses.
//
//   node tests/nutrition-target.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });
const cerca = (m, got, want, tol = 1) =>
  Math.abs(got - want) <= tol ? ok(`${m} (${got})`) : no(m, { got, want, tol });

globalThis.window = {};
new Function(readFileSync(join(root, 'assets', 'nutrition-calc.js'), 'utf8'))();
const N = globalThis.window.prNutri;

// Un atleta de referencia: 78 kg, 180 cm, 24 años, varón.
const A = { weightKg: 78, heightCm: 180, age: 24, sex: 'male' };

console.log('\nEL METABOLISMO EN REPOSO, CONTRA LA FÓRMULA A MANO');
// Mifflin-St Jeor: 10·kg + 6.25·cm − 5·edad + 5
cerca('Mifflin-St Jeor', N.computeRMR('mifflin', A), 10 * 78 + 6.25 * 180 - 5 * 24 + 5);
// Harris-Benedict 1918, varón
cerca('Harris-Benedict', N.computeRMR('harris_benedict', A),
  66.473 + 13.7516 * 78 + 5.0033 * 180 - 6.755 * 24);
// Y que el sexo cambie el resultado: la constante de Mifflin es +5 / −161.
const mujer = N.computeRMR('mifflin', { ...A, sex: 'female' });
is('en mujeres da 166 kcal menos, que es la diferencia de la fórmula',
  N.computeRMR('mifflin', A) - mujer, 166);

console.log('\nEL GASTO DEL DÍA');
const rmr = N.computeRMR('mifflin', A);
cerca('gasto = reposo × actividad', N.computeTDEE(rmr, 1.725), Math.round(rmr * 1.725));

console.log('\nEL OBJETIVO SEGÚN A DÓNDE VA');
const tdee = N.computeTDEE(rmr, 1.725);
const perder = N.planForGoal(tdee, 78, 'fat_loss');
const manten = N.planForGoal(tdee, 78, 'maintain');
const ganar  = N.planForGoal(tdee, 78, 'muscle_gain');

is('mantener es el gasto, sin tocar', manten.kcal, tdee);
if (perder.kcal < tdee && perder.kcal >= tdee * 0.80) ok(`perder grasa recorta al 82,5% (${perder.kcal} de ${tdee})`);
else no('el déficit se fue de rango', { perder: perder.kcal, tdee });
if (ganar.kcal > tdee && ganar.kcal <= tdee * 1.20) ok(`ganar músculo suma 12,5% (${ganar.kcal} de ${tdee})`);
else no('el superávit se fue de rango', { ganar: ganar.kcal, tdee });

console.log('\nLA PROTEÍNA, DONDE LA PONE LA LITERATURA');
// Morton et al. 2018: el rango útil para hipertrofia va de 1,6 a 2,2 g/kg.
const gkg = (p) => Math.round((p.protein_g / 78) * 100) / 100;
// Los gramos se redondean a entero, así que el g/kg que vuelve trae ruido:
// 2,2 × 78 = 171,6 → 172 → 2,205. Se compara contra el parámetro, que es la
// decisión, y se deja medio gramo de aire al derivarlo de vuelta.
for (const [nombre, plan] of [['perder', perder], ['mantener', manten], ['ganar', ganar]]) {
  const elegido = plan.proteinPerKg;
  if (elegido >= N.PROTEIN_RANGE.min && elegido <= N.PROTEIN_RANGE.max)
    ok(`${nombre}: ${elegido} g/kg, dentro de 1,6–2,2`);
  else no(`${nombre} se fue del rango`, elegido);
  // Se compara en gramos, que es lo que se redondea: medio gramo de aire y
  // nada más. Comparar el g/kg derivado obliga a pelear con los decimales.
  const exactos = elegido * 78;
  if (Math.abs(plan.protein_g - exactos) <= 0.5) ok(`  y los ${plan.protein_g} g son ${elegido} × 78 kg`);
  else no(`  los gramos no salen del g/kg elegido`, { gramos: plan.protein_g, exactos, elegido });
}
if (gkg(perder) > gkg(manten)) ok(`en déficit sube la proteína (${gkg(perder)} contra ${gkg(manten)})`);
else no('en déficit debería subir, para sostener el músculo', { perder: gkg(perder), manten: gkg(manten) });

console.log('\nLOS MACROS CIERRAN CON LAS CALORÍAS');
// 4 kcal por gramo de proteína y de carbohidrato, 9 por gramo de grasa.
for (const [nombre, plan] of [['perder', perder], ['mantener', manten], ['ganar', ganar]]) {
  const suma = plan.protein_g * 4 + plan.carbs_g * 4 + plan.fats_g * 9;
  cerca(`${nombre}: los macros suman las calorías del objetivo`, suma, plan.kcal, 5);
}
if (manten.fats_g / 78 >= 0.8) ok(`la grasa no baja del piso de 0,8 g/kg (${Math.round((manten.fats_g / 78) * 100) / 100})`);
else no('la grasa quedó por debajo del piso', manten.fats_g / 78);

console.log('\nLO QUE FALTA PARA LLEGAR');
const falta = N.remaining({ kcal: 2800, protein_g: 140, carbs_g: 350, fats_g: 78 },
                          { kcal: 157, protein_g: 14.3, carbs_g: 0.8, fats_g: 11 });
is('resta lo comido de lo que hay que comer', falta.kcal, 2643);
is('y en cada macro', [falta.protein_g, falta.carbs_g, falta.fats_g], [126, 349, 67]);
const pasado = N.remaining({ kcal: 2000 }, { kcal: 2450 });
is('si se pasó, el número es negativo y se puede distinguir', pasado.kcal, -450);

console.log('\nY NO SE ROMPE CON LO QUE FALTA');
is('sin peso no inventa un objetivo', N.planForGoal(2000, null, 'maintain'), null);
is('sin altura no calcula el reposo', N.computeRMR('mifflin', { weightKg: 78, age: 24, sex: 'male' }), null);
is('un objetivo que no existe cae en mantener',
  N.planForGoal(tdee, 78, 'no_existe').kcal, manten.kcal);

// ── La tendencia del peso ───────────────────────────────────────────────────
// Acá está la parte que convierte el cálculo en un control: el gasto se ESTIMA,
// y lo único que dice si la estimación era buena es qué pasó con el peso.
console.log('\nLA TENDENCIA SE LEE CON RUIDO, QUE ES COMO VIENE');
// Cuatro semanas bajando de verdad ~0,4 kg/semana, con el vaivén del agua.
const bajando = [
  { date: '2026-08-10', weight_kg: 78.0 }, { date: '2026-08-13', weight_kg: 78.6 },
  { date: '2026-08-17', weight_kg: 77.6 }, { date: '2026-08-21', weight_kg: 77.9 },
  { date: '2026-08-24', weight_kg: 77.1 }, { date: '2026-08-28', weight_kg: 77.3 },
  { date: '2026-09-01', weight_kg: 76.6 }, { date: '2026-09-05', weight_kg: 76.8 },
];
const tr = N.weightTrend(bajando);
cerca('la recta ve que baja, pese al vaivén', tr.kgPerWeek, -0.45, 0.1);
is('usa los ocho puntos', tr.puntos, 8);

// El primero y el último, solos, dirían otra cosa: entre el 13/8 (78.6) y el
// 5/9 (76.8) hay días con subidas. Por eso no se restan dos puntos.
const dosPuntos = N.weightTrend([bajando[1], bajando[7]]);
if (Math.abs(dosPuntos.kgPerWeek - tr.kgPerWeek) > 0.05)
  ok(`dos puntos sueltos dan otra cosa (${dosPuntos.kgPerWeek} contra ${tr.kgPerWeek}): por eso se ajusta una recta`);
else no('los dos métodos dieron igual, el ejemplo no prueba nada', { dosPuntos, tr });

console.log('\nEL VEREDICTO DEPENDE DE A DÓNDE VA');
is('bajando 0,45 con objetivo de perder grasa: va bien',
  N.trendVerdict(tr, 'fat_loss', 78).estado, 'on_track');
is('el mismo dato con objetivo de ganar músculo: no está ganando',
  N.trendVerdict(tr, 'muscle_gain', 78).estado, 'below');
is('y queriendo mantener, está bajando de más',
  N.trendVerdict(tr, 'maintain', 78).estado, 'below');

// Bajar cinco veces más rápido de lo buscado no es «ir bien».
const desplome = [
  { date: '2026-08-10', weight_kg: 78 }, { date: '2026-08-17', weight_kg: 76 },
  { date: '2026-08-24', weight_kg: 74 }, { date: '2026-08-31', weight_kg: 72 },
];
is('bajar 2 kg por semana buscando grasa es demasiado',
  N.trendVerdict(N.weightTrend(desplome), 'fat_loss', 78).estado, 'below');

console.log('\nCON POCOS DATOS NO SE CONCLUYE NADA');
is('dos pesajes en cuatro días no alcanzan',
  N.trendVerdict(N.weightTrend(bajando.slice(-2)), 'fat_loss', 78).estado, 'too_soon');
is('un solo pesaje no da tendencia', N.weightTrend([bajando[0]]), null);
is('sin pesajes tampoco', N.weightTrend([]), null);
is('todo el mismo día no da pendiente',
  N.weightTrend([{ date: '2026-09-01', weight_kg: 78 }, { date: '2026-09-01', weight_kg: 79 }]), null);

console.log('\nSOLO SE MIRA LO RECIENTE');
// Un peso de hace tres meses no dice nada del plan de ahora.
const conViejo = [{ date: '2026-05-01', weight_kg: 90 }].concat(bajando);
cerca('lo de hace meses no arrastra la tendencia', N.weightTrend(conViejo).kgPerWeek, tr.kgPerWeek, 0.05);

console.log('\nUN SUPLEMENTO QUE SÍ APORTA, BIEN CONTADO');
// Casi todos van en cero calorías, que es la verdad. Los que son comida
// disfrazada de polvo llevan sus valores, y ahí la cuenta tiene que cerrar:
// una cápsula de omega 3 pesa 1 g y es grasa pura.
const omega = { kcal: 900, protein_g: 0, carbs_g: 0, fats_g: 100, fiber_g: 0 };
const unaCapsula = N.macrosForQuantity(omega, 1);
is('una cápsula de omega 3 son 9 kcal', unaCapsula.kcal, 9);
is('y un gramo de grasa', unaCapsula.fats_g, 1);
const tresCapsulas = N.macrosForQuantity(omega, 3);
is('tres cápsulas, 27 kcal', tresCapsulas.kcal, 27);

// Y uno de cero no mueve el total, que es justo lo que tiene que pasar.
const magnesio = { kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0 };
is('el magnesio no suma nada', N.macrosForQuantity(magnesio, 1).kcal, 0);

console.log('\nLAS CANTIDADES, COMO SE DICEN');
// Media taza es «1/2», no «0.5»: nadie mide en decimales cuando cocina.
for (const [txt, val] of [['1/2', 0.5], ['1 1/2', 1.5], ['½', 0.5], ['1½', 1.5],
                          ['3/4', 0.75], ['0.5', 0.5], ['1,5', 1.5], ['2', 2]])
  is(`«${txt}» se entiende como ${val}`, N.parseAmount(txt), val);

is('«2/3» sale con decimales, no redondo', N.parseAmount('2/3'), 0.6667);

console.log('\nY LO QUE NO ES UNA CANTIDAD, NO LO ES');
for (const txt of ['x', '', '   ', '1/0', 'taza', null])
  is(`${JSON.stringify(txt)} no es un número`, N.parseAmount(txt), null);

console.log('\nDE VUELTA, TAMBIÉN EN FRACCIONES');
for (const [n, txt] of [[0.5, '1/2'], [1.5, '1 1/2'], [0.333, '1/3'], [2, '2'],
                        [0.25, '1/4'], [1.67, '1 2/3'], [3, '3']])
  is(`${n} se muestra «${txt}»`, N.formatAmount(n), txt);

// Lo que no cae cerca de una fracción de cocina se queda en decimal: inventar
// «7/10» sería peor que mostrar 0.7.
is('0.7 no se fuerza a una fracción rara', N.formatAmount(0.7), '0.7');
is('el ida y vuelta no pierde nada', N.parseAmount(N.formatAmount(1.5)), 1.5);

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
