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

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
