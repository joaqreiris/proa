// Proa — periodización: los modelos y las cuentas de una temporada.
//
// Lo que decide todo: una etapa tiene DOS ejes.
//
//   phase  en qué momento de la temporada está —pretemporada, competencia,
//          transición, vuelta de lesión—. Lo pone el calendario del deporte.
//   kind   qué le hace a la carga —acumulación, transformación, realización—.
//          Lo pone el modelo.
//
// Una acumulación en pretemporada y una en plena competencia se dibujan igual
// con un solo eje, y no se parecen en nada.
//
// Agregar un modelo es agregar una entrada en MODELS. Nada más: las pantallas
// leen de acá qué tipos existen y de qué color son.
(function () {
  'use strict';

  const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb || k;

  // Los tipos de etapa de cada modelo. El color no es decorativo: es lo que
  // permite leer un año de un vistazo, así que es fijo como los de la semana.
  const MODELS = {
    // Bloques de Issurin/Verkhoshansky. El más usado en deporte de equipo.
    atr: {
      key: 'atr', label: 'per.m.atr',
      kinds: [
        { k: 'accumulation',   label: 'per.k.accumulation',   color: 'var(--pr-ev-team)',     hint: 'per.k.accumulation.h' },
        { k: 'transformation', label: 'per.k.transformation', color: 'var(--pr-ev-meal)',     hint: 'per.k.transformation.h' },
        { k: 'realization',    label: 'per.k.realization',    color: 'var(--pr-ev-match)',    hint: 'per.k.realization.h' },
        { k: 'transition',     label: 'per.k.transition',     color: 'var(--pr-ev-commit)',   hint: 'per.k.transition.h' },
      ],
    },
    // Matveiev: de mucho volumen y poca intensidad a lo contrario, en rampa.
    linear: {
      key: 'linear', label: 'per.m.linear',
      kinds: [
        { k: 'hypertrophy', label: 'per.k.hypertrophy', color: 'var(--pr-ev-team)',   hint: 'per.k.hypertrophy.h' },
        { k: 'strength',    label: 'per.k.strength',    color: 'var(--pr-ev-gym)',    hint: 'per.k.strength.h' },
        { k: 'power',       label: 'per.k.power',       color: 'var(--pr-ev-match)',  hint: 'per.k.power.h' },
        { k: 'deload',      label: 'per.k.deload',      color: 'var(--pr-ev-commit)', hint: 'per.k.deload.h' },
      ],
    },
    // Ondulante: las cualidades rotan dentro de la semana en vez de por bloques.
    undulating: {
      key: 'undulating', label: 'per.m.undulating',
      kinds: [
        { k: 'high',   label: 'per.k.high',   color: 'var(--pr-ev-match)',  hint: 'per.k.high.h' },
        { k: 'medium', label: 'per.k.medium', color: 'var(--pr-ev-meal)',   hint: 'per.k.medium.h' },
        { k: 'low',    label: 'per.k.low',    color: 'var(--pr-ev-team)',   hint: 'per.k.low.h' },
        { k: 'deload', label: 'per.k.deload', color: 'var(--pr-ev-commit)', hint: 'per.k.deload.h' },
      ],
    },
    // Conjugado: todo se entrena siempre, rotando el énfasis.
    conjugate: {
      key: 'conjugate', label: 'per.m.conjugate',
      kinds: [
        { k: 'max_effort',     label: 'per.k.max_effort',     color: 'var(--pr-ev-match)',  hint: 'per.k.max_effort.h' },
        { k: 'dynamic_effort', label: 'per.k.dynamic_effort', color: 'var(--pr-ev-gym)',    hint: 'per.k.dynamic_effort.h' },
        { k: 'repetition',     label: 'per.k.repetition',     color: 'var(--pr-ev-team)',   hint: 'per.k.repetition.h' },
        { k: 'deload',         label: 'per.k.deload',         color: 'var(--pr-ev-commit)', hint: 'per.k.deload.h' },
      ],
    },
    // Sin modelo: las etapas las nombra el entrenador y elige su color.
    free: { key: 'free', label: 'per.m.free', kinds: [] },
  };

  // El otro eje. Estos no dependen del modelo: el calendario del deporte es el
  // mismo se periodice como se periodice.
  const PHASES = [
    { k: 'preseason',  label: 'per.p.preseason' },
    { k: 'inseason',   label: 'per.p.inseason' },
    { k: 'postseason', label: 'per.p.postseason' },
    { k: 'offseason',  label: 'per.p.offseason' },
    { k: 'return',     label: 'per.p.return' },
    { k: 'other',      label: 'per.p.other' },
  ];

  const modelOf = (plan) => MODELS[(plan && plan.model) || 'atr'] || MODELS.atr;
  const kindsOf = (plan) => modelOf(plan).kinds;
  const kindInfo = (plan, kind) =>
    kindsOf(plan).find(x => x.k === kind) || null;

  // El color de una etapa. Sin tipo —o en modo libre— queda el gris de siempre:
  // mejor un bloque sin color que un color que no significa nada.
  function blockColor(plan, block) {
    const info = kindInfo(plan, block && block.kind);
    return info ? info.color : 'var(--pr-fg-faint)';
  }

  function kindLabel(plan, kind) {
    const info = kindInfo(plan, kind);
    return info ? t(info.label, kind || '') : (kind || '');
  }

  const phaseLabel = (phase) => {
    const p = PHASES.find(x => x.k === phase);
    return p ? t(p.label, phase) : '';
  };

  // ── Fechas ────────────────────────────────────────────────────────────────
  // Todo en local, como el resto de Proa: parseYMD y nunca toISOString.
  const dias = (a, b) => Math.round((window.prWeek.parseYMD(b) - window.prWeek.parseYMD(a)) / 86400000);
  const semanasDe = (block) => Math.max(1, Math.round((dias(block.start_date, block.end_date) + 1) / 7));

  // La etapa que cubre un día. Si se pisan dos —no debería, pero nada lo
  // impide— gana la que empieza después: es la que se puso encima.
  function blockOn(blocks, ymd) {
    let out = null;
    for (const b of (blocks || [])) {
      if (ymd >= b.start_date && ymd <= b.end_date) {
        if (!out || b.start_date > out.start_date) out = b;
      }
    }
    return out;
  }

  // Las semanas del plan, de lunes a domingo, con su etapa y su carga real.
  //
  // La carga sale de events.au, que es lo que el atleta reportó: minutos por
  // RPE. Una semana sin partes cargados no vale cero, vale «sin dato» — y eso
  // se distingue, porque cero significa que no entrenó.
  function weeksOf(plan, blocks, events) {
    if (!plan) return [];
    const W = window.prWeek;
    const out = [];
    let lunes = W.mondayOf(plan.start_date);
    let n = 1;
    while (lunes <= plan.end_date && n < 120) {
      const domingo = W.addDays(lunes, 6);
      const enSemana = (events || []).filter(e => e.date >= lunes && e.date <= domingo);
      const conCarga = enSemana.filter(e => e.au != null);
      out.push({
        n,
        start: lunes,
        end: domingo,
        block: blockOn(blocks, lunes) || blockOn(blocks, domingo),
        sessions: enSemana.length,
        load: conCarga.length ? conCarga.reduce((s, e) => s + Number(e.au), 0) : null,
        reported: conCarga.length,
      });
      lunes = W.addDays(lunes, 7);
      n++;
    }
    return out;
  }

  // Lo planificado contra lo que pasó, para una etapa.
  function blockLoad(block, weeks) {
    const suyas = weeks.filter(w => w.block && w.block.id === block.id);
    const con = suyas.filter(w => w.load != null);
    const real = con.length ? con.reduce((s, w) => s + w.load, 0) : null;
    const objetivo = block.target_load == null ? null : Number(block.target_load);
    return {
      real, objetivo, semanas: suyas.length, conDato: con.length,
      // Sin objetivo no hay desvío: no se inventa una comparación.
      desvio: (real != null && objetivo) ? Math.round(((real - objetivo) / objetivo) * 100) : null,
    };
  }

  window.prPeriod = {
    MODELS, PHASES,
    modelOf, kindsOf, kindInfo, kindLabel, phaseLabel, blockColor,
    blockOn, weeksOf, blockLoad, semanasDe,
  };
})();
