// Proa — mover bloques arrastrándolos en la semana.
//
// Cambiar un entrenamiento de día era abrirlo, tocar la fecha, tocar la hora y
// guardar. Ahora se agarra y se lleva. Con Option (Alt) apretado no se mueve:
// se copia, con todo lo que tenga adentro.
//
// Lo que hace que arrastrar sea usable y no adivinanza:
//
//  · SE VE DÓNDE VA A CAER. Mientras se arrastra hay un hueco punteado en el
//    día y la hora de destino, y encima un cartel con la hora nueva. Sin eso,
//    soltar es apostar.
//  · CAE DE A CUARTOS DE HORA. Nadie planifica a las 18:07. El imán a 15
//    minutos es lo que hace que la mano no tenga que ser precisa.
//  · NO SE SALE DEL DÍA. Un bloque de 90 minutos no puede empezar a las 23:30:
//    el destino se recorta para que entre entero entre las 06:00 y las 24:00.
//  · SE AGARRA POR DONDE SE TOCÓ. El bloque no salta a ponerse bajo el dedo;
//    mantiene el punto donde lo agarraste, que es lo que hace que el imán se
//    sienta preciso.
//  · UN CLIC SIGUE SIENDO UN CLIC. Hay un umbral de 6 px antes de empezar, y
//    después de arrastrar se traga el clic para no abrir el bloque encima.
//
// Los bloques sin horario («descanso», «comida libre») se pueden mover de día
// pero no de hora: no tienen una hora que cambiar.
//
//   prWeekDrag.enable({ host, onDrop })
//   onDrop({ id, date, start, end, copy })   → devolver una promesa

