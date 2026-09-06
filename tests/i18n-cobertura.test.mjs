// Que no quede texto sin traducir.
//
// Proa se habla en español, inglés y portugués, y eso no se sostiene con buena
// voluntad: alcanza con un «Guardar» escrito a mano para que un entrenador
// brasileño vea media pantalla en castellano. Esta prueba busca texto visible
// que no pase por el motor de idiomas y falla nombrando el archivo y la línea.
//
//   node tests/i18n-cobertura.test.mjs
//
// Lo que se salta está en las dos listas de abajo, y cada excepción es una
// decisión: la marca no se traduce, los idiomas se escriben en su propio
// idioma, y las unidades son iguales en los tres.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
const ok = (m) => { console.log('  OK    ' + m); pass++; };
const no = (m, d) => { console.log('  FALLA ' + m + ' :: ' + JSON.stringify(d, null, 2)); fail++; };

// ── Lo que NO se traduce, y por qué ─────────────────────────────────────────
const NO_SE_TRADUCE = new Set([
  'Proa',          // la marca
  'Español', 'English', 'Português',  // cada idioma se escribe en el suyo
  'kcal', 'g', 'h', 'min', 'km', 'kg', 'cm', 'RPE', 'AU',   // unidades
  'by Clava',
]);

// Textos que ya se decidió dejar así, con su razón.
const PERDONADOS = {
  'tu@correo.com': 'ejemplo de correo: se entiende igual en los tres idiomas',
  'https://youtube.com/…': 'una URL de ejemplo no se traduce',
};

const esMarcaOUnidad = (t) => NO_SE_TRADUCE.has(t) || t in PERDONADOS;

// ── Los archivos ────────────────────────────────────────────────────────────
function html() {
  const raiz = readdirSync(root).filter((f) => f.endsWith('.html')).map((f) => f);
  const atleta = readdirSync(join(root, 'athlete')).filter((f) => f.endsWith('.html')).map((f) => 'athlete/' + f);
  return [...raiz, ...atleta].sort();
}

// ── 1. Texto entre etiquetas, sin data-i18n ─────────────────────────────────
const ETIQUETAS = 'h1|h2|h3|h4|h5|h6|p|button|label|span|option|th|td|a|li|dt|dd|legend|summary';
const sinClave = [];

for (const rel of html()) {
  const src = readFileSync(join(root, rel), 'utf8');
  // Fuera scripts y estilos: ahí el texto se mira aparte.
  const limpio = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '));
  // El contenido puede traer etiquetas de estilo adentro —«La semana,
  // <em>completa</em>»— y esos títulos también hay que traducirlos. Se aceptan
  // los hijos que solo dan formato y se descarta lo que tenga estructura, para
  // no agarrar un div entero y reportar el texto de toda la página.
  const INLINE = 'em|strong|b|i|small|code|kbd|u|mark|br|sup|sub';
  const re = new RegExp(`<(${ETIQUETAS})\\b([^>]*)>((?:[^<>{}]|<\\/?(?:${INLINE})\\b[^>]*>)+)<\\/\\1>`, 'g');
  for (const m of limpio.matchAll(re)) {
    const attrs = m[2];
    const txt = m[3].replace(/<[^>]+>/g, '').trim();
    if (!txt || txt.length < 2) continue;
    if (/^[\d\s.,:;/&·\-–—+%°|]+$/.test(txt)) continue;       // números y símbolos
    if (/^&[a-z]+;$/.test(txt)) continue;                      // entidades sueltas
    if (attrs.includes('data-i18n')) continue;   // incluye data-i18n-html
    if (esMarcaOUnidad(txt)) continue;
    sinClave.push({ archivo: rel, linea: limpio.slice(0, m.index).split('\n').length, texto: txt.slice(0, 60) });
  }
}

console.log('\nTEXTO VISIBLE EN EL HTML');
if (sinClave.length === 0) ok('todo el texto pasa por el motor de idiomas');
else no(`hay ${sinClave.length} textos sin data-i18n`, sinClave);

