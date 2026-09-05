// Proa — la semana ocupada, como línea de tiempo.
//
// La usan tres pantallas: la anamnesis del entrenador, la del atleta y la ficha
// del atleta (en modo lectura). Estaba copiada en las tres, que es exactamente
// como se desincronizan las cosas.
//
// Cada día va de las 06:00 a las 24:00 — fuera de ahí no se planifica nada.
// Lo ocupado se pinta; lo que queda en blanco es donde de verdad se puede meter
// carga, que es la razón de ser de toda la anamnesis.
//
//   prWeek.render({ host, slots, editable })
//   prWeek.freeHours(slots)
//   prWeek.toMin('08:30')

(function () {
  'use strict';

  const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb || k;
  const esc = (s) => window.prEsc ? window.prEsc(s) : String(s == null ? '' : s);

  const H0 = 6, H1 = 24, SPAN = H1 - H0;
  const DAY_KEYS = ['day.mon','day.tue','day.wed','day.thu','day.fri','day.sat','day.sun'];
  const FALLBACK  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  const KIND_COLOR = {
    commitment:    'var(--pr-ev-commit)',
    team_training: 'var(--pr-ev-team)',
    match:         'var(--pr-ev-match)',
    unavailable:   'var(--pr-ev-rest)'
  };
  const KIND_KEY = {
    commitment: 'in.k.commitment', team_training: 'in.k.team',
    match: 'in.k.match', unavailable: 'in.k.unavailable'
  };

  // Los nueve tipos de trabajo del calendario. El color es fijo para todos los
  // entrenadores: en eso está el valor de poder leer una semana de un vistazo.
  const EVENT_TYPES = ['match','team_training','gym','field','recovery','meal','travel','rest','other'];
  const EVENT_COLOR = {
    match:         'var(--pr-ev-match)',
    team_training: 'var(--pr-ev-team)',
    gym:           'var(--pr-ev-gym)',
    field:         'var(--pr-ev-field)',
    recovery:      'var(--pr-ev-recovery)',
    meal:          'var(--pr-ev-meal)',
    travel:        'var(--pr-ev-travel)',
    rest:          'var(--pr-ev-rest)',
    other:         'var(--pr-ev-commit)'
  };
  const EVENT_KEY = {
    match: 'ev.match', team_training: 'ev.team', gym: 'ev.gym', field: 'ev.field',
    recovery: 'ev.recovery', meal: 'ev.meal', travel: 'ev.travel', rest: 'ev.rest', other: 'ev.other'
  };
  // Un icono fijo por tipo, del mismo juego que el resto de la app (Tabler).
  // En la semana el ancho del bloque es su duración, así que en media hora no
  // entra un nombre: el icono es lo que queda, y por eso no puede cambiar de
  // un entrenador a otro — se aprende igual que el color. La leyenda los
  // muestra juntos para que ese par se aprenda una sola vez.
  const EVENT_ICON = {
    match: 'ball-football', team_training: 'users', gym: 'barbell', field: 'run',
    recovery: 'massage', meal: 'tools-kitchen-2', travel: 'plane', rest: 'bed-flat',
    other: 'briefcase'
  };
  // Decorativo a propósito: el nombre del bloque ya va en el texto y en el
  // aria-label, y un lector de pantalla que además diga «pelota» solo agrega
  // ruido a lo que ya dijo.
  const icon = (e) =>
    `<i class="ti ti-${EVENT_ICON[e.type] || EVENT_ICON.other}" aria-hidden="true"></i>`;

  // ── Fechas ────────────────────────────────────────────────────────────────
  // Siempre en local. Construir con new Date(y, m-1, d) y NO con toISOString:
  // eso devuelve el día UTC, que va atrasado media jornada al este de Greenwich.
  function parseYMD(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(ymd, n) {
    const d = parseYMD(ymd);
    d.setDate(d.getDate() + n);
    return window.prYMD(d);
  }
  // El lunes de la semana de esa fecha. getDay() da 0 para domingo, y acá la
  // semana arranca el lunes: por eso el domingo retrocede seis días, no cero.
  function mondayOf(ymd) {
    const d = parseYMD(ymd);
    const shift = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - shift);
    return window.prYMD(d);
  }
  function weekDates(monday) {
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }

  const toMin = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + (m || 0); };
  const hhmm  = (v) => String(v).slice(0, 5);

  function scaleHtml() {
    return `<div class="wk-scale" aria-hidden="true">`
      + ['06','09','12','15','18','21'].map(h => `<span>${h}</span>`).join('') + `</div>`;
  }

  // Reparte en carriles los eventos que se pisan, para que ninguno tape a otro.
  function lanes(items) {
    const ends = [];
    items.forEach(it => {
      let i = 0;
      while (i < ends.length && ends[i] > it._a) i++;
      it._lane = i;
      ends[i] = it._b;
    });
    return Math.max(1, ends.length);
  }

  function render(opts) {
    const host = (typeof opts.host === 'string') ? document.getElementById(opts.host) : opts.host;
    if (!host) return;
    const slots = opts.slots || [];
    const editable = !!opts.editable;

    // Modo calendario: siete fechas concretas y una capa de eventos encima.
    if (opts.dates) return renderWeek(host, opts);

    host.innerHTML = DAY_KEYS.map((k, d) => {
      const blocks = slots.filter(s => s.weekday === d).map(s => {
        const a = Math.max(toMin(s.start_time), H0 * 60);
        const b = Math.min(toMin(s.end_time),   H1 * 60);
        if (b <= a) return '';
        const left  = ((a - H0 * 60) / (SPAN * 60)) * 100;
        const width = ((b - a) / (SPAN * 60)) * 100;
        const label = s.label || t(KIND_KEY[s.kind] || 'in.k.commitment', '');
        const title = `${label} · ${hhmm(s.start_time)}–${hhmm(s.end_time)}`
                    + (editable ? ` · ${t('in.slot.remove', 'Quitar')}` : '');
        const style = `left:${left}%;width:${width}%;background:${KIND_COLOR[s.kind] || KIND_COLOR.commitment};`
                    + `animation-delay:${d * 40}ms`;
        return editable
          ? `<button type="button" class="wk-slot pr-grow" data-slot="${s.id}" style="${style}" title="${esc(title)}">${esc(label)}</button>`
          : `<span class="wk-slot pr-grow" style="${style}" title="${esc(title)}">${esc(label)}</span>`;
      }).join('');

      const add = editable
        ? `<button type="button" class="wk-add" data-add="${d}" aria-label="${esc(t('in.slot.add','Añadir'))}"><i class="ti ti-plus"></i></button>`
        : '';

      return `<div class="wk-row">
        <span class="wk-day">${esc(t(k, FALLBACK[d]))}</span>
        <span class="wk-track">${blocks}</span>
        ${add}
      </div>`;
    }).join('');
  }

  // Horas libres de la semana entre las 06:00 y las 24:00.
  // Las franjas que se pisan se fusionan: si no, dos superpuestas restarían el
  // doble y el hueco parecería más chico de lo que es.
  function freeHours(slots) {
    let busy = 0;
    for (let d = 0; d < 7; d++) {
      const ranges = (slots || []).filter(s => s.weekday === d)
        .map(s => [Math.max(toMin(s.start_time), H0 * 60), Math.min(toMin(s.end_time), H1 * 60)])
        .filter(r => r[1] > r[0])
        .sort((x, y) => x[0] - y[0]);
      let end = -1;
      ranges.forEach(([a, b]) => {
        const from = Math.max(a, end);
        if (b > from) { busy += b - from; end = b; }
      });
    }
    return Math.round((7 * SPAN * 60 - busy) / 60);
  }

  // ── Calendario: disponibilidad de fondo + eventos encima ──────────────────
  function renderWeek(host, opts) {
    const dates    = opts.dates;
    const slots    = opts.slots || [];
    const events   = opts.events || [];
    const editable = !!opts.editable;
    const today    = window.prToday();
    const lang     = (window.PR_I18N && window.PR_I18N.current) || 'es';

    host.innerHTML = dates.map((ymd, d) => {
      // Capa de fondo: lo que ya tiene ocupado todas las semanas.
      const bg = slots.filter(s => s.weekday === d).map(s => {
        const a = Math.max(toMin(s.start_time), H0 * 60);
        const b = Math.min(toMin(s.end_time),   H1 * 60);
        if (b <= a) return '';
        return `<span class="wk-busy pr-grow" title="${esc(s.label || t(KIND_KEY[s.kind] || '', ''))}"
                 style="left:${((a - H0*60)/(SPAN*60))*100}%;width:${((b-a)/(SPAN*60))*100}%;
                 background:${KIND_COLOR[s.kind] || KIND_COLOR.commitment};animation-delay:${d * 40}ms"></span>`;
      }).join('');

      // Capa de arriba: lo planificado ese día.
      // Un bloque SIN horario («descanso», «comida libre») no se dibuja a una
      // hora inventada: va como una banda de todo el día abajo. Ponerlo a las
      // 06:00 lo haría parecer programado a esa hora, que es mentira.
      const day  = events.filter(e => e.date === ymd);
      const free = day.filter(e => !e.start_time);
      const timed = day.filter(e => e.start_time).map(e => {
        const a = Math.max(toMin(e.start_time), H0 * 60);
        const b = e.end_time ? Math.min(toMin(e.end_time), H1 * 60) : a + 60;
        return Object.assign({}, e, { _a: a, _b: Math.max(b, a + 20) });
      }).sort((x, y) => x._a - y._a);

      const laneCount = lanes(timed);
      // Si hay bloques sin hora, se les reserva la franja de abajo.
      const topH = free.length ? 66 : 100;

      const tag   = editable ? 'button' : 'span';
      const attrs = (e) => editable ? ` type="button" data-event="${e.id}"` : '';

      const evs = timed.map(e => {
        const left  = ((e._a - H0 * 60) / (SPAN * 60)) * 100;
        const width = ((e._b - e._a) / (SPAN * 60)) * 100;
        const label = e.title || t(EVENT_KEY[e.type] || 'ev.other', '');
        const h = topH / laneCount;
        const style = `left:${left}%;width:${width}%;top:${e._lane * h}%;height:${h}%;`
                    + `background:${EVENT_COLOR[e.type] || EVENT_COLOR.other};`
                    + `animation-delay:${120 + d * 40}ms`;
        return `<${tag} class="wk-ev pr-grow${e.status === 'done' ? ' is-done' : ''}"${attrs(e)} style="${style}"
                 title="${esc(label + ' · ' + hhmm(e.start_time))}" aria-label="${esc(label)}">${icon(e)}<span class="wk-ev-t">${esc(label)}</span></${tag}>`;
      }).join('')
      + free.map((e, i) => {
        const label = e.title || t(EVENT_KEY[e.type] || 'ev.other', '');
        const w = 100 / free.length;
        const style = `left:${i * w}%;width:${w}%;top:${topH}%;height:${100 - topH}%;`
                    + `background:${EVENT_COLOR[e.type] || EVENT_COLOR.other};`
                    + `animation-delay:${120 + d * 40}ms`;
        return `<${tag} class="wk-ev is-allday pr-grow${e.status === 'done' ? ' is-done' : ''}"${attrs(e)} style="${style}"
                 title="${esc(label + ' · ' + t('wk.noTime', 'sin horario'))}" aria-label="${esc(label)}">${icon(e)}<span class="wk-ev-t">${esc(label)}</span></${tag}>`;
      }).join('');

      const dt = parseYMD(ymd);
      const isToday = ymd === today;
      const add = editable
        ? `<button type="button" class="wk-add" data-add-date="${ymd}" aria-label="${esc(t('ev.add','Añadir'))}"><i class="ti ti-plus"></i></button>`
        : '';

      return `<div class="wk-row${isToday ? ' is-today' : ''}">
        <span class="wk-day is-date">
          <b>${esc(t(DAY_KEYS[d], FALLBACK[d]))}</b>
          <em>${dt.getDate()}</em>
        </span>
        <span class="wk-track wk-track-cal" data-date="${ymd}">${bg}${evs}</span>
        ${add}
      </div>`;
    }).join('');
  }

  // El primer hueco libre de un día, mirando lo que ya tiene ocupado (sus
  // horarios fijos) y lo que ya le planificaron. Es lo que hace que al tocar
  // el «+» no haya que adivinar: la app ya sabe dónde entra.
  //
  // Se busca a partir de las 08:00 porque casi nadie programa a las seis de la
  // mañana; si no hay nada desde ahí, se vuelve a probar desde el arranque.
  function firstFreeSlot(slots, events, ymd, weekday, minMinutes) {
    const need = minMinutes || 60;
    const busy = [];

    (slots || []).filter(s => s.weekday === weekday).forEach(s => {
      busy.push([toMin(s.start_time), toMin(s.end_time)]);
    });
    (events || []).filter(e => e.date === ymd && e.start_time).forEach(e => {
      busy.push([toMin(e.start_time), e.end_time ? toMin(e.end_time) : toMin(e.start_time) + 60]);
    });

    // Se fusiona lo que se pisa, si no un hueco entre dos solapadas sale falso.
    busy.sort((a, b) => a[0] - b[0]);
    const merged = [];
    busy.forEach(([a, b]) => {
      const last = merged[merged.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    });

    function search(from) {
      let cur = from;
      for (const [a, b] of merged) {
        if (b <= cur) continue;
        if (a - cur >= need) return [cur, a];
        cur = Math.max(cur, b);
      }
      return (H1 * 60 - cur >= need) ? [cur, H1 * 60] : null;
    }

    const gap = search(8 * 60) || search(H0 * 60);
    if (!gap) return null;
    const start = gap[0];
    // Se propone lo que se pida, o el hueco entero si es más corto.
    const end = Math.min(gap[1], start + need);
    const fmt = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    return { start: fmt(start), end: fmt(end) };
  }

  function eventTypeOptions(selected) {
    return EVENT_TYPES.map(k =>
      `<option value="${k}"${k === selected ? ' selected' : ''} data-i18n="${EVENT_KEY[k]}">${esc(t(EVENT_KEY[k]))}</option>`
    ).join('');
  }

  function eventLegendHtml() {
    return `<div class="pr-legend wk-legend">` + EVENT_TYPES.filter(k => k !== 'other').map(k =>
      `<span class="pr-legend-item"><i class="ti ti-${EVENT_ICON[k]} wk-legend-ico" style="background:${EVENT_COLOR[k]}" aria-hidden="true"></i>`
      + `<span data-i18n="${EVENT_KEY[k]}">${esc(t(EVENT_KEY[k]))}</span></span>`).join('') + `</div>`;
  }

  function dayOptions() {
    return DAY_KEYS.map((k, i) => `<option value="${i}">${esc(t(k, FALLBACK[i]))}</option>`).join('');
  }

  function legendHtml() {
    return `<div class="pr-legend wk-legend">` + Object.keys(KIND_KEY).map(k =>
      `<span class="pr-legend-item"><i style="background:${KIND_COLOR[k]}"></i>`
      + `<span data-i18n="${KIND_KEY[k]}">${esc(t(KIND_KEY[k]))}</span></span>`).join('') + `</div>`;
  }

  window.prWeek = {
    render, freeHours, dayOptions, legendHtml, scaleHtml, toMin, hhmm,
    H0, H1, SPAN, KIND_COLOR, KIND_KEY, DAY_KEYS,
    EVENT_TYPES, EVENT_COLOR, EVENT_KEY, EVENT_ICON, eventTypeOptions, eventLegendHtml,
    parseYMD, addDays, mondayOf, weekDates, firstFreeSlot
  };
})();
