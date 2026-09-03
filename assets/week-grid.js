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

  const toMin = (v) => { const [h, m] = String(v).split(':').map(Number); return h * 60 + (m || 0); };
  const hhmm  = (v) => String(v).slice(0, 5);

  function scaleHtml() {
    return `<div class="wk-scale" aria-hidden="true">`
      + ['06','09','12','15','18','21'].map(h => `<span>${h}</span>`).join('') + `</div>`;
  }

  function render(opts) {
    const host = (typeof opts.host === 'string') ? document.getElementById(opts.host) : opts.host;
    if (!host) return;
    const slots = opts.slots || [];
    const editable = !!opts.editable;

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
        const style = `left:${left}%;width:${width}%;background:${KIND_COLOR[s.kind] || KIND_COLOR.commitment}`;
        return editable
          ? `<button type="button" class="wk-slot" data-slot="${s.id}" style="${style}" title="${esc(title)}">${esc(label)}</button>`
          : `<span class="wk-slot" style="${style}" title="${esc(title)}">${esc(label)}</span>`;
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

  function dayOptions() {
    return DAY_KEYS.map((k, i) => `<option value="${i}">${esc(t(k, FALLBACK[i]))}</option>`).join('');
  }

  function legendHtml() {
    return `<div class="pr-legend wk-legend">` + Object.keys(KIND_KEY).map(k =>
      `<span class="pr-legend-item"><i style="background:${KIND_COLOR[k]}"></i>`
      + `<span data-i18n="${KIND_KEY[k]}">${esc(t(KIND_KEY[k]))}</span></span>`).join('') + `</div>`;
  }

  window.prWeek = { render, freeHours, dayOptions, legendHtml, scaleHtml, toMin, H0, H1, SPAN, KIND_COLOR, KIND_KEY, DAY_KEYS };
})();
