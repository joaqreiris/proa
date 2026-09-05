// Proa — el parte del atleta.
//
// Lo que devuelve después de entrenar: si lo hizo, cuánto le duró de verdad y
// qué tan duro le resultó. Es la mitad que faltaba — hasta acá el entrenador
// escribía y nunca se enteraba de nada.
//
// Tres decisiones de diseño, porque este formulario se llena cansado y en el
// teléfono:
//
//  · TRES TOQUES Y LISTO. «Lo hice» → un número del 1 al 10 → guardar. Los
//    minutos vienen puestos con lo que estaba planificado, que nueve de cada
//    diez veces es lo que pasó; se corrigen solo si cambió.
//  · EL ESFUERZO ES UNA FILA DE BOTONES, no un desplegable ni un deslizador.
//    Con el pulgar, elegir «8» tiene que ser un toque, y el número elegido se
//    tiene que ver sin apuntar.
//  · CADA NÚMERO DICE LO QUE SIGNIFICA. «7» no quiere decir nada; «7 — duro»
//    sí. Sin la palabra al lado, cada atleta usa su propia escala y los
//    números dejan de poder compararse.
//
// El atleta NO tiene permiso para escribir en `events`: no puede cambiar su
// plan. Todo esto pasa por la función athlete_log_event, que es la única
// puerta y solo deja tocar las cuatro columnas del parte.
//
//   prLog.open(event, onSaved)