(function () {
  'use strict';

  const SNAP = 15;                       // minutos
  const W = () => window.prWeek;
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = (min) => pad(Math.floor(min / 60)) + ':' + pad(min % 60);

  let drag = null, wired = false;

  function enable(opts) {
    const host = typeof opts.host === 'string' ? document.getElementById(opts.host) : opts.host;
    if (!host) return;
    host.__onDrop = opts.onDrop;
    if (wired) return;
    wired = true;

    document.addEventListener('pointerdown', (e) => onDown(e, host), true);
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });
    // Se traga el clic que viene después de arrastrar: si no, al soltar se
    // abriría el bloque encima del movimiento recién hecho.
    document.addEventListener('click', (e) => {
      if (!drag || !drag.moved) return;
      e.stopPropagation(); e.preventDefault();
      drag = null;
    }, true);
  }

  function onDown(e, host) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = e.target.closest('.wk-ev[data-event]');
    if (!el || !host.contains(el)) return;

    const track = el.closest('.wk-track');
    if (!track) return;

    drag = {
      host, el, track,
      id: el.dataset.event,
      allday: el.classList.contains('is-allday'),
      x0: e.clientX, y0: e.clientY, pid: e.pointerId,
      moved: false, ghost: null, drop: null, tag: null,
      // Cuántos minutos hay entre el borde izquierdo del bloque y el dedo: es
      // lo que mantiene el agarre donde se tocó.
      grabMin: 0, lenMin: 60, target: null
    };

    const r = el.getBoundingClientRect(), tr = track.getBoundingClientRect();
    const perPx = (W().SPAN * 60) / tr.width;
    drag.lenMin = Math.round(r.width * perPx);
    drag.grabMin = Math.round((e.clientX - r.left) * perPx);
    drag.dx = e.clientX - r.left;
    drag.dy = e.clientY - r.top;
    drag.w = r.width; drag.h = r.height;
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;

    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 6) return;
      begin();
    }
    e.preventDefault();

    drag.ghost.style.transform =
      'translate(' + (e.clientX - drag.dx) + 'px,' + (e.clientY - drag.dy) + 'px)';
    drag.ghost.classList.toggle('is-copy', !!e.altKey);

    const track = trackUnder(e.clientX, e.clientY) || drag.track;
    const tr = track.getBoundingClientRect();
    const perPx = (W().SPAN * 60) / tr.width;

    let start = W().H0 * 60;
    if (!drag.allday) {
      start = W().H0 * 60 + (e.clientX - tr.left) * perPx - drag.grabMin;
      start = Math.round(start / SNAP) * SNAP;
      // Que entre entero en el día: ni antes de las 06:00 ni pasadas las 24:00.
      start = Math.max(W().H0 * 60, Math.min(start, W().H1 * 60 - drag.lenMin));
    }

    drag.target = { date: track.dataset.date, start, track };
    paintDrop(track, start, e.altKey);
  }

  function begin() {
    drag.moved = true;
    const el = drag.el;
    const r = el.getBoundingClientRect();

    const g = el.cloneNode(true);
    g.className = 'wk-ev wk-drag';
    g.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;'
      + 'width:' + r.width + 'px;height:' + r.height + 'px;'
      + 'background:' + getComputedStyle(el).backgroundColor + ';'
      + 'transform:translate(' + r.left + 'px,' + r.top + 'px)';
    document.body.appendChild(g);
    drag.ghost = g;

    el.classList.add('is-moving');
    document.documentElement.classList.add('wk-dragging');

    drag.drop = document.createElement('span');
    drag.drop.className = 'wk-drop';
    // El cartel va al body y no dentro del hueco: la pista recorta lo que se
    // sale (overflow:hidden) y el cartel vive justo arriba del borde.
    drag.tag = document.createElement('span');
    drag.tag.className = 'wk-drop-tag';
    document.body.appendChild(drag.tag);
  }

  function trackUnder(x, y) {
    for (const tr of drag.host.querySelectorAll('.wk-track')) {
      const r = tr.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom && x >= r.left - 60 && x <= r.right + 60) return tr;
    }
    return null;
  }

  // El hueco punteado y el cartel con la hora nueva.
  function paintDrop(track, start, copy) {
    if (drag.drop.parentElement !== track) track.appendChild(drag.drop);
    const total = W().SPAN * 60;
    if (drag.allday) {
      drag.drop.style.cssText = 'left:0;width:100%;top:66%;height:34%';
    } else {
      drag.drop.style.cssText =
        'left:' + ((start - W().H0 * 60) / total) * 100 + '%;'
        + 'width:' + (drag.lenMin / total) * 100 + '%;top:0;height:100%';
    }
    drag.drop.classList.toggle('is-copy', !!copy);

    const lang = (window.PR_I18N && window.PR_I18N.current) || 'es';
    const day = W().parseYMD(track.dataset.date)
      .toLocaleDateString(lang, { weekday: 'short', day: 'numeric' });
    drag.tag.textContent = drag.allday
      ? day
      : day + ' · ' + hhmm(start) + '–' + hhmm(start + drag.lenMin);
    drag.tag.classList.toggle('is-copy', !!copy);
    const dr = drag.drop.getBoundingClientRect();
    drag.tag.style.transform = 'translate(' + Math.round(dr.left) + 'px,' + Math.round(dr.top - 26) + 'px)';
  }

  async function onUp(e) {
    if (!drag || !drag.moved) { drag = null; return; }

    const d = drag;
    const copy = !!e.altKey;
    cleanup();

    const same = d.target && d.target.date === d.track.dataset.date;
    const startNow = d.allday ? null : hhmm(d.target.start);
    if (!d.target || (same && !copy && startNow === startOf(d.el))) { drag = null; return; }

    const fn = d.host.__onDrop;
    if (fn) {
      await fn({
        id: d.id,
        date: d.target.date,
        start: startNow,
        end: d.allday ? null : hhmm(d.target.start + d.lenMin),
        copy
      });
    }
    // `drag` se limpia en el manejador de clic, que corre después de este.
    setTimeout(() => { drag = null; }, 0);
  }

  // La hora con la que arrancó, para no mandar un cambio que no cambia nada.
  function startOf(el) {
    const m = /(\d{2}:\d{2})/.exec(el.getAttribute('title') || '');
    return m ? m[1] : null;
  }

  function cleanup() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    if (drag.drop) drag.drop.remove();
    if (drag.tag) drag.tag.remove();
    drag.el.classList.remove('is-moving');
    document.documentElement.classList.remove('wk-dragging');
  }

  function cancel() {
    if (!drag) return;
    cleanup();
    drag = null;
  }

  window.prWeekDrag = { enable };
})();
