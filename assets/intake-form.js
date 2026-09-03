// Proa — la anamnesis, definida UNA sola vez.
//
// La usan dos pantallas: Intake.html (el entrenador) y athlete/Intake.html (el
// atleta desde su teléfono). Si el formulario estuviera copiado en las dos, a
// la segunda semana no coincidirían y un campo agregado en una faltaría en la
// otra. Acá está el esquema; las pantallas solo lo dibujan y lo guardan.
//
// Las ETIQUETAS son las mismas para los dos («Alergias» es «Alergias» lo lea
// quien lo lea). Lo único que cambia por voz son las notas de cada sección,
// que sí están dirigidas a alguien.
//
//   prIntake.render(host, 'coach' | 'athlete')
//   prIntake.fill(intake)
//   prIntake.collect()  → objeto listo para guardar

(function () {
  'use strict';

  const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb || k;
  const esc = (s) => window.prEsc ? window.prEsc(s) : String(s == null ? '' : s);

  // ── El esquema ─────────────────────────────────────────────────────────────
  // type: text · textarea · number · date · time · select · bool
  // cols: en cuántas columnas entra la fila (2 o 3)
  const SECTIONS = [
    {
      id: 'emergency', title: 'in.emergency',
      note: { coach: 'in.emergencyNote', athlete: 'in.emergencyNoteA' },
      rows: [
        { cols: 3, fields: [
          { id: 'emergency_name',     type: 'text', label: 'in.emName',     max: 80 },
          { id: 'emergency_phone',    type: 'tel',  label: 'in.emPhone',    max: 40 },
          { id: 'emergency_relation', type: 'text', label: 'in.emRelation', max: 40, ph: 'in.emRelationPh' }
        ]}
      ]
    },
    {
      id: 'health', title: 'in.health', strip: 'var(--pr-danger)', danger: true,
      note: { coach: 'in.healthNote', athlete: 'in.healthNoteA' },
      rows: [
        { cols: 2, fields: [
          { id: 'conditions', type: 'textarea', label: 'in.conditions', ph: 'in.conditionsPh', rows: 2 },
          { id: 'medication', type: 'textarea', label: 'in.medication', ph: 'in.medicationPh', rows: 2 }
        ]},
        { cols: 2, fields: [
          { id: 'allergies', type: 'textarea', label: 'in.allergies', ph: 'in.allergiesPh', rows: 2 },
          { id: 'surgeries', type: 'textarea', label: 'in.surgeries', ph: 'in.surgeriesPh', rows: 2 }
        ]},
        { cols: 1, fields: [
          { id: 'family_history', type: 'textarea', label: 'in.family', ph: 'in.familyPh', rows: 2 }
        ]},
        { cols: 3, fields: [
          { id: 'medical_clearance', type: 'bool', label: 'in.clearance',
            options: [['true', 'in.clearance.yes'], ['false', 'in.clearance.no']] },
          { id: 'medical_clearance_date', type: 'date', label: 'in.clearanceDate' },
          { id: 'smokes', type: 'select', label: 'in.smokes',
            options: [['no', 'in.sm.no'], ['occasional', 'in.sm.occ'], ['yes', 'in.sm.yes']] }
        ]},
        { cols: 3, fields: [
          { id: 'alcohol', type: 'select', label: 'in.alcohol',
            options: [['no', 'in.al.no'], ['occasional', 'in.al.occ'], ['frequent', 'in.al.freq']] }
        ]}
      ]
    },
    {
      id: 'injuries', title: 'in.history',
      note: { coach: null, athlete: 'in.historyNoteA' },
      rows: [
        { cols: 2, fields: [
          { id: 'injury_history', type: 'textarea', label: 'in.injuries', ph: 'in.injuriesPh', rows: 3 },
          { id: 'current_issues', type: 'textarea', label: 'in.current',  ph: 'in.currentPh',  rows: 3 }
        ]},
        { cols: 2, fields: [
          { id: 'pain_areas',     type: 'text', label: 'in.painAreas', ph: 'in.painAreasPh', max: 160 },
          { id: 'longest_layoff', type: 'text', label: 'in.layoff',    ph: 'in.layoffPh',    max: 120 }
        ]}
      ]
    },
    {
      id: 'goal', title: 'in.goal',
      note: { coach: null, athlete: 'in.goalNoteA' },
      rows: [
        { cols: 3, fields: [
          { id: 'main_goal', type: 'select', label: 'in.mainGoal', options: [
            ['performance', 'in.goal.performance'], ['return', 'in.goal.return'],
            ['body', 'in.goal.body'], ['health', 'in.goal.health'], ['other', 'in.goal.other']] },
          { id: 'target_date',       type: 'date',   label: 'in.targetDate' },
          { id: 'sessions_per_week', type: 'number', label: 'in.sessions', min: 0, max: 21, step: 1 }
        ]},
        { cols: 1, fields: [
          { id: 'key_event', type: 'text', label: 'in.keyEvent', ph: 'in.keyEventPh', max: 120 }
        ]},
        { cols: 1, fields: [
          { id: 'goals', type: 'textarea', label: 'in.goalsDetail', ph: 'in.goalsPh', rows: 3 }
        ]}
      ]
    },
    {
      id: 'training', title: 'in.training',
      rows: [
        { cols: 3, fields: [
          { id: 'training_years', type: 'number', label: 'in.years', min: 0, max: 60, step: 0.5 },
          { id: 'lifting_experience', type: 'select', label: 'in.lifting', options: [
            ['none', 'in.lift.none'], ['beginner', 'in.lift.beginner'],
            ['intermediate', 'in.lift.intermediate'], ['advanced', 'in.lift.advanced']] },
          { id: 'gym_access', type: 'select', label: 'in.gymAccess', options: [
            ['full', 'in.gym.full'], ['basic', 'in.gym.basic'],
            ['home', 'in.gym.home'], ['none', 'in.gym.none']] }
        ]},
        { cols: 2, fields: [
          { id: 'equipment',        type: 'textarea', label: 'in.equipment',       ph: 'in.equipmentPh',       rows: 2 },
          { id: 'current_training', type: 'textarea', label: 'in.currentTraining', ph: 'in.currentTrainingPh', rows: 2 }
        ]},
        { cols: 2, fields: [
          { id: 'avoid_exercises', type: 'textarea', label: 'in.avoid',       ph: 'in.avoidPh',       rows: 2 },
          { id: 'preferences',     type: 'textarea', label: 'in.preferences', ph: 'in.preferencesPh', rows: 2 }
        ]}
      ]
    },
    {
      id: 'nutrition', title: 'in.nutrition', strip: 'var(--pr-ev-meal)',
      rows: [
        { cols: 3, fields: [
          { id: 'meals_per_day', type: 'number', label: 'in.meals',        min: 1,  max: 10,  step: 1 },
          { id: 'target_weight', type: 'number', label: 'in.targetWeight', min: 25, max: 250, step: 0.1 },
          { id: 'hydration',     type: 'text',   label: 'in.hydration',    ph: 'in.hydrationPh', max: 80 }
        ]},
        { cols: 2, fields: [
          { id: 'diet_notes',        type: 'textarea', label: 'in.diet',             ph: 'in.dietPh',             rows: 2 },
          { id: 'food_restrictions', type: 'textarea', label: 'in.foodRestrictions', ph: 'in.foodRestrictionsPh', rows: 2 }
        ]},
        { cols: 1, fields: [
          { id: 'supplements', type: 'textarea', label: 'in.supplements', ph: 'in.supplementsPh', rows: 2 }
        ]}
      ]
    },
    {
      id: 'recovery', title: 'in.recovery', strip: 'var(--pr-ev-recovery)',
      rows: [
        { cols: 3, fields: [
          { id: 'bedtime',     type: 'time',   label: 'in.bedtime' },
          { id: 'waketime',    type: 'time',   label: 'in.waketime' },
          { id: 'sleep_hours', type: 'number', label: 'in.sleepHours', min: 0, max: 14, step: 0.5 }
        ]},
        { cols: 3, fields: [
          { id: 'sleep_quality', type: 'select', label: 'in.sleepQuality', options: [
            ['1','in.q1'],['2','in.q2'],['3','in.q3'],['4','in.q4'],['5','in.q5']] },
          { id: 'stress_level', type: 'select', label: 'in.stress', options: [
            ['1','in.s1'],['2','in.s2'],['3','in.s3'],['4','in.s4'],['5','in.s5']] },
          { id: 'naps', type: 'text', label: 'in.naps', ph: 'in.napsPh', max: 80 }
        ]},
        { cols: 1, fields: [
          { id: 'recovery_methods', type: 'textarea', label: 'in.recoveryMethods', ph: 'in.recoveryMethodsPh', rows: 2 }
        ]}
      ]
    },
    {
      id: 'measures', title: 'in.measures',
      rows: [
        { cols: 2, narrow: true, fields: [
          { id: 'height_cm', type: 'number', label: 'in.height', min: 80, max: 250, step: 0.5 },
          { id: 'weight_kg', type: 'number', label: 'in.weight', min: 25, max: 250, step: 0.1 }
        ]}
      ]
    },
    {
      id: 'notes', title: 'in.notes',
      rows: [
        { cols: 1, fields: [ { id: 'notes', type: 'textarea', ph: 'in.notesPh', rows: 3 } ] }
      ]
    }
  ];

  // Listas derivadas del esquema: no se mantienen a mano.
  const ALL = [];
  SECTIONS.forEach(s => s.rows.forEach(r => r.fields.forEach(f => ALL.push(f))));
  const FIELDS  = ALL.filter(f => f.type !== 'bool').map(f => f.id);
  const BOOLS   = ALL.filter(f => f.type === 'bool').map(f => f.id);
  const NUMERIC = ALL.filter(f => f.type === 'number').map(f => f.id);
  const TIMES   = ALL.filter(f => f.type === 'time').map(f => f.id);

  // ── Dibujo ─────────────────────────────────────────────────────────────────
  function fieldHtml(f) {
    const label = f.label
      ? `<label class="pr-label" for="${f.id}" data-i18n="${f.label}">${esc(t(f.label))}</label>` : '';
    const ph = f.ph ? ` data-i18n-ph="${f.ph}" placeholder="${esc(t(f.ph))}"` : '';
    let control;

    if (f.type === 'textarea') {
      control = `<textarea class="pr-textarea" id="${f.id}" rows="${f.rows || 2}"${ph}></textarea>`;
    } else if (f.type === 'select' || f.type === 'bool') {
      const opts = [`<option value="" data-i18n="in.choose">${esc(t('in.choose'))}</option>`]
        .concat(f.options.map(([v, k]) => `<option value="${v}" data-i18n="${k}">${esc(t(k))}</option>`));
      control = `<select class="pr-select" id="${f.id}">${opts.join('')}</select>`;
    } else if (f.type === 'number') {
      control = `<input class="pr-input" id="${f.id}" type="number"`
        + (f.min !== undefined ? ` min="${f.min}"` : '')
        + (f.max !== undefined ? ` max="${f.max}"` : '')
        + (f.step !== undefined ? ` step="${f.step}"` : '') + `>`;
    } else {
      const type = f.type === 'tel' ? 'tel' : (f.type === 'date' ? 'date' : (f.type === 'time' ? 'time' : 'text'));
      control = `<input class="pr-input" id="${f.id}" type="${type}"`
        + (f.max ? ` maxlength="${f.max}"` : '') + ph + `>`;
    }
    return `<div class="pr-field">${label}${control}</div>`;
  }

  function render(host, voice) {
    const el = (typeof host === 'string') ? document.getElementById(host) : host;
    if (!el) return;
    voice = voice === 'athlete' ? 'athlete' : 'coach';

    el.innerHTML = SECTIONS.map((s, i) => {
      const num = String(i + 1).padStart(2, '0');
      const noteKey = s.note && s.note[voice];
      const note = noteKey ? `<p class="in-sec-note" data-i18n="${noteKey}">${esc(t(noteKey))}</p>` : '';
      const body = s.rows.map(r =>
        `<div class="in-grid${r.cols === 3 ? ' is-3' : (r.cols === 1 ? ' is-1' : '')}${r.narrow ? ' is-narrow' : ''}">`
        + r.fields.map(fieldHtml).join('') + `</div>`).join('');

      return `<section class="in-sec${s.danger ? ' is-health' : ''}" data-sec="${s.id}">
        <div class="pr-card${s.strip ? ' has-strip' : ''}"${s.strip ? ` style="--pr-strip:${s.strip}"` : ''}>
          <div class="in-sec-head"><span class="in-sec-num">${num}</span>
            <h2 data-i18n="${s.title}">${esc(t(s.title))}</h2></div>
          ${note}
          <div class="in-fields">${body}</div>
        </div>
      </section>`;
    }).join('');

    if (window.PR_I18N && window.PR_I18N.applyTo) window.PR_I18N.applyTo(el);
  }

  // ── Cargar y guardar ───────────────────────────────────────────────────────
  function fill(intake) {
    if (!intake) return;
    FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el || intake[id] === null || intake[id] === undefined) return;
      // Las horas llegan como 08:00:00 y el campo de hora quiere 08:00.
      el.value = TIMES.includes(id) ? String(intake[id]).slice(0, 5) : intake[id];
    });
    BOOLS.forEach(id => {
      const el = document.getElementById(id);
      if (!el || intake[id] === null || intake[id] === undefined) return;
      el.value = intake[id] ? 'true' : 'false';
    });
  }

  function collect() {
    const row = {};
    FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const v = String(el.value || '').trim();
      // Vacío se guarda como nulo, no como cadena vacía: un cero y un «no
      // contestó» no son lo mismo para quien va a leer esto.
      row[id] = v === '' ? null : (NUMERIC.includes(id) ? Number(v) : v);
    });
    BOOLS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      row[id] = el.value === '' ? null : (el.value === 'true');
    });
    return row;
  }

  // Cuánto está completo, para poder mostrarle al atleta que le falta.
  function progress() {
    const total = FIELDS.length + BOOLS.length;
    let done = 0;
    FIELDS.concat(BOOLS).forEach(id => {
      const el = document.getElementById(id);
      if (el && String(el.value || '').trim() !== '') done++;
    });
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  window.prIntake = { SECTIONS, FIELDS, BOOLS, NUMERIC, TIMES, render, fill, collect, progress };
})();