(function () {
  'use strict';

  const t = (k, fb, vars) => (window.PR_I18N ? window.PR_I18N.t(k, vars) : null) || fb;
  const esc = (s) => window.prEsc(s);
  const W = () => window.prWeek;

  // La escala de esfuerzo percibido. Las palabras importan tanto como los
  // números: son lo que hace que el 7 de hoy signifique lo mismo que el de la
  // semana pasada.
  const RPE = [
    [1,  'log.rpe1'], [2,  'log.rpe2'], [3,  'log.rpe3'], [4,  'log.rpe4'], [5,  'log.rpe5'],
    [6,  'log.rpe6'], [7,  'log.rpe7'], [8,  'log.rpe8'], [9,  'log.rpe9'], [10, 'log.rpe10']
  ];

  const HTML = `
    <div class="pr-modal-backdrop" id="m-log" hidden>
      <div class="pr-modal" role="dialog" aria-modal="true" aria-labelledby="m-log-title">
        <div class="pr-modal-head">
          <div>
            <h2 id="m-log-title" data-i18n="log.title">¿Cómo te fue?</h2>
            <span class="pr-mono" id="log-sub"></span>
          </div>
          <button class="pr-icon-btn is-flush" data-close aria-label="Cerrar"><i class="ti ti-x"></i></button>
        </div>
        <div class="pr-modal-body">

          <div class="lg-did">
            <button type="button" class="lg-choice" data-did="done">
              <i class="ti ti-check"></i><span data-i18n="log.did">Lo hice</span>
            </button>
            <button type="button" class="lg-choice" data-did="skipped">
              <i class="ti ti-x"></i><span data-i18n="log.didnt">No pude</span>
            </button>
          </div>

          <div id="log-detail" hidden>
            <div class="pr-field">
              <label class="pr-label" data-i18n="log.howHard">Qué tan duro te resultó</label>
              <div class="pr-rpe lg-rpe" id="log-rpe"></div>
              <span class="pr-hint" id="log-rpe-word">&nbsp;</span>
            </div>

            <div class="pr-field">
              <label class="pr-label" for="log-min" data-i18n="log.howLong">Cuánto duró</label>
              <div class="lg-min">
                <input class="pr-input" id="log-min" type="number" inputmode="numeric" min="0" max="600">
                <span data-i18n="se.min">min</span>
                <span class="pr-pill" id="log-au" hidden></span>
              </div>
            </div>
          </div>

          <div class="pr-field">
            <label class="pr-label" for="log-note" data-i18n="log.note">Algo para contarle</label>
            <textarea class="pr-textarea" id="log-note" rows="2" data-i18n-ph="log.notePh"
                      placeholder="Molestias, cómo te sentiste, lo que no pudiste hacer…"></textarea>
          </div>

          <p id="log-msg" role="alert" hidden style="margin:0;color:var(--pr-danger);font:600 13px/1.45 var(--pr-font-sans)"></p>
        </div>
        <div class="pr-modal-foot">
          <button class="pr-btn is-ghost is-sm" type="button" id="log-clear" hidden data-i18n="log.clear">Borrar el parte</button>
          <span class="pr-grow"></span>
          <button class="pr-btn is-ghost" type="button" data-close data-i18n="common.cancel">Cancelar</button>
          <button class="pr-btn is-primary" type="button" id="log-save"><i class="ti ti-check"></i><span data-i18n="common.save">Guardar</span></button>
        </div>
      </div>
    </div>`;

  let ev = null, onSaved = null, did = null, rpe = null, ready = false;
  const $ = (id) => document.getElementById(id);

  function build() {
    if (ready) return;
    document.body.insertAdjacentHTML('beforeend', HTML);

    $('log-rpe').innerHTML = RPE.map(([n]) =>
      `<button type="button" data-rpe="${n}">${n}</button>`).join('');

    $('log-rpe').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rpe]');
      if (!b) return;
      rpe = Number(b.dataset.rpe);
      paintRpe();
    });

    $('m-log').addEventListener('click', (e) => {
      const c = e.target.closest('[data-did]');
      if (!c) return;
      did = c.dataset.did;
      paintDid();
    });

    $('log-min').addEventListener('input', paintAu);
    $('log-save').addEventListener('click', () => save(false));
    $('log-clear').addEventListener('click', () => save(true));

    // El modal se cierra solo: las pantallas del atleta no tienen otros
    // modales de los que colgarse.
    $('m-log').addEventListener('click', (e) => {
      if (e.target.closest('[data-close]') || e.target === $('m-log')) $('m-log').hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('m-log').hidden = true;
    });

    ready = true;
  }

  function paintDid() {
    document.querySelectorAll('#m-log [data-did]').forEach(b =>
      b.classList.toggle('is-on', b.dataset.did === did));
    // Si no lo hizo, preguntarle cuánto le costó no tiene sentido.
    $('log-detail').hidden = did !== 'done';
    paintAu();
  }

  function paintRpe() {
    document.querySelectorAll('#log-rpe [data-rpe]').forEach(b =>
      b.classList.toggle('is-on', Number(b.dataset.rpe) === rpe));
    const row = RPE.find(([n]) => n === rpe);
    $('log-rpe-word').textContent = row ? t(row[1]) : ' ';
    paintAu();
  }

  // La carga se muestra en vivo: el atleta ve que sus dos datos se convierten
  // en algo, y no en un formulario que se traga números.
  function paintAu() {
    const min = Number($('log-min').value);
    const el = $('log-au');
    if (did !== 'done' || !rpe || !Number.isFinite(min) || min <= 0) { el.hidden = true; return; }
    el.textContent = t('log.au', `${min * rpe} de carga`, { n: min * rpe });
    el.hidden = false;
  }

  async function save(clear) {
    const msg = $('log-msg');
    msg.hidden = true;

    if (!clear && !did) {
      msg.textContent = t('log.pickDid', 'Decime primero si lo hiciste.');
      msg.hidden = false; return;
    }

    const min = Number($('log-min').value);
    const body = clear
      ? { p_event: ev.id, p_status: 'planned', p_rpe: null, p_min: null, p_note: null }
      : {
          p_event: ev.id,
          p_status: did,
          p_rpe: did === 'done' && rpe ? rpe : null,
          p_min: did === 'done' && Number.isFinite(min) && min > 0 ? Math.round(min) : null,
          p_note: $('log-note').value.trim() || null
        };

    const { error } = await window.sb.rpc('athlete_log_event', body);
    if (error) { msg.textContent = error.message; msg.hidden = false; return; }

    $('m-log').hidden = true;
    window.prToast(t(clear ? 'log.cleared' : 'log.saved', clear ? 'Parte borrado.' : 'Anotado. Gracias.'), 'success');
    if (onSaved) await onSaved();
  }

  function open(e, cb) {
    build();
    ev = e; onSaved = cb;
    did = e.status === 'done' || e.status === 'skipped' ? e.status : null;
    rpe = e.rpe || null;

    const lang = (window.PR_I18N && window.PR_I18N.current) || 'es';
    const name = e.title || t(W().EVENT_KEY[e.type] || 'ev.other', '');
    $('log-sub').textContent = name + ' · ' +
      W().parseYMD(e.date).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });

    // Los minutos arrancan con lo planificado: casi siempre es lo que pasó.
    const planned = (e.start_time && e.end_time)
      ? W().toMin(e.end_time) - W().toMin(e.start_time) : null;
    $('log-min').value = e.actual_min != null ? e.actual_min : (planned || '');
    $('log-note').value = e.athlete_note || '';
    $('log-clear').hidden = !(e.status === 'done' || e.status === 'skipped');

    paintDid();
    paintRpe();
    $('log-msg').hidden = true;
    $('m-log').hidden = false;
    if (window.PR_I18N) window.PR_I18N.applyTo($('m-log'));
  }

  window.prLog = { open, RPE };
})();
