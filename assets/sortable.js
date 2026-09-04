// Proa — arrastrar para reordenar.
//
// Lo que se arrastra es la fila de verdad: se le pega al dedo una copia
// («el fantasma») y la fila original queda atenuada en la lista, moviéndose
// entre sus hermanas a medida que el dedo sube o baja. Así se ve dónde va a
// caer ANTES de soltar, que es lo único que hace que arrastrar no dé miedo.
//
// Decisiones que no son obvias:
//
//  · Se agarra por un TIRADOR, no por la fila entera. Adentro de cada fila hay
//    inputs que hay que poder seleccionar con el mouse: si toda la fila fuera
//    arrastrable, seleccionar «85 kg» para corregirlo movería el ejercicio.
//
//  · Hay un umbral de 5 px antes de empezar. Sin él, cada clic sobre el
//    tirador sería un arrastre de cero píxeles y se comería el clic.
//
//  · El teclado tiene su propio camino: con el tirador enfocado, las flechas
//    arriba y abajo mueven la fila un lugar. Arrastrar no puede ser la única
//    manera de reordenar.
//
//  · Solo vertical. Todas las listas de Proa son columnas, y suponerlo
//    simplifica mucho el cálculo de dónde cae.
//
//  · Las hermanas se acomodan con una animación FLIP (se mide dónde estaban,
//    se las manda de vuelta con transform y se las suelta): si saltaran de
//    golpe, sería imposible seguir qué se movió.
//
// Uso:
//
//   prSortable.rule({
//     container: '.se-items',      // dónde vive la lista
//     item:      '[data-item]',    // qué se arrastra
//     handle:    '.pr-grip',       // de dónde se agarra
//     group:     'items',          // opcional: permite soltar en OTRA lista igual
//     id:        el => el.dataset.item,
//     onDrop({ el, from, to, ids, fromIds }) { ... }   // ids = orden nuevo
//   });
//
// Las reglas se registran una vez por página y funcionan por delegación, así
// que repintar la lista con innerHTML no rompe nada.

