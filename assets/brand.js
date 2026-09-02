// Proa — marca y tema.
// Cargar TEMPRANO (sin defer) en el <head> de cada página: aplica el tema
// guardado antes del primer pintado, así no hay un parpadeo blanco al entrar
// en modo oscuro.
//
// La marca es una proa: dos planos en diagonal que cortan, sobre una línea de
// flotación. Cualquier elemento con data-brand-mark recibe el dibujo.

(function () {
  'use strict';

  var THEME_KEY = 'pr_theme';

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

  applyTheme(currentTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paint(); });
  } else {
    paint();
  }

  window.prBrand = { LOGO: LOGO, paint: paint, applyTheme: applyTheme, currentTheme: currentTheme, toggleTheme: toggleTheme };
})();
