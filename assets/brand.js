// Proa — marca y tema.
// Cargar TEMPRANO (sin defer) en el <head> de cada página: aplica el tema
// guardado antes del primer pintado, así no hay un parpadeo blanco al entrar
// en modo oscuro.
//
// La marca es una proa: dos planos en diagonal que cortan, sobre una línea de
// flotación. Cualquier elemento con data-brand-mark recibe el dibujo.

(function () {
  'use strict';

  var THEME_KEY  = 'pr_theme';
  var ACCENT_KEY = 'pr_accent';

  // Paleta de marca del entrenador. Los VALORES viven en proa.css, en los
  // bloques [data-accent="..."]: acá solo están los identificadores y cómo se
  // llaman. Un solo lugar con los colores.
  //
  // Ojo: esto es SOLO el color de marca. Los colores de los tipos de trabajo
  // (gimnasio, campo, partido…) no se eligen — son un idioma compartido, y si
  // cada entrenador los repinta, una captura de pantalla deja de entenderse.
  var ACCENTS = [
    { id: 'orange',   key: 'accent.orange' },
    { id: 'red',      key: 'accent.red' },
    { id: 'fuchsia',  key: 'accent.fuchsia' },
    { id: 'violet',   key: 'accent.violet' },
    { id: 'blue',     key: 'accent.blue' },
    { id: 'teal',     key: 'accent.teal' },
    { id: 'green',    key: 'accent.green' },
    { id: 'lime',     key: 'accent.lime' },
    { id: 'yellow',   key: 'accent.yellow' },
    { id: 'graphite', key: 'accent.graphite' }
  ];
  var DEFAULT_ACCENT = 'orange';

  function isAccent(id) {
    for (var i = 0; i < ACCENTS.length; i++) if (ACCENTS[i].id === id) return true;
    return false;
  }

  function currentAccent() {
    try {
      var v = localStorage.getItem(ACCENT_KEY);
      return isAccent(v) ? v : DEFAULT_ACCENT;
    } catch (e) { return DEFAULT_ACCENT; }
  }

  // remember=false para una vista previa que no debe pisar lo guardado.
  function applyAccent(id, remember) {
    if (!isAccent(id)) id = DEFAULT_ACCENT;
    document.documentElement.setAttribute('data-accent', id);
    if (remember === false) return id;
    try { localStorage.setItem(ACCENT_KEY, id); } catch (e) { /* navegación privada */ }
    return id;
  }

  var LOGO =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<path d="M12 2.5 20 17H4L12 2.5Z" fill="currentColor" opacity=".95"/>'
    + '<path d="M3 20.2c1.6 0 1.6 1.3 3.2 1.3s1.6-1.3 3.2-1.3 1.6 1.3 3.2 1.3'
    + ' 1.6-1.3 3.2-1.3 1.6 1.3 3.2 1.3" stroke="currentColor" stroke-width="1.6"'
    + ' stroke-linecap="round" opacity=".65"/>'
    + '</svg>';

  function currentTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { return 'light'; }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* navegación privada */ }
  }

  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return next;
  }

  function paint(root) {
    var els = (root || document).querySelectorAll('[data-brand-mark]');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = LOGO;
  }

  // Tema y color de marca ANTES del primer pintado. El color viene de la copia
  // guardada en el navegador, no de la base: esperar la consulta significaría
  // ver medio segundo de naranja y después el color del entrenador.
  applyTheme(currentTheme());
  applyAccent(currentAccent());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paint(); });
  } else {
    paint();
  }

  window.prBrand = {
    LOGO: LOGO,
    paint: paint,
    applyTheme: applyTheme,
    currentTheme: currentTheme,
    toggleTheme: toggleTheme,
    ACCENTS: ACCENTS,
    DEFAULT_ACCENT: DEFAULT_ACCENT,
    applyAccent: applyAccent,
    currentAccent: currentAccent,
    isAccent: isAccent
  };
})();