// ── 2. Atributos que se ven: placeholder, title, aria-label ─────────────────
const atributosSinClave = [];
for (const rel of html()) {
  const src = readFileSync(join(root, rel), 'utf8');
  const limpio = src.replace(/<script[\s\S]*?<\/script>/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of limpio.matchAll(/<[^>]*?\b(placeholder|title|aria-label)="([^"]{2,})"[^>]*>/g)) {
    const etiqueta = m[0], attr = m[1], txt = m[2].trim();
    if (!txt || esMarcaOUnidad(txt)) continue;
    if (/^[\d\s.,:;/&·\-–—+%°|]+$/.test(txt)) continue;
    if (txt.startsWith('${') || txt.includes('${')) continue;   // lo arma el JS
    // La clave puede venir por data-i18n-ph o data-i18n-attr.
    if (etiqueta.includes('data-i18n-ph') && attr === 'placeholder') continue;
    if (etiqueta.includes('data-i18n-attr')) continue;
    if (attr === 'aria-label' && etiqueta.includes('data-i18n')) continue;
    atributosSinClave.push({ archivo: rel, atributo: attr, texto: txt.slice(0, 60) });
  }
}

console.log('\nATRIBUTOS QUE SE LEEN (placeholder, title, aria-label)');
if (atributosSinClave.length === 0) ok('todos traducidos');
else no(`hay ${atributosSinClave.length} atributos sin clave`, atributosSinClave);

// ── 3. Texto que el JavaScript le muestra a la persona ──────────────────────
// El HTML es la mitad fácil: lo que de verdad se escapa son los mensajes que
// arma el código. Se miran las funciones que muestran algo —el aviso flotante,
// los errores de los formularios— y se exige que lo que reciben pase por t().
const MUESTRAN = ['prToast', 'fail', 'show'];
const enJs = [];

function scriptsDe(rel) {
  const src = readFileSync(join(root, rel), 'utf8');
  if (!rel.endsWith('.html')) return src;
  return [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
}

const fuentes = [...html(), ...readdirSync(join(root, 'assets')).filter((f) => f.endsWith('.js')).map((f) => 'assets/' + f)];
for (const rel of fuentes) {
  let js = scriptsDe(rel);
  js = js.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');   // fuera comentarios
  for (const fn of MUESTRAN) {
    const re = new RegExp(`\\b${fn}\\(\\s*(['"\`])([^'"\`\n]{6,})\\1`, 'g');
    for (const m of js.matchAll(re)) {
      const txt = m[2].trim();
      // Un texto con acentos o con varias palabras es texto de verdad; una
      // clase CSS o un id, no.
      if (!/[áéíóúñ¿¡]|\s\w+\s/.test(txt)) continue;
      if (esMarcaOUnidad(txt)) continue;
      enJs.push({ archivo: rel, funcion: fn, texto: txt.slice(0, 60) });
    }
  }
}

console.log('\nMENSAJES QUE ARMA EL JAVASCRIPT');
if (enJs.length === 0) ok('todos pasan por el motor de idiomas');
else no(`hay ${enJs.length} mensajes escritos a mano`, enJs);

// ── 4. Que las tres tablas de idiomas digan lo mismo ────────────────────────
const locales = {};
for (const lang of ['es', 'en', 'pt']) {
  locales[lang] = JSON.parse(readFileSync(join(root, 'locales', `${lang}.json`), 'utf8'));
}
console.log('\nLAS TRES TABLAS DE IDIOMAS');
const claves = Object.keys(locales.es);
for (const lang of ['en', 'pt']) {
  const faltan = claves.filter((k) => !(k in locales[lang]));
  if (faltan.length === 0) ok(`${lang} tiene las ${claves.length} claves del español`);
  else no(`a ${lang} le faltan ${faltan.length} claves`, faltan.slice(0, 20));
}
for (const lang of ['en', 'pt']) {
  const sobran = Object.keys(locales[lang]).filter((k) => !(k in locales.es));
  if (sobran.length === 0) ok(`${lang} no tiene claves que el español no tenga`);
  else no(`${lang} tiene ${sobran.length} claves de más`, sobran.slice(0, 20));
}
// Una traducción vacía es peor que ninguna: no se ve y nadie se entera.
for (const lang of ['es', 'en', 'pt']) {
  const vacias = Object.entries(locales[lang]).filter(([, v]) => typeof v === 'string' && !v.trim()).map(([k]) => k);
  if (vacias.length === 0) ok(`${lang} no tiene traducciones vacías`);
  else no(`${lang} tiene ${vacias.length} vacías`, vacias.slice(0, 20));
}

console.log(`\nRESULTADO: ${pass} bien, ${fail} mal`);
process.exit(fail ? 1 : 0);
