// De dónde sale Playwright.
//
// Proa no lo tiene instalado: se lo pide prestado a ClavaMetrics, que ya lo
// tiene con su navegador descargado. Bajarlo dos veces son cientos de megas
// repetidos para el mismo Chromium.
//
// La ruta NO se escribe a mano. Estuvo fija en cinco pruebas, y el día que
// ClavaMetrics cambió de carpeta las cinco dejaron de arrancar sin que nadie
// se enterara: una prueba que no corre no falla, y eso es peor que fallar.
// Acá se busca sola, y si no aparece lo dice con el paso exacto para
// arreglarlo en vez de un «Cannot find module» a secas.

import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, parse } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

const tienePlaywright = (d) => existsSync(join(d, 'node_modules', 'playwright'));

// Las subcarpetas de `dir` que valen la pena mirar. Se saltan las ocultas y
// las de dependencias: adentro de node_modules no hay otro repo.
function hijos(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

// El orden es del más cercano al más lejano: primero el propio Proa (por si
// algún día se instala acá), después cada carpeta que lo contiene, y en cada
// una sus repos vecinos hasta dos niveles —ClavaMetrics guarda el suyo en
// «DEVELOPING FOLDER», así que con un solo nivel no alcanzaría.
function* candidatos() {
  if (process.env.PROA_PLAYWRIGHT) yield resolve(process.env.PROA_PLAYWRIGHT);
  yield repo;

  let dir = repo;
  const tope = parse(repo).root;
  while (true) {
    const padre = resolve(dir, '..');
    if (padre === dir) break;
    yield padre;
    for (const hijo of hijos(padre)) {
      if (hijo === dir) continue;
      yield hijo;
      yield* hijos(hijo);
    }
    if (padre === tope || padre === process.env.HOME) break;
    dir = padre;
  }
}

function encontrar() {
  for (const dir of candidatos()) {
    if (tienePlaywright(dir)) return dir;
  }
  return null;
}

const base = encontrar();

if (!base) {
  console.error(
    'No encuentro Playwright.\n' +
      '\n' +
      'Proa lo toma prestado del repo que lo tenga instalado cerca (normalmente\n' +
      'ClavaMetrics). Se busca desde ' + repo + ' hacia arriba y no apareció.\n' +
      '\n' +
      'Dos maneras de arreglarlo:\n' +
      '  · Apuntarle a mano:  PROA_PLAYWRIGHT=/ruta/al/repo/con/node_modules node tests/…\n' +
      '  · Instalarlo acá:    npm i -D playwright && npx playwright install chromium\n',
  );
  process.exit(1);
}

const req = createRequire(join(base, 'package.json'));
const { chromium, firefox, webkit, devices } = req('playwright');

export { chromium, firefox, webkit, devices };
export const playwrightBase = base;
