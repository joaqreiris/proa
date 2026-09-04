// Proa — los once tipos de bloque.
//
// Un preparador no piensa «principal» o «accesorios»: piensa «fuerza»,
// «pliometría», «miofascial». Cada tipo trae su color, su icono y sus valores
// de arranque, que son los que hacen que crear un bloque sea elegir una tarjeta
// en vez de completar un formulario en blanco.
//
// Los valores por defecto vienen del planner de ClavaMetrics: son los que un
// entrenador ya tiene interiorizados.
//
//   prBlockTypes.LIST            → [{id, icon, ex, min, rpe}]
//   prBlockTypes.get(id)         → el tipo
//   prBlockTypes.label(id)       → nombre traducido
//   prBlockTypes.color(id)       → var(--pr-bt-…)
//   prBlockTypes.au(min, rpe)    → carga en unidades arbitrarias

(function () {
  'use strict';

  const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb || k;

  // ex/min/rpe son la propuesta al crear, no un límite: se cambian siempre.
  const LIST = [
    { id: 'warmup', icon: 'ti-flame',         ex: 4, min: 12, rpe: 3 },
    { id: 'myo',    icon: 'ti-massage',       ex: 3, min: 10, rpe: 2 },
    { id: 'mob',    icon: 'ti-stretching',    ex: 5, min: 14, rpe: 3 },
    { id: 'act',    icon: 'ti-yoga',          ex: 5, min: 18, rpe: 4 },
    { id: 'str',    icon: 'ti-barbell',       ex: 4, min: 30, rpe: 7 },
    { id: 'plyo',   icon: 'ti-bounce-right',  ex: 4, min: 18, rpe: 7 },
    { id: 'skills', icon: 'ti-ball-football', ex: 3, min: 25, rpe: 6 },
    { id: 'field',  icon: 'ti-soccer-field',  ex: 3, min: 30, rpe: 7 },
    { id: 'cond',   icon: 'ti-run',           ex: 3, min: 30, rpe: 8 },
    { id: 'cool',   icon: 'ti-droplet',       ex: 2, min:  8, rpe: 2 },
    { id: 'assess', icon: 'ti-target',        ex: 1, min: 12, rpe: 4 }
  ];

  const MAP = Object.fromEntries(LIST.map(x => [x.id, x]));

  const get   = (id) => MAP[id] || MAP.str;
  const label = (id) => t('bt.' + id, id);
  const color = (id) => 'var(--pr-bt-' + (MAP[id] ? id : 'str') + ')';

  // Carga en unidades arbitrarias: minutos × RPE. Es el sRPE de toda la vida,
  // y es lo que permite comparar una sesión de fuerza con una de campo.
  const au = (min, rpe) => (Number(min) || 0) * (Number(rpe) || 0);

  window.prBlockTypes = { LIST, get, label, color, au };
})();
