// Proa — los métodos de recuperación.
//
// No son ejercicios: cada uno tiene sus propios parámetros. Un baño de
// contraste lleva ciclos y dos temperaturas; unas botas compresivas, presión y
// minutos; la crioterapia, tres minutos a menos ciento diez grados. Por eso
// cada método declara QUÉ campos muestra, y el resto no aparecen.
//
// Los valores por defecto son los de uso habitual, no un límite: se cambian
// siempre. Sirven para que agregar un método sea un clic y no un formulario.
//
//   prRecovery.LIST          → [{id, icon, min, fields, defaults}]
//   prRecovery.get(id)       → el método
//   prRecovery.label(id)     → nombre traducido
//   prRecovery.color(id)     → color
//   prRecovery.summary(item) → «12 °C · 10 min» para mostrar de un vistazo

(function () {
  'use strict';

  const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb || k;

  const LIST = [
    // Activos: el atleta se mueve.
    { id: 'mobility',   icon: 'ti-stretching',      c: 'mob',    min: 15, fields: [] },
    { id: 'stretching', icon: 'ti-yoga',            c: 'mob',    min: 10, fields: [] },
    { id: 'active',     icon: 'ti-bike',            c: 'act',    min: 20, fields: [] },
    { id: 'breathing',  icon: 'ti-lungs',           c: 'cool',   min: 10, fields: [] },

    // Manuales: alguien se los hace.
    { id: 'foam_roll',  icon: 'ti-massage',         c: 'myo',    min: 10, fields: [] },
    { id: 'massage',    icon: 'ti-hand-finger',     c: 'myo',    min: 30, fields: [] },
    { id: 'physio',     icon: 'ti-stethoscope',     c: 'assess', min: 45, fields: [] },

    // Térmicos: la temperatura es el parámetro.
    { id: 'cold',       icon: 'ti-snowflake',       c: 'mob',    min: 10, fields: ['temp_c'],                        def: { temp_c: 12 } },
    { id: 'sauna',      icon: 'ti-flame',           c: 'cond',   min: 15, fields: ['temp_c'],                        def: { temp_c: 80 } },
    { id: 'cryo',       icon: 'ti-temperature-minus', c: 'skills', min: 3, fields: ['temp_c'],                       def: { temp_c: -110 } },
    { id: 'contrast',   icon: 'ti-arrows-shuffle',  c: 'plyo',   min: 12, fields: ['temp_c', 'temp_hot_c', 'cycles'], def: { temp_c: 12, temp_hot_c: 38, cycles: 4 } },

    // Aparatos.
    { id: 'compression', icon: 'ti-device-watch',   c: 'field',  min: 20, fields: ['pressure'],                      def: { pressure: '60 mmHg' } },
    { id: 'electro',     icon: 'ti-bolt',           c: 'str',    min: 20, fields: [] },

    // Descanso.
    { id: 'nap',        icon: 'ti-moon',            c: 'cool',   min: 25, fields: [] }
  ];

  const MAP = Object.fromEntries(LIST.map(x => [x.id, x]));

  const get   = (id) => MAP[id] || MAP.mobility;
  const label = (id) => t('rc.' + id, id);
  const color = (id) => 'var(--pr-bt-' + get(id).c + ')';

  // Lo que se lee de un vistazo en la fila: los parámetros que tenga cargados.
  function summary(it) {
    const p = [];
    if (it.duration_min) p.push(it.duration_min + ' min');
    if (it.cycles) p.push(it.cycles + ' ' + t('rc.cycles', 'ciclos'));
    if (it.temp_c != null && it.temp_hot_c != null) p.push(it.temp_c + '° / ' + it.temp_hot_c + '°');
    else if (it.temp_c != null) p.push(it.temp_c + ' °C');
    if (it.pressure) p.push(it.pressure);
    return p.join(' · ');
  }

  window.prRecovery = { LIST, get, label, color, summary };
})();
