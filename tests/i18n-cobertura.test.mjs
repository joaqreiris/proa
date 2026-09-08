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

const locales = {};
for (const lang of ['es', 'en', 'pt']) {
  locales[lang] = JSON.parse(readFileSync(join(root, 'locales', `${lang}.json`), 'utf8'));
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
// ── 3b. Que las claves que se usan existan ──────────────────────────────────
// Que las tres tablas coincidan entre sí no dice nada de si la clave que pide
// la pantalla está en alguna. Un data-i18n con una clave inventada no falla:
// muestra la clave. Así aparecieron «ML.PROT» y «ML.CARB» en la ficha del
// atleta, porque los macros se llaman ml.p y ml.c.
const inventadas = [];
for (const rel of html()) {
  const src = readFileSync(join(root, rel), 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) {
    if (!(m[1] in locales.es)) inventadas.push({ archivo: rel, clave: m[1] });
  }
  // Y las de los atributos, que van como «aria-label:clave».
  for (const m of src.matchAll(/data-i18n-attr="[\w-]+:([\w.]+)"/g)) {
    if (!(m[1] in locales.es)) inventadas.push({ archivo: rel, clave: m[1] });
  }
}
// El propio motor de idiomas queda afuera: su documentación escribe
// data-i18n="key" como ejemplo del formato, y no es una clave de verdad.
for (const rel of readdirSync(join(root, 'assets')).filter((f) => f.endsWith('.js') && f !== 'i18n.js')) {
  const src = readFileSync(join(root, 'assets', rel), 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)) {
    if (!(m[1] in locales.es)) inventadas.push({ archivo: 'assets/' + rel, clave: m[1] });
  }
}

console.log('\nLAS CLAVES QUE PIDEN LAS PANTALLAS EXISTEN');
if (inventadas.length === 0) ok('ninguna clave inventada');
else no(`hay ${inventadas.length} claves que no están en locales/es.json`, inventadas);

// ── 3c. Una traducción con etiquetas se pide con data-i18n-html ────────────
// data-i18n escribe en textContent: si el texto trae un <em>, la pantalla
// muestra «<EM>» en crudo. Pasó en la invitación —lo primero que ve un atleta
// de Proa— y no se ve en ninguna prueba de las de arriba, porque la clave
// existe, está en los tres idiomas y no está vacía.
const crudas = [];
for (const rel of html()) {
  const src = readFileSync(join(root, rel), 'utf8');
  for (const m of src.matchAll(/data-i18n="([\w.]+)"/g)) {
    const v = locales.es[m[1]];
    if (typeof v === 'string' && /<[a-z][^>]*>/i.test(v)) {
      crudas.push({ archivo: rel, clave: m[1], texto: v.slice(0, 50) });
    }
  }
}

console.log('\nLAS QUE LLEVAN ETIQUETAS SE PIDEN CON data-i18n-html');
if (crudas.length === 0) ok('ninguna se mostraría en crudo');
else no(`hay ${crudas.length} que saldrían con las etiquetas a la vista`, crudas);

// ── 5. El español de Proa es de «tú» ───────────────────────────────────────
// Está escrito en las reglas del proyecto y se coló igual cuatro veces, siempre
// por la misma puerta: el TEXTO DE RESERVA que va en el código al lado de la
// clave. Como casi nunca se ve —solo si el motor de idiomas no cargó—, nadie lo
// relee, y el que copia esa línea para una pantalla nueva se lleva el voseo.
//
// El límite de palabra va a mano: en JavaScript la «á» no cuenta como carácter
// de palabra, así que \b«pará» encontraría «Parámetros».
const VOSEO = [
  'sos', 'tenés', 'podés', 'querés', 'hacés', 'sabés', 'debés', 'decís', 'venís',
  'salís', 'elegís', 'preferís', 'vivís', 'sentís', 'pedís', 'seguís', 'conocés', 'ponés', 'creés',
  'mirá', 'tocá', 'cargá', 'poné', 'pasá', 'fijate', 'acordate', 'contame', 'decime',
  'mandame', 'escribime', 'elegí', 'sumá', 'probá', 'guardá', 'marcá', 'anotá', 'entrá',
  'andá', 'dejá', 'volvé', 'hacé', 'vení', 'ponete', 'quedate', 'llevá', 'traé', 'buscá',
  'abrí', 'cerrá', 'borrá', 'editá', 'copiá', 'revisá', 'completá', 'respondé', 'apretá',
  'deslizá', 'tené', 'sentate', 'mové', 'agregá', 'escribí', 'subí', 'bajá', 'empezá',
  'terminá', 'avisá', 'contá', 'mostrá', 'usá', 'vos',
];
const LETRA = 'a-záéíóúüñ';
const RE_VOSEO = new RegExp(`(?<![${LETRA}])(${VOSEO.join('|')})(?![${LETRA}])`, 'i');

const voseo = [];
for (const [k, v] of Object.entries(locales.es)) {
  const m = typeof v === 'string' && v.match(RE_VOSEO);
  if (m) voseo.push({ donde: 'locales/es.json', clave: k, palabra: m[0], texto: v.slice(0, 60) });
}
for (const rel of [...html(), ...readdirSync(join(root, 'assets')).filter((f) => f.endsWith('.js')).map((f) => 'assets/' + f)]) {
  readFileSync(join(root, rel), 'utf8').split('\n').forEach((linea, i) => {
    // Solo los textos entre comillas: un comentario en voseo no lo lee nadie
    // más que quien programa.
    for (const m of linea.matchAll(/'([^'\n]{4,})'|"([^"\n]{4,})"|`([^`\n]{4,})`/g)) {
      const txt = m[1] || m[2] || m[3];
      const v = txt.match(RE_VOSEO);
      if (v) voseo.push({ donde: rel + ':' + (i + 1), palabra: v[0], texto: txt.slice(0, 60) });
    }
  });
}

console.log('\nEL ESPAÑOL ES DE «TÚ», TAMBIÉN EN LOS TEXTOS DE RESERVA');
if (voseo.length === 0) ok('sin voseo');
else no(`hay ${voseo.length} textos con voseo`, voseo);

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
