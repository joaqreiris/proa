// Proa — el tablero de la semana de un atleta.
//
// Es la pantalla de trabajo: la grilla con lo que el atleta tiene ocupado en
// gris, los bloques planificados encima, y todo lo que se hace sobre ellos —
// crear, editar, copiar un día, copiar la semana, aplicarle una sesión a
// varios atletas, y el modal de recuperación.
//
// Vive acá y no dentro de una página porque su lugar es el PERFIL del atleta:
// la semana de Ana se mira donde está todo lo demás de Ana. La página «La
// semana» del menú es otra cosa — es la agenda del entrenador.
//
// El módulo se trae su propio HTML, incluidos los modales, para que la página
// que lo monta no tenga que cargar doscientas líneas de markup que no le
// pertenecen.
//
//   prWeekBoard.mount({ host, athlete })   athlete = { id, first_name, ... , timezone }
//   prWeekBoard.reload()
//
// LOS HORARIOS SON LOS DEL ATLETA. Un bloque se guarda con su hora de reloj:
// las 18:00 de Ana son las 18:00 en Montevideo, mire quien mire. Cuando el que
// mira está en otro huso, el tablero se lo aclara arriba y le muestra la
// traducción al lado de las horas — pero lo que se guarda no cambia nunca.

(function () {
  'use strict';

  const t = (k, fb, vars) => (window.PR_I18N ? window.PR_I18N.t(k, vars) : null) || fb;
  const esc = (s) => window.prEsc(s);
  const W = () => window.prWeek;
  const TZ = () => window.prTz;

  const BOARD = `
    <div class="wb-bar">
      <div class="wb-nav">
        <button class="pr-icon-btn" id="wb-prev" aria-label="Semana anterior"><i class="ti ti-chevron-left"></i></button>
        <span class="wb-range" id="wb-range"></span>
        <button class="pr-icon-btn" id="wb-next" aria-label="Semana siguiente"><i class="ti ti-chevron-right"></i></button>
        <button class="pr-btn is-sm is-ghost" id="wb-today" data-i18n="wk.today">Hoy</button>
      </div>
      <span class="pr-grow"></span>
      <button class="pr-btn is-sm is-secondary" id="wb-copy-day"><i class="ti ti-calendar-plus"></i><span data-i18n="wk.copyDay">Copiar día</span></button>
      <button class="pr-btn is-sm is-secondary" id="wb-copy"><i class="ti ti-copy"></i><span data-i18n="wk.copy">Copiar semana</span></button>
      <button class="pr-btn is-sm is-primary" id="wb-new"><i class="ti ti-plus"></i><span data-i18n="wk.new">Nuevo bloque</span></button>
    </div>

    <p class="wb-tz" id="wb-tz" hidden></p>

    <div class="wk">
      <div id="wb-scale"></div>
      <div id="wb-rows"></div>
    </div>

    <div class="wb-sum">
      <div class="is-accent"><b id="wb-n-blocks">0</b><span data-i18n="wk.blocks">Bloques</span></div>
      <div><b id="wb-n-hours">0 h</b><span data-i18n="wk.planned">Planificado</span></div>
      <div><b id="wb-n-free">0 h</b><span data-i18n="wk.free">Libre</span></div>
    </div>

    <div id="wb-legend"></div>`;

  const MODALS = `
    <div class="pr-modal-backdrop" id="m-ev" hidden>
      <div class="pr-modal" role="dialog" aria-modal="true" aria-labelledby="m-ev-title">
        <div class="pr-modal-head">
          <h2 id="m-ev-title" data-i18n="wk.new">Nuevo bloque</h2>
          <button class="pr-icon-btn is-flush" data-close aria-label="Cerrar"><i class="ti ti-x"></i></button>
        </div>
        <form id="f-ev">
          <div class="pr-modal-body">
            <div class="pr-modal-grid">
              <div class="pr-field">
                <label class="pr-label" for="e-type" data-i18n="wk.type">Tipo</label>
                <select class="pr-select" id="e-type"></select>
              </div>
              <div class="pr-field">
                <label class="pr-label" for="e-date" data-i18n="wk.date">Día</label>
                <input class="pr-input" id="e-date" type="date" required>
              </div>
            </div>
            <div class="pr-modal-grid">
              <div class="pr-field">
                <label class="pr-label" for="e-start" data-i18n="in.slot.from">Desde</label>
                <input class="pr-input" id="e-start" type="time">
              </div>
              <div class="pr-field">
                <label class="pr-label" for="e-end" data-i18n="in.slot.to">Hasta</label>
                <input class="pr-input" id="e-end" type="time">
              </div>
            </div>
            <p class="pr-hint wb-mine" id="e-mine" hidden></p>
            <div class="wb-parte" id="e-parte" hidden></div>
            <div class="pr-field">
              <label class="pr-label" for="e-title" data-i18n="wk.blockTitle">Título</label>
              <input class="pr-input" id="e-title" maxlength="80" data-i18n-ph="wk.titlePh" placeholder="Si lo dejas vacío se usa el tipo.">
            </div>
            <div class="pr-field">
              <label class="pr-label" for="e-location" data-i18n="wk.location">Lugar</label>
              <input class="pr-input" id="e-location" maxlength="80">
            </div>
            <div class="pr-field">
              <label class="pr-label" for="e-notes" data-i18n="wk.notes">Notas</label>
              <textarea class="pr-textarea" id="e-notes" rows="2" data-i18n-ph="wk.notesPh" placeholder="Lo que el atleta tiene que saber."></textarea>
            </div>
            <p class="pr-hint" id="ev-hint" hidden style="display:flex;gap:8px;align-items:flex-start;margin:0">
              <i class="ti ti-sparkles" style="color:var(--pr-accent);flex:none;margin-top:1px"></i>
              <span data-i18n="wk.suggested">Te propuse el primer hueco libre de ese día. Cámbialo si quieres.</span>
            </p>
            <p id="ev-msg" role="alert" hidden style="margin:0;color:var(--pr-danger);font:600 13px/1.45 var(--pr-font-sans)"></p>
          </div>
          <div class="pr-modal-foot">
            <button class="pr-btn is-danger is-sm" type="button" id="e-del" hidden><i class="ti ti-trash"></i></button>
            <button class="pr-btn is-ghost is-sm" type="button" id="e-dup" hidden title="" data-i18n-attr="title:wk.duplicate"><i class="ti ti-copy"></i></button>
            <button class="pr-btn is-ghost is-sm" type="button" id="e-rep" hidden title="" data-i18n-attr="title:wk.repeat"><i class="ti ti-repeat"></i></button>
            <button class="pr-btn is-ghost is-sm" type="button" id="e-share" hidden title="" data-i18n-attr="title:wk.toAthletes"><i class="ti ti-users-plus"></i></button>
            <a class="pr-btn is-secondary" id="e-open" href="#" hidden><i class="ti ti-list-details"></i><span data-i18n="wk.openSession">Abrir sesión</span></a>
            <span class="pr-grow"></span>
            <button class="pr-btn is-ghost" type="button" data-close data-i18n="common.cancel">Cancelar</button>
            <button class="pr-btn is-primary" type="submit"><i class="ti ti-check"></i><span data-i18n="common.save">Guardar</span></button>
          </div>
        </form>
      </div>
    </div>

    <div class="pr-modal-backdrop" id="m-rec" hidden>
      <div class="pr-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="m-rec-title">
        <div class="pr-modal-head">
          <div>
            <h2 id="m-rec-title" data-i18n="rc.title">Recuperación</h2>
            <span class="pr-mono" id="rec-sub"></span>
          </div>
          <button class="pr-icon-btn is-flush" data-close aria-label="Cerrar"><i class="ti ti-x"></i></button>
        </div>
        <div class="pr-modal-body">
          <div class="rc-list" id="rec-list"></div>
          <div>
            <span class="pr-eyebrow" style="display:block;margin-bottom:10px" data-i18n="rc.add">Añadir método</span>
            <div class="rc-grid" id="rec-grid"></div>
          </div>
        </div>
        <div class="pr-modal-foot">
          <span class="pr-hint pr-grow" data-i18n="rc.autoSave">Se guarda solo, al salir de cada campo.</span>
          <button class="pr-btn is-secondary" type="button" data-close data-i18n="common.close">Cerrar</button>
        </div>
      </div>
    </div>

    <div class="pr-modal-backdrop" id="m-cday" hidden>
      <div class="pr-modal" role="dialog" aria-modal="true" aria-labelledby="m-cday-title">
        <div class="pr-modal-head">
          <h2 id="m-cday-title" data-i18n="wk.copyDay">Copiar día</h2>
          <button class="pr-icon-btn is-flush" data-close aria-label="Cerrar"><i class="ti ti-x"></i></button>
        </div>
        <form id="f-cday">
          <div class="pr-modal-body">
            <p class="pr-hint" style="margin:0" data-i18n="wk.copyDayHint">Martes y jueves suelen ser el mismo trabajo. Cópialo en vez de rehacerlo.</p>
            <div class="pr-modal-grid">
              <div class="pr-field">
                <label class="pr-label" for="cd-from" data-i18n="wk.copyFromDay">Copiar el día</label>
                <select class="pr-select" id="cd-from"></select>
              </div>
              <div class="pr-field">
                <label class="pr-label" for="cd-to" data-i18n="wk.copyToDay">Al día</label>
                <input class="pr-input" id="cd-to" type="date" required>
              </div>
            </div>
            <label class="pr-hint" style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">
              <input type="checkbox" id="cd-replace" style="margin-top:2px">
              <span data-i18n="wk.copyDayReplace">Borrar lo que ya haya ese día. Sin marcar, se suma a lo que está.</span>
            </label>
            <p id="cday-msg" role="alert" hidden style="margin:0;color:var(--pr-danger);font:600 13px/1.45 var(--pr-font-sans)"></p>
          </div>
          <div class="pr-modal-foot">
            <button class="pr-btn is-ghost" type="button" data-close data-i18n="common.cancel">Cancelar</button>
            <button class="pr-btn is-primary" type="submit"><i class="ti ti-copy"></i><span data-i18n="wk.copyDo">Copiar</span></button>
          </div>
        </form>
      </div>
    </div>

    <div class="pr-modal-backdrop" id="m-share" hidden>
      <div class="pr-modal" role="dialog" aria-modal="true" aria-labelledby="m-share-title">
        <div class="pr-modal-head">
          <h2 id="m-share-title" data-i18n="wk.toAthletes">Aplicar a otros atletas</h2>
          <button class="pr-icon-btn is-flush" data-close aria-label="Cerrar"><i class="ti ti-x"></i></button>
        </div>
        <form id="f-share">
          <div class="pr-modal-body">
            <p class="pr-hint" id="share-lead" style="margin:0"></p>
            <div id="share-list" style="display:flex;flex-direction:column;gap:2px"></div>
            <div class="pr-field">
              <label class="pr-label" for="sh-date" data-i18n="wk.date">Día</label>
              <input class="pr-input" id="sh-date" type="date">
              <span class="pr-hint" data-i18n="wk.toAthletesDate">Si lo dejas vacío, va al mismo día.</span>
            </div>
            <p id="share-msg" role="alert" hidden style="margin:0;color:var(--pr-danger);font:600 13px/1.45 var(--pr-font-sans)"></p>
          </div>
          <div class="pr-modal-foot">
            <button class="pr-btn is-ghost" type="button" data-close data-i18n="common.cancel">Cancelar</button>
            <button class="pr-btn is-primary" type="submit"><i class="ti ti-users-plus"></i><span data-i18n="wk.apply">Aplicar</span></button>
          </div>
        </form>
      </div>
    </div>

    <div class="pr-modal-backdrop" id="m-rep" hidden>
      <div class="pr-modal" role="dialog" aria-modal="true" aria-labelledby="m-rep-title">
        <div class="pr-modal-head">
          <div>
            <h2 id="m-rep-title" data-i18n="wk.repeat">Repetir este bloque</h2>
            <span class="pr-mono" id="rep-sub"></span>
          </div>
          <button class="pr-icon-btn is-flush" data-close aria-label="Cerrar"><i class="ti ti-x"></i></button>
        </div>
        <form id="f-rep">
          <div class="pr-modal-body">
            <p class="pr-hint" style="margin:0" data-i18n="wk.repeatHint">Se copia entero, con sus ejercicios, a la misma hora de los días que elijas.</p>
            <div class="pr-field">
              <label class="pr-label" data-i18n="wk.repeatDays">Qué días</label>
              <div class="wb-days" id="rep-days"></div>
            </div>
            <div class="pr-field">
              <label class="pr-label" for="rep-weeks" data-i18n="wk.repeatWeeks">Durante cuántas semanas</label>
              <input class="pr-input" id="rep-weeks" type="number" inputmode="numeric" min="1" max="26" value="1" style="width:100px">
              <span class="pr-hint" data-i18n="wk.repeatWeeksHint">Contando esta. Con 4, queda cargado el mes.</span>
            </div>
            <p class="pr-hint" id="rep-count" style="margin:0"></p>
            <p id="rep-msg" role="alert" hidden style="margin:0;color:var(--pr-danger);font:600 13px/1.45 var(--pr-font-sans)"></p>
          </div>
          <div class="pr-modal-foot">
            <button class="pr-btn is-ghost" type="button" data-close data-i18n="common.cancel">Cancelar</button>
            <button class="pr-btn is-primary" type="submit"><i class="ti ti-repeat"></i><span data-i18n="wk.repeatDo">Repetir</span></button>
          </div>
        </form>
      </div>
    </div>

    <div class="pr-modal-backdrop" id="m-copy" hidden>
      <div class="pr-modal" role="dialog" aria-modal="true" aria-labelledby="m-copy-title">
        <div class="pr-modal-head">
          <h2 id="m-copy-title" data-i18n="wk.copy">Copiar semana</h2>
          <button class="pr-icon-btn is-flush" data-close aria-label="Cerrar"><i class="ti ti-x"></i></button>
        </div>
        <form id="f-copy">
          <div class="pr-modal-body">
            <p class="pr-hint" id="copy-lead"></p>
            <div class="pr-field">
              <label class="pr-label" for="c-to" data-i18n="wk.copyTo">Copiar a la semana del</label>
              <input class="pr-input" id="c-to" type="date" required>
            </div>
            <label class="pr-hint" style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">
              <input type="checkbox" id="c-replace" style="margin-top:2px">
              <span data-i18n="wk.copyReplace">Borrar lo que ya haya en la semana destino. Si lo dejas sin marcar, los bloques se suman a lo que ya está.</span>
            </label>
            <p id="copy-msg" role="alert" hidden style="margin:0;color:var(--pr-danger);font:600 13px/1.45 var(--pr-font-sans)"></p>
          </div>
          <div class="pr-modal-foot">
            <button class="pr-btn is-ghost" type="button" data-close data-i18n="common.cancel">Cancelar</button>
            <button class="pr-btn is-primary" type="submit" data-i18n="wk.copyDo">Copiar</button>
          </div>
        </form>
      </div>
    </div>`;

  // ── Estado ───────────────────────────────────────────────────────────────
  let athlete = null, athletes = [], monday = null;
  let slots = [], events = [], editingId = null;
  let recEvent = null, recItems = [], shareEvent = null;
  let mounted = false;

  const $ = (id) => document.getElementById(id);
  const athTz = () => (athlete && TZ().valid(athlete.timezone)) ? athlete.timezone : null;
  const fullName = (a) => `${a.first_name} ${a.last_name || ''}`.trim();

  // ── Datos ────────────────────────────────────────────────────────────────
  async function loadWeek() {
    const dates = W().weekDates(monday);

    const [sl, ev] = await Promise.all([
      window.sb.from('availability_slots')
        .select('weekday,start_time,end_time,kind,label').eq('athlete_id', athlete.id),
      window.sb.from('events')
        .select('id,date,start_time,end_time,type,title,notes,location,status,rpe,actual_min,athlete_note,au,done_at')
        .eq('athlete_id', athlete.id).gte('date', monday).lte('date', dates[6]).order('start_time')
    ]);
    if (sl.error) { window.prToast(sl.error.message, 'danger'); return; }
    if (ev.error) { window.prToast(ev.error.message, 'danger'); return; }

    slots = sl.data || [];
    events = ev.data || [];
    paint();
  }

  function paint() {
    const dates = W().weekDates(monday);
    W().render({ host: 'wb-rows', dates, slots, events, editable: true });

    const lang = (window.PR_I18N && window.PR_I18N.current) || 'es';
    const a = W().parseYMD(dates[0]), b = W().parseYMD(dates[6]);
    const fd = (d, withYear) => d.toLocaleDateString(lang,
      { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
    $('wb-range').textContent = `${fd(a)} – ${fd(b, a.getFullYear() !== b.getFullYear())}`;

    let mins = 0;
    events.forEach(e => {
      if (!e.start_time || !e.end_time) return;
      mins += W().toMin(e.end_time) - W().toMin(e.start_time);
    });
    $('wb-n-blocks').textContent = events.length;
    $('wb-n-hours').textContent = (Math.round(mins / 6) / 10) + ' h';
    $('wb-n-free').textContent = W().freeHours(slots) + ' h';

    paintTzNote();
  }

  // El aviso de huso solo aparece cuando hace falta: si el entrenador y el
  // atleta están en el mismo lado del mundo, no hay nada que aclarar.
  function paintTzNote() {
    const el = $('wb-tz');
    const tz = athTz(), mine = TZ().mine();
    if (!tz || tz === mine) { el.hidden = true; return; }
    const there = TZ().nowIn(tz), here = TZ().nowIn(mine);
    el.innerHTML = `<i class="ti ti-world-pin"></i><span>${esc(t('wk.tzNote',
      `Los horarios son los de ${athlete.first_name}, en ${TZ().city(tz)}. Allí son las ${there.hhmm}; para ti, las ${here.hhmm}.`,
      { name: athlete.first_name, city: TZ().city(tz), there: there.hhmm, here: here.hhmm }))}</span>`;
    el.hidden = false;
  }

  // ── Bloques ──────────────────────────────────────────────────────────────
  function openEvent(ev, date) {
    editingId = ev ? ev.id : null;
    const d = ev ? ev.date : (date || window.prToday());

    let sug = null;
    if (!ev) {
      const dates = W().weekDates(monday);
      const wd = dates.indexOf(d);
      if (wd >= 0) sug = W().firstFreeSlot(slots, events, d, wd, 60);
    }

    $('m-ev-title').textContent = t(ev ? 'wk.edit' : 'wk.new');
    $('e-type').value     = ev ? ev.type : 'gym';
    $('e-date').value     = d;
    $('e-start').value    = ev && ev.start_time ? W().hhmm(ev.start_time) : (sug ? sug.start : '');
    $('e-end').value      = ev && ev.end_time ? W().hhmm(ev.end_time) : (sug ? sug.end : '');
    $('e-title').value    = (ev && ev.title) || '';
    $('e-location').value = (ev && ev.location) || '';
    $('e-notes').value    = (ev && ev.notes) || '';
    $('e-del').hidden     = !ev;
    $('e-dup').hidden     = !ev;
    $('e-share').hidden   = !ev || athletes.length < 2;
    $('e-rep').hidden     = !ev;

    const openBtn = $('e-open');
    const dest = ev && (['gym', 'field'].includes(ev.type) ? 'Session.html'
                      : ev.type === 'meal' ? 'Meal.html'
                      : ev.type === 'recovery' ? 'recovery' : null);
    openBtn.hidden = !dest;
    if (dest) {
      openBtn.dataset.dest = dest;
      openBtn.href = dest === 'recovery' ? '#' : dest + '?event=' + ev.id;
      openBtn.querySelector('span').textContent = t(
        dest === 'recovery' ? 'rc.open' : ev.type === 'meal' ? 'wk.openMenu' : 'wk.openSession');
    }
    $('ev-msg').hidden  = true;
    $('ev-hint').hidden = !sug;
    paintMine();
    paintParte(ev);
    $('m-ev').hidden = false;
  }

  // Debajo de las horas, lo que esas horas son PARA MÍ. Se escribe la hora del
  // atleta porque es la que se guarda, y al lado la mía porque es la que me
  // dice si voy a estar despierto.
  function paintMine() {
    const el = $('e-mine');
    const tz = athTz(), mine = TZ().mine();
    const ymd = $('e-date').value, s = $('e-start').value;
    if (!tz || tz === mine || !ymd || !s) { el.hidden = true; return; }

    const e = $('e-end').value;
    const cs = TZ().convert(ymd, s, tz, mine);
    const ce = e ? TZ().convert(ymd, e, tz, mine) : null;
    const lang = (window.PR_I18N && window.PR_I18N.current) || 'es';
    const day = W().parseYMD(cs.ymd).toLocaleDateString(lang, { weekday: 'long', day: 'numeric' });

    el.innerHTML = `<i class="ti ti-clock-pin"></i><span>${esc(t('wk.yourTime',
      `Para ti: ${cs.hhmm}${ce ? ' – ' + ce.hhmm : ''} del ${day}.`,
      { time: cs.hhmm + (ce ? ' – ' + ce.hhmm : ''), day }))}</span>`;
    el.hidden = false;
  }

  // Lo que devolvió el atleta. Va aquí adentro y no en otra pantalla porque es
  // la respuesta a este bloque: se lee al lado de lo que se le había pedido.
  function paintParte(ev2) {
    const el = $('e-parte');
    if (!ev2 || (ev2.status !== 'done' && ev2.status !== 'skipped' && !ev2.athlete_note)) {
      el.hidden = true; return;
    }
    const bits = [];
    if (ev2.status === 'done') {
      bits.push(`<span class="pr-pill is-success"><i class="ti ti-check"></i>${esc(t('log.done', 'Hecho'))}</span>`);
      if (ev2.actual_min) bits.push(`<span class="pr-pill">${esc(ev2.actual_min + ' min')}</span>`);
      if (ev2.rpe) bits.push(`<span class="pr-pill">${esc(t('se.rpeShort', 'RPE') + ' ' + ev2.rpe)}</span>`);
      if (ev2.au)  bits.push(`<span class="pr-pill is-accent">${esc(t('log.auShort', ev2.au + ' AU', { n: ev2.au }))}</span>`);
    } else if (ev2.status === 'skipped') {
      bits.push(`<span class="pr-pill is-danger"><i class="ti ti-x"></i>${esc(t('log.skipped', 'No lo hizo'))}</span>`);
    }
    el.innerHTML = `<span class="pr-eyebrow">${esc(t('log.parte', 'Lo que contó'))}</span>
      <div class="wb-parte-pills">${bits.join('')}</div>
      ${ev2.athlete_note ? `<p>${esc(ev2.athlete_note)}</p>` : ''}`;
    el.hidden = false;
  }

  // ── Recuperación ─────────────────────────────────────────────────────────
  async function openRecovery(e) {
    recEvent = e;
    const lang = (window.PR_I18N && window.PR_I18N.current) || 'es';
    $('rec-sub').textContent =
      W().parseYMD(e.date).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
      + (e.start_time ? ' · ' + W().hhmm(e.start_time) : '');
    $('rec-grid').innerHTML = window.prRecovery.LIST.map(m => `
      <button type="button" class="rc-m" style="--rc:${window.prRecovery.color(m.id)}" data-add-m="${m.id}">
        <i class="ti ${m.icon}"></i><span>${esc(window.prRecovery.label(m.id))}</span>
      </button>`).join('');
    await loadRecovery();
    $('m-rec').hidden = false;
  }

  async function loadRecovery() {
    const { data, error } = await window.sb.from('recovery_items')
      .select('*').eq('event_id', recEvent.id).order('position');
    if (error) { window.prToast(error.message, 'danger'); return; }
    recItems = data || [];
    paintRecovery();
  }

  function paintRecovery() {
    const R = window.prRecovery;
    const host = $('rec-list');
    if (!recItems.length) {
      host.innerHTML = `<p class="pr-hint" style="margin:0 0 4px">${esc(t('rc.empty', 'Elige abajo qué le toca.'))}</p>`;
      return;
    }
    const FIELD = {
      temp_c:     ['rc.temp',    'number'],
      temp_hot_c: ['rc.tempHot', 'number'],
      cycles:     ['rc.cycles',  'number'],
      pressure:   ['rc.pressure', 'text']
    };
    host.innerHTML = recItems.map(it => {
      const m = R.get(it.method);
      const extra = m.fields.map(f => {
        const [key, type] = FIELD[f];
        return `<div class="rc-f${f === 'pressure' ? ' is-wide' : ''}">
          <label>${esc(t(key))}</label>
          <input class="pr-input" type="${type}" data-f="${f}" value="${esc(it[f] == null ? '' : it[f])}">
        </div>`;
      }).join('');
      return `<div class="rc-item" style="--rc:${R.color(it.method)}" data-rec="${it.id}">
        <i class="ti ${m.icon} head" data-grip tabindex="0" role="button"
           aria-label="${esc(t('rc.drag', 'Arrastra para reordenar'))}" title="${esc(t('rc.drag', 'Arrastra para reordenar'))}"></i>
        <div class="rc-body">
          <div class="rc-name">${esc(R.label(it.method))}</div>
          ${R.summary(it) ? `<div class="rc-sum">${esc(R.summary(it))}</div>` : ''}
          <div class="rc-fields">
            <div class="rc-f"><label data-i18n="se.min">min</label>
              <input class="pr-input" type="number" data-f="duration_min" value="${esc(it.duration_min == null ? '' : it.duration_min)}"></div>
            ${extra}
            <div class="rc-f is-notes"><label data-i18n="wk.notes">Notas</label>
              <input class="pr-input" data-f="notes" value="${esc(it.notes || '')}"></div>
          </div>
        </div>
        <button class="pr-icon-btn is-flush" data-del-rec="${it.id}" aria-label="${esc(t('se.delItem'))}"><i class="ti ti-x"></i></button>
      </div>`;
    }).join('');
    if (window.PR_I18N) window.PR_I18N.applyTo(host);
  }

  // ── Aplicar una sesión a otros atletas ───────────────────────────────────
  function openShare(ev2) {
    shareEvent = ev2;
    const others = athletes.filter(a => a.id !== athlete.id);
    if (!others.length) { window.prToast(t('wk.noOthers', 'No tienes otros atletas a quienes aplicárselo.'), 'danger'); return; }
    $('share-lead').textContent = t('wk.toAthletesLead', 'Se copia el bloque con todo su contenido.');
    $('share-list').innerHTML = others.map(a => `
      <label class="px-row" style="cursor:pointer">
        <input type="checkbox" value="${a.id}" style="margin-right:4px">
        <span class="pr-avatar">${esc(window.prInitials(fullName(a)))}</span>
        <span class="px-name">${esc(fullName(a))}</span>
      </label>`).join('');
    $('sh-date').value = '';
    $('share-msg').hidden = true;
    $('m-share').hidden = false;
  }

  // ── Enganches (se registran una sola vez) ────────────────────────────────
  function wire() {
    $('wb-rows').addEventListener('click', (e) => {
      const add = e.target.closest('[data-add-date]');
      if (add) { openEvent(null, add.dataset.addDate); return; }
      const ev = e.target.closest('[data-event]');
      if (ev) openEvent(events.find(x => x.id === ev.dataset.event));
    });

    // Arrastrar para mover; con Option, para copiar. La grilla ya sabe dónde
    // está cada bloque; hacerle abrir un modal para cambiar de día era pedirle
    // al entrenador que le explicara a la app algo que la app ya ve.
    window.prWeekDrag.enable({
      host: 'wb-rows',
      async onDrop({ id, date, start, end, copy }) {
        const { error } = await window.sb.rpc('move_event', {
          p_event: id, p_date: date, p_start: start, p_end: end, p_copy: !!copy
        });
        if (error) { window.prToast(error.message, 'danger'); await loadWeek(); return; }
        window.prToast(t(copy ? 'wk.copiedHere' : 'wk.moved', copy ? 'Copiado.' : 'Movido.'), 'success');
        monday = W().mondayOf(date);
        await loadWeek();
      }
    });

    $('wb-prev').addEventListener('click', () => { monday = W().addDays(monday, -7); loadWeek(); });
    $('wb-next').addEventListener('click', () => { monday = W().addDays(monday, 7); loadWeek(); });
    $('wb-today').addEventListener('click', () => { monday = W().mondayOf(window.prToday()); loadWeek(); });
    $('wb-new').addEventListener('click', () => openEvent(null, window.prToday()));

    ['e-date', 'e-start', 'e-end'].forEach(id =>
      $(id).addEventListener('change', paintMine));

    $('f-ev').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('ev-msg');
      msg.hidden = true;

      const start = $('e-start').value || null;
      const end   = $('e-end').value || null;
      if (start && end && W().toMin(end) <= W().toMin(start)) {
        msg.textContent = t('in.slot.errOrder', 'La hora de fin tiene que ser posterior a la de inicio.');
        msg.hidden = false; return;
      }

      const { data: { user } } = await window.sb.auth.getUser();
      const row = {
        athlete_id: athlete.id,
        date:       $('e-date').value,
        start_time: start, end_time: end,
        type:       $('e-type').value,
        title:      $('e-title').value.trim() || null,
        location:   $('e-location').value.trim() || null,
        notes:      $('e-notes').value.trim() || null
      };

      const q = editingId
        ? window.sb.from('events').update(row).eq('id', editingId)
        : window.sb.from('events').insert(Object.assign({ created_by: user ? user.id : null }, row));

      const { error } = await q;
      if (error) { msg.textContent = error.message; msg.hidden = false; return; }

      $('m-ev').hidden = true;
      monday = W().mondayOf(row.date);
      await loadWeek();
    });

    $('e-del').addEventListener('click', async () => {
      if (!editingId || !confirm(t('wk.confirmDelete', '¿Borrar este bloque?'))) return;
      const { error } = await window.sb.from('events').delete().eq('id', editingId);
      if (error) { window.prToast(error.message, 'danger'); return; }
      $('m-ev').hidden = true;
      await loadWeek();
    });

    $('e-dup').addEventListener('click', async () => {
      if (!editingId) return;
      const { error } = await window.sb.rpc('copy_event_to_athletes', {
        p_event: editingId, p_athletes: [athlete.id], p_date: null
      });
      if (error) { window.prToast(error.message, 'danger'); return; }
      $('m-ev').hidden = true;
      window.prToast(t('wk.duplicated', 'Bloque duplicado.'), 'success');
      await loadWeek();
    });

    $('e-share').addEventListener('click', () => {
      const id = editingId;
      $('m-ev').hidden = true;
      openShare(events.find(x => x.id === id));
    });

    $('e-open').addEventListener('click', (e) => {
      if (e.currentTarget.dataset.dest !== 'recovery') return;
      e.preventDefault();
      const id = editingId;
      $('m-ev').hidden = true;
      openRecovery(events.find(x => x.id === id));
    });

    // ── Recuperación ──
    $('m-rec').addEventListener('click', async (ev2) => {
      const add = ev2.target.closest('[data-add-m]');
      if (add) {
        const m = window.prRecovery.get(add.dataset.addM);
        const pos = recItems.length ? Math.max(...recItems.map(x => x.position)) + 1 : 0;
        const row = Object.assign({ event_id: recEvent.id, position: pos, method: m.id, duration_min: m.min }, m.def || {});
        const { error } = await window.sb.from('recovery_items').insert(row);
        if (error) { window.prToast(error.message, 'danger'); return; }
        await loadRecovery();
        await loadWeek();
        return;
      }
      const del = ev2.target.closest('[data-del-rec]');
      if (del) {
        const { error } = await window.sb.from('recovery_items').delete().eq('id', del.dataset.delRec);
        if (error) { window.prToast(error.message, 'danger'); return; }
        await loadRecovery();
        await loadWeek();
      }
    });

    $('m-rec').addEventListener('change', async (ev2) => {
      const el = ev2.target;
      const row = el.closest('[data-rec]');
      if (!row || !el.dataset.f) return;
      const f = el.dataset.f;
      const raw = el.value.trim();
      const numeric = ['duration_min', 'temp_c', 'temp_hot_c', 'cycles'].includes(f);
      const val = raw === '' ? null : (numeric ? Number(raw) : raw);
      if (numeric && raw !== '' && !Number.isFinite(val)) {
        window.prToast(t('se.numberOnly', 'Ahí va un número.'), 'danger'); return;
      }
      const { error } = await window.sb.from('recovery_items').update({ [f]: val }).eq('id', row.dataset.rec);
      if (error) { window.prToast(error.message, 'danger'); return; }
      await loadRecovery();
    });

    window.prSortable.rule({
      container: '#rec-list', item: '[data-rec]', handle: '[data-grip]',
      id: el => el.dataset.rec,
      async onDrop({ ids }) {
        const { data, error } = await window.sb.rpc('reorder', { p_kind: 'recovery', p_parent: recEvent.id, p_ids: ids });
        if (error || data !== ids.length) {
          window.prToast(error ? error.message : t('se.reorderFail', 'No se pudo guardar el orden.'), 'danger');
          await loadRecovery(); return;
        }
        recItems = ids.map(id => recItems.find(x => x.id === id)).filter(Boolean);
        paintRecovery();
      }
    });

    // ── Copiar un día ──
    $('wb-copy-day').addEventListener('click', () => {
      const dates = W().weekDates(monday);
      const lang = (window.PR_I18N && window.PR_I18N.current) || 'es';
      const withWork = dates.filter(d => events.some(e => e.date === d));
      if (!withWork.length) { window.prToast(t('wk.copyDayEmpty', 'Esta semana no tiene ningún día cargado.'), 'danger'); return; }

      $('cd-from').innerHTML = withWork.map(d => {
        const nEv = events.filter(e => e.date === d).length;
        const label = W().parseYMD(d).toLocaleDateString(lang, { weekday: 'long', day: 'numeric' });
        return `<option value="${d}">${esc(label)} · ${nEv}</option>`;
      }).join('');
      $('cd-to').value = W().addDays(withWork[0], 2);
      $('cday-msg').hidden = true;
      $('m-cday').hidden = false;
    });

    $('f-cday').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('cday-msg');
      msg.hidden = true;
      const from = $('cd-from').value, to = $('cd-to').value;
      if (!to) { msg.textContent = t('wk.copyDayPick', 'Elige el día de destino.'); msg.hidden = false; return; }
      if (from === to) { msg.textContent = t('wk.copyDaySame', 'Es el mismo día.'); msg.hidden = false; return; }

      const { data, error } = await window.sb.rpc('copy_day', {
        p_athlete_id: athlete.id, p_from: from, p_to: to, p_replace: $('cd-replace').checked
      });
      if (error) { msg.textContent = error.message; msg.hidden = false; return; }

      $('m-cday').hidden = true;
      window.prToast(t('wk.copiedDay', `${data} bloques copiados.`, { n: data }), 'success');
      monday = W().mondayOf(to);
      await loadWeek();
    });

    // ── Aplicar a otros atletas ──
    $('f-share').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('share-msg');
      msg.hidden = true;
      const ids = [...document.querySelectorAll('#share-list input:checked')].map(x => x.value);
      if (!ids.length) { msg.textContent = t('wk.pickAthletes', 'Elige al menos un atleta.'); msg.hidden = false; return; }

      const { data, error } = await window.sb.rpc('copy_event_to_athletes', {
        p_event: shareEvent.id, p_athletes: ids, p_date: $('sh-date').value || null
      });
      if (error) { msg.textContent = error.message; msg.hidden = false; return; }

      $('m-share').hidden = true;
      window.prToast(t('wk.applied', `Aplicado a ${data} atletas.`, { n: data }), 'success');
    });

    // ── Repetir un bloque ──
    // «Gimnasio martes y jueves durante un mes» es media planificación. Antes
    // había que hacerlo copiando de a uno; ahora se dice una vez.
    $('e-rep').addEventListener('click', () => {
      const id = editingId;
      $('m-ev').hidden = true;
      openRepeat(events.find(x => x.id === id));
    });

    $('rep-days').addEventListener('click', (e) => {
      const b = e.target.closest('[data-wd]');
      if (!b) return;
      b.classList.toggle('is-on');
      paintRepCount();
    });
    $('rep-weeks').addEventListener('input', paintRepCount);

    $('f-rep').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('rep-msg');
      msg.hidden = true;
      const dates = repDates();
      if (!dates.length) {
        msg.textContent = t('wk.repeatPick', 'Elige al menos un día.');
        msg.hidden = false; return;
      }

      // Una copia por fecha. Si alguna falla se avisa y se recarga: mejor ver
      // lo que quedó de verdad que un número que puede ser mentira.
      let n = 0;
      for (const d of dates) {
        const { error } = await window.sb.rpc('move_event', {
          p_event: repEvent.id, p_date: d,
          p_start: repEvent.start_time ? W().hhmm(repEvent.start_time) : null,
          p_end: repEvent.end_time ? W().hhmm(repEvent.end_time) : null,
          p_copy: true
        });
        if (error) { msg.textContent = error.message; msg.hidden = false; break; }
        n++;
      }
      $('m-rep').hidden = true;
      if (n) window.prToast(t('wk.repeated', n + ' copias creadas.', { n }), 'success');
      await loadWeek();
    });

    // ── Copiar la semana ──
    $('wb-copy').addEventListener('click', () => {
      if (!events.length) { window.prToast(t('wk.copyEmpty', 'Esta semana no tiene nada que copiar.'), 'danger'); return; }
      $('copy-lead').textContent = t('wk.copyLead', `Se copian los ${events.length} bloques de esta semana.`, { n: events.length });
      $('c-to').value = W().addDays(monday, 7);
      $('copy-msg').hidden = true;
      $('m-copy').hidden = false;
    });

    $('f-copy').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('copy-msg');
      msg.hidden = true;
      const to = W().mondayOf($('c-to').value);
      if (to === monday) { msg.textContent = t('wk.copySame', 'Esa es la misma semana.'); msg.hidden = false; return; }

      const { data, error } = await window.sb.rpc('copy_week', {
        p_athlete_id: athlete.id, p_from: monday, p_to: to, p_replace: $('c-replace').checked
      });
      if (error) { msg.textContent = error.message; msg.hidden = false; return; }

      $('m-copy').hidden = true;
      window.prToast(t('wk.copied', `${data} bloques copiados.`, { n: data }), 'success');
      monday = to;
      await loadWeek();
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target.classList.contains('pr-modal-backdrop')) {
        document.querySelectorAll('.pr-modal-backdrop').forEach(m => m.hidden = true);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.pr-modal-backdrop').forEach(m => m.hidden = true);
    });
  }

  // ── Repetir ──────────────────────────────────────────────────────────────
  let repEvent = null;

  function openRepeat(ev2) {
    if (!ev2) return;
    repEvent = ev2;
    const lang = (window.PR_I18N && window.PR_I18N.current) || 'es';
    const src = W().parseYMD(ev2.date);
    $('rep-sub').textContent = (ev2.title || t(W().EVENT_KEY[ev2.type] || 'ev.other'))
      + ' · ' + src.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });

    // El día del propio bloque viene marcado y no se puede desmarcar: repetir
    // «los martes» incluye el martes en el que ya está.
    const own = (src.getDay() + 6) % 7;
    $('rep-days').innerHTML = W().DAY_KEYS.map((k, i) => `
      <button type="button" class="wb-day${i === own ? ' is-on is-src' : ''}"
              data-wd="${i}"${i === own ? ' disabled' : ''}>${esc(t(k).slice(0, 3))}</button>`).join('');
    $('rep-weeks').value = 1;
    $('rep-msg').hidden = true;
    paintRepCount();
    $('m-rep').hidden = false;
    if (window.PR_I18N) window.PR_I18N.applyTo($('m-rep'));
  }

  // Las fechas que se van a crear. No incluye la del bloque original: esa ya
  // existe, y duplicarla encima sería dejarle dos iguales el mismo día.
  function repDates() {
    const weeks = Math.max(1, Math.min(26, Number($('rep-weeks').value) || 1));
    const picked = [...$('rep-days').querySelectorAll('.is-on')].map(b => Number(b.dataset.wd));
    const mon0 = W().mondayOf(repEvent.date);
    const out = [];
    for (let w = 0; w < weeks; w++) {
      for (const wd of picked) {
        const d = W().addDays(mon0, w * 7 + wd);
        if (d !== repEvent.date) out.push(d);
      }
    }
    return out;
  }

  function paintRepCount() {
    const n = repDates().length;
    $('rep-count').textContent = n
      ? t('wk.repeatCount', `Se van a crear ${n} copias.`, { n })
      : t('wk.repeatNone', 'Todavía no hay nada que crear.');
  }

  // ── Montaje ──────────────────────────────────────────────────────────────
  async function mount(opts) {
    athlete = opts.athlete;
    const host = typeof opts.host === 'string' ? $(opts.host) : opts.host;

    if (!mounted) {
      host.innerHTML = BOARD;
      document.body.insertAdjacentHTML('beforeend', MODALS);
      $('wb-scale').outerHTML = W().scaleHtml();
      $('wb-legend').outerHTML = W().eventLegendHtml();
      $('e-type').innerHTML = W().eventTypeOptions('gym');
      wire();
      mounted = true;
    }

    // Los demás atletas hacen falta para «aplicar a otros»; si no hay más de
    // uno, ese botón ni aparece.
    const wsId = await window.getWorkspaceId();
    const { data } = await window.sb.from('athletes')
      .select('id,first_name,last_name,timezone')
      .eq('workspace_id', wsId).neq('status', 'archived').order('first_name');
    athletes = data || [];

    monday = W().mondayOf(window.prToday());
    await loadWeek();
    if (window.PR_I18N) window.PR_I18N.applyTo(host);
  }

  window.prWeekBoard = { mount, reload: () => loadWeek() };
})();