(function () {
  'use strict';

  const RULES = [];
  const soft = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rule(r) { RULES.push(r); return r; }

  // ── Qué regla aplica ───────────────────────────────────────────────────
  // Un mismo tirador puede caer dentro de dos listas anidadas (el ejercicio
  // vive dentro del bloque). Gana la MÁS PROFUNDA: la fila más cercana al
  // tirador es la que el usuario quiso agarrar.
  function ruleFor(handleEl) {
    let best = null, depth = -1;
    for (const r of RULES) {
      if (!handleEl.closest(r.handle)) continue;
      const item = handleEl.closest(r.item);
      if (!item) continue;
      const box = item.closest(r.container);
      if (!box) continue;
      let d = 0;
      for (let n = item; n; n = n.parentElement) d++;
      if (d > depth) { depth = d; best = { r, item, box }; }
    }
    return best;
  }

  const idsOf = (r, box) => [...box.querySelectorAll(r.item)].map(r.id);

  // ── FLIP: que las hermanas se acomoden en vez de saltar ────────────────
  function snapshot(els) {
    const m = new Map();
    els.forEach(el => m.set(el, el.getBoundingClientRect().top));
    return m;
  }
  function play(m) {
    if (!soft()) return;
    m.forEach((was, el) => {
      const d = was - el.getBoundingClientRect().top;
      if (!d || Math.abs(d) > 2000) return;
      el.style.transition = 'none';
      el.style.transform = 'translateY(' + d + 'px)';
      requestAnimationFrame(() => {
        el.style.transition = 'transform var(--pr-dur-2) var(--pr-ease-out)';
        el.style.transform = '';
        el.addEventListener('transitionend', () => {
          el.style.transition = ''; el.style.transform = '';
        }, { once: true });
      });
    });
  }

  // ── Dónde cae ──────────────────────────────────────────────────────────
  // Se compara el dedo con la mitad de cada hermana: la primera cuya mitad
  // quedó por debajo del dedo es la que se corre para abajo.
  function place(el, box, r, y) {
    const sibs = [...box.querySelectorAll(r.item)].filter(x => x !== el && !x.contains(el));
    const before = sibs.find(s => {
      const b = s.getBoundingClientRect();
      return y < b.top + b.height / 2;
    });
    if (before) { if (before.previousElementSibling !== el) box.insertBefore(el, before); return; }
    const last = sibs[sibs.length - 1];
    // Sin hermanas, va al principio: al final quedaría después del cartel de
    // «este bloque está vacío», que es justo lo que deja de ser verdad.
    if (!last) { if (box.firstElementChild !== el) box.prepend(el); return; }
    if (last !== el && last.nextElementSibling !== el) last.after(el);
  }

  // La lista de destino cuando la regla permite mover entre listas.
  function boxUnder(r, x, y, current) {
    if (!r.group) return current;
    const all = [...document.querySelectorAll(r.container)];
    const hit = all.find(c => {
      const b = c.getBoundingClientRect();
      return x >= b.left && x <= b.right && y >= b.top - 10 && y <= b.bottom + 10;
    });
    return hit || current;
  }

  // ── El arrastre ────────────────────────────────────────────────────────
  let drag = null;

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const h = e.target.closest('[data-grip]');
    if (!h) return;
    const m = ruleFor(h);
    if (!m) return;

    drag = {
      r: m.r, el: m.item, from: m.box, to: m.box, handle: h,
      x0: e.clientX, y0: e.clientY, on: false, ghost: null, dx: 0, dy: 0,
      pid: e.pointerId, raf: 0, y: e.clientY, scroller: null,
      order0: idsOf(m.r, m.box).join()   // para saber, al soltar, si cambió algo
    };
    h.setPointerCapture(e.pointerId);
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.y = e.clientY;

    if (!drag.on) {
      if (Math.abs(e.clientY - drag.y0) + Math.abs(e.clientX - drag.x0) < 5) return;
      begin(e);
    }
    e.preventDefault();

    drag.ghost.style.transform =
      'translate(' + (e.clientX - drag.dx) + 'px,' + (e.clientY - drag.dy) + 'px)';

    const to = boxUnder(drag.r, e.clientX, e.clientY, drag.to);
    const snap = snapshot([
      ...drag.to.querySelectorAll(drag.r.item),
      ...to.querySelectorAll(drag.r.item)
    ]);
    drag.to = to;
    place(drag.el, drag.to, drag.r, e.clientY);
    play(snap);
  }, { passive: false });

  function begin(e) {
    const el = drag.el;
    const b = el.getBoundingClientRect();
    drag.on = true;
    drag.dx = drag.x0 - b.left;
    drag.dy = drag.y0 - b.top;

    const g = el.cloneNode(true);
    g.classList.add('pr-ghost');
    g.style.width = b.width + 'px';
    g.style.height = b.height + 'px';
    g.style.transform = 'translate(' + b.left + 'px,' + b.top + 'px)';
    // Los inputs clonados no deben quedar en el orden de tabulación.
    g.querySelectorAll('input,select,button,textarea,a').forEach(x => { x.tabIndex = -1; x.disabled = true; });
    document.body.appendChild(g);
    drag.ghost = g;

    el.classList.add('pr-drag-src');
    document.documentElement.classList.add('pr-sorting');
    drag.scroller = scrollerOf(el);
    drag.raf = requestAnimationFrame(autoscroll);
  }

  // El contenedor que scrollea de verdad: en un modal no es la ventana.
  function scrollerOf(el) {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ov = getComputedStyle(n).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && n.scrollHeight > n.clientHeight + 4) return n;
    }
    return null;
  }

  // Arrastrar hasta el borde de la pantalla y quedarse ahí tiene que seguir
  // moviendo la lista: si no, no se puede llevar un bloque de abajo del todo
  // hasta arriba.
  function autoscroll() {
    if (!drag || !drag.on) return;
    const s = drag.scroller;
    const top = s ? s.getBoundingClientRect().top : 0;
    const bot = s ? s.getBoundingClientRect().bottom : window.innerHeight;
    const zone = 64;
    let d = 0;
    if (drag.y < top + zone) d = -Math.ceil((top + zone - drag.y) / 5);
    else if (drag.y > bot - zone) d = Math.ceil((drag.y - (bot - zone)) / 5);
    if (d) {
      if (s) s.scrollTop += d; else window.scrollBy(0, d);
      place(drag.el, drag.to, drag.r, drag.y);
    }
    drag.raf = requestAnimationFrame(autoscroll);
  }

  async function end() {
    const d = drag;
    drag = null;
    if (!d) return;
    try { d.handle.releasePointerCapture(d.pid); } catch (err) {}
    if (!d.on) return;

    cancelAnimationFrame(d.raf);
    d.ghost.remove();
    d.el.classList.remove('pr-drag-src');
    document.documentElement.classList.remove('pr-sorting');

    const ids = idsOf(d.r, d.to);
    const fromIds = d.from === d.to ? null : idsOf(d.r, d.from);
    // Si nada cambió de lugar, no se le pide nada a la base.
    if (!fromIds && ids.join() === d.order0) return;
    await d.r.onDrop({ el: d.el, from: d.from, to: d.to, ids, fromIds });
  }

  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  // ── Teclado ────────────────────────────────────────────────────────────
  // Para llegar al tirador con el tabulador hace falta que sea enfocable, y
  // poner el atributo en cada plantilla es fácil de olvidar: si se olvida, no
  // se rompe nada visible y el teclado se queda afuera en silencio. Así que se
  // arregla solo. La etiqueta hablada sí va en el HTML, porque cambia según lo
  // que se esté arrastrando y eso la librería no lo puede inventar.
  function armGrips(node) {
    if (node.nodeType !== 1) return;
    const gs = node.matches('[data-grip]') ? [node] : [];
    gs.push(...node.querySelectorAll('[data-grip]'));
    gs.forEach(g => { if (!g.hasAttribute('tabindex')) g.tabIndex = 0; });
  }
  armGrips(document.documentElement);
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) armGrips(n);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Con el tirador enfocado, flecha arriba y flecha abajo mueven un lugar.
  document.addEventListener('keydown', async (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const h = e.target.closest && e.target.closest('[data-grip]');
    if (!h) return;
    const m = ruleFor(h);
    if (!m) return;
    e.preventDefault();

    const box = m.box;
    const sibs = [...box.querySelectorAll(m.r.item)];
    const i = sibs.indexOf(m.item);
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;

    const snap = snapshot(sibs);
    e.key === 'ArrowUp' ? sibs[j].before(m.item) : sibs[j].after(m.item);
    play(snap);
    await m.r.onDrop({ el: m.item, from: box, to: box, ids: idsOf(m.r, box), fromIds: null });
  });

  window.prSortable = { rule };
})();
