// El perfil fuerza-velocidad de un sprint (Samozino et al., 2016).
//
// Esta prueba no compara contra números que alguien anotó una vez: GENERA un
// sprint con vmax y τ conocidos, y comprueba que el cálculo los recupere. Si
// el ajuste, la derivada, la fuerza aerodinámica o la regresión estuvieran
// mal, el número que vuelve no sería el que entró.
//
// Es la única forma honesta de probar esto. Un caso quemado con «F0 = 8.1»
// sólo prueba que el código sigue haciendo lo mismo que hacía, esté bien o mal.
//
//   node tests/sprint-profile.test.mjs

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const S = createRequire(import.meta.url)(join(here, '..', 'assets', 'sprint-profile.js'));

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d)); fail++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : no(m, { got, want });
const cerca = (m, got, want, tol) =>
  (got != null && Math.abs(got - want) <= tol) ? ok(m) : no(m, { got, want, tol });

// Un sprint sintético: x(t) = vmax·(t + τ·e^(−t/τ) − τ). Se despeja t para
// cada distancia y esos son los parciales que se le dan al cálculo.
function carreraDe(vmax, tau, distancias) {
  const x = (t) => vmax * (t + tau * Math.exp(-t / tau) - tau);
  const t = (d) => {
    let lo = 0, hi = 30;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (x(m) < d) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // Redondeado a la centésima, que es lo que da un cronómetro de verdad.
  return distancias.map(d => ({ distancia: d, tiempo: +t(d).toFixed(2) }));
}

console.log('\nRECUPERA LOS PARÁMETROS DE UN SPRINT CONOCIDO');
{
  const vmax = 9.0, tau = 1.10, masa = 78, altura = 1.80;
  const p = S.perfil(carreraDe(vmax, tau, [5, 10, 15, 20, 30]), masa, altura);
  cerca('la velocidad máxima', p.vmax, vmax, 0.05);
  cerca('la constante de aceleración', p.tau, tau, 0.03);
  // Sin aire, F0 = m·vmax/τ. Con aire da un poco menos, porque parte de la
  // fuerza que se mide al final se la lleva la resistencia.
  cerca('la fuerza a velocidad cero', p.F0_rel, vmax / tau, 0.35);
  cerca('y el techo de velocidad', p.V0, vmax, 0.4);
  cerca('la potencia máxima sale de las dos', p.Pmax_rel, p.F0_rel * p.V0 / 4, 0.05);
}

console.log('\nY CAE DONDE LA LITERATURA DICE QUE TIENE QUE CAER');
{
  // Valores de referencia para futbolistas en el artículo de Samozino y en los
  // de Morin: F0 entre 6 y 9 N/kg, V0 entre 8 y 10 m/s, Pmax entre 15 y 25
  // W/kg, RFmax entre 40 y 60%, DRF entre −0.06 y −0.11.
  const p = S.perfil(carreraDe(9.0, 1.10, [5, 10, 15, 20, 30]), 78, 1.80);
  is('la fuerza, en rango', p.F0_rel > 6 && p.F0_rel < 9.5, true);
  is('la velocidad, en rango', p.V0 > 8 && p.V0 < 10.5, true);
  is('la potencia, en rango', p.Pmax_rel > 15 && p.Pmax_rel < 25, true);
  is('la orientación de la fuerza, en rango', p.RFmax > 0.40 && p.RFmax < 0.60, true);
  is('y su caída, en rango', p.DRF < -0.05 && p.DRF > -0.12, true);
}

console.log('\nUN ATLETA MÁS FUERTE Y UNO MÁS VELOZ NO SE CONFUNDEN');
{
  // Mismo tiempo en 30 m, perfiles opuestos: eso es lo que tres tiempos
  // sueltos no distinguen y este cálculo sí.
  const fuerte = S.perfil(carreraDe(8.4, 0.95, [5, 10, 15, 20, 30]), 78, 1.80);
  const veloz  = S.perfil(carreraDe(9.6, 1.30, [5, 10, 15, 20, 30]), 78, 1.80);
  is('el que arranca mejor tiene más fuerza', fuerte.F0_rel > veloz.F0_rel, true);
  is('y el otro, más techo', veloz.V0 > fuerte.V0, true);
  // Los dos hacen 30 m en un tiempo parecido, y sin embargo se entrenan al revés.
  const t30 = (p) => p ? 1 : 0;
  is('los dos son sprints válidos', [t30(fuerte), t30(veloz)], [1, 1]);
}

console.log('\nUN PARCIAL MAL TOMADO SE DELATA');
{
  const buena = carreraDe(9.0, 1.10, [5, 10, 15, 20, 30]);
  const bien = S.perfil(buena, 78, 1.80);
  // Se adelanta el de 5 m dos décimas: es el error típico de arrancar el
  // cronómetro tarde, y no hay nada en el resultado que lo delate solo.
  const rota = buena.map(p => p.distancia === 5 ? { ...p, tiempo: p.tiempo - 0.20 } : p);
  const mal = S.perfil(rota, 78, 1.80);
  is('con los parciales buenos, el ajuste es confiable', bien.confiable, true);
  is('con uno movido, deja de serlo', mal.confiable, false);
  is('y el error del ajuste crece', mal.rmse > bien.rmse * 10, true);
  // Lo importante: no es que el perfil empeore un poco, es que es OTRO.
  is('porque el perfil cambia de verdad', Math.abs(mal.F0_rel - bien.F0_rel) > 0.5, true);
}

console.log('\nSIN LO MÍNIMO, NO INVENTA UN NÚMERO');
{
  const tres = carreraDe(9.0, 1.10, [10, 20, 30]);
  is('con tres parciales no calcula el perfil', S.perfil(tres, 78, 1.80), null);
  is('sin peso tampoco', S.perfil(carreraDe(9, 1.1, [5, 10, 20, 30]), 0, 1.80), null);
  is('ni sin altura', S.perfil(carreraDe(9, 1.1, [5, 10, 20, 30]), 78, 0), null);
  // Pero las velocidades por tramo sí se pueden dar: son una división.
  const tr = S.tramos(tres);
  is('las velocidades por tramo sí', tr.segmentos.length, 2);
  cerca('con el tramo más rápido bien identificado', tr.vmax.v, 8.7, 0.5);
}

console.log('\nLA FÍSICA DE FONDO');
{
  // Aire a 20 °C y 1 atm: 1.204 kg/m³ es el valor de tabla.
  cerca('la densidad del aire', S.densidadAire(20, 101.325), 1.204, 0.005);
  // Más calor, aire menos denso; más presión, más denso.
  is('el aire caliente pesa menos', S.densidadAire(35, 101.325) < S.densidadAire(5, 101.325), true);
  // Área frontal de un adulto: del orden de 0.5 m².
  const af = S.areaFrontal(1.80, 78);
  is('el área frontal es plausible', af > 0.3 && af < 0.8, true);
}

console.log('\nUN TIEMPO QUE NO CRECE NO ROMPE LA CUENTA');
{
  // Puede llegar de un parcial mal cargado. La velocidad de ese tramo sería
  // infinita o negativa: se descarta el tramo, no se devuelve un absurdo.
  const tr = S.tramos([{ distancia: 10, tiempo: 2.0 }, { distancia: 20, tiempo: 1.5 },
                       { distancia: 30, tiempo: 4.4 }]);
  is('el tramo imposible se descarta', tr.segmentos.length, 1);
  is('y el que queda es el bueno', [tr.segmentos[0].desde, tr.segmentos[0].hasta], [20, 30]);
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
