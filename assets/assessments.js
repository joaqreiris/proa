// Proa — los tests: qué se mide, cómo se mide y qué significa el número.
//
// Todo lo de acá está pensado para un atleta SOLO, con su teléfono y una cinta
// métrica. Lo que necesita plataforma de fuerza, células fotoeléctricas o un
// dinamómetro queda afuera a propósito: un test que no se puede tomar es un
// test que no se toma, y una batería llena de casilleros vacíos no dice nada.
//
// Cada test declara su unidad y hacia dónde está lo bueno. Nada más: la
// interpretación se calcula, no se guarda, y así el día que se corrija un
// umbral se corrige para todo lo ya medido.
(function () {
  'use strict';

  const t = (k, fb) => (window.PR_I18N ? window.PR_I18N.t(k) : null) || fb || k;

  // ── Cuánto tiene que cambiar un número para creerle ────────────────────────
  //
  // Un salto no da lo mismo dos días seguidos aunque el atleta esté idéntico:
  // la medición tiene su propio ruido. Por debajo de ese ruido, una diferencia
  // no es una mejora ni una caída, es la balanza.
  //
  // Los cortes de fatiga —10% para mirar, 15% para parar— son los mismos que
  // usa ClavaMetrics y los que sostiene la literatura de salto como marcador
  // neuromuscular: una caída sostenida de esa magnitud contra el propio basal
  // es la señal más barata que existe para no meter una sesión dura encima de
  // un atleta que no se recuperó.
  const CAIDA_VIGILAR = 10;
  const CAIDA_ALERTA  = 15;

  const FAMILIAS = [
    { k: 'jump',     label: 'as.f.jump' },
    { k: 'speed',    label: 'as.f.speed' },
    { k: 'strength', label: 'as.f.strength' },
    { k: 'endurance',label: 'as.f.endurance' },
    { k: 'mobility', label: 'as.f.mobility' },
    { k: 'health',   label: 'as.f.health' },
  ];

  // `fatiga` marca los que sirven para leer el estado del día contra el basal
  // propio. No todos sirven: la flexibilidad no cae porque uno entrenó ayer, y
  // tratarla como si cayera sería inventar una alarma.
  //
  // `porLado` son los que se miden de a un lado por vez. Ahí lo que importa no
  // es sólo el número sino la diferencia entre lados.
  const TESTS = [
    // ── Saltos ───────────────────────────────────────────────────────────────
    // `vuelo` marca los que se pueden cargar como tiempo de vuelo, que es lo
    // que devuelve MyJump: la altura sale de ahí y no se guardan las dos, o
    // habría dos números para la misma cosa y algún día no coincidirían.
    { k: 'cmj', fam: 'jump', unidad: 'cm', decimales: 1, mas: true, fatiga: true, vuelo: true,
      label: 'as.t.cmj', como: 'as.t.cmj.h', min: 5, max: 90, ref: 'as.r.cmj' },
    { k: 'sj', fam: 'jump', unidad: 'cm', decimales: 1, mas: true, fatiga: true, vuelo: true,
      label: 'as.t.sj', como: 'as.t.sj.h', min: 5, max: 90, ref: 'as.r.myjump' },
    { k: 'slcmj', fam: 'jump', unidad: 'cm', decimales: 1, mas: true, fatiga: true, porLado: true, vuelo: true,
      label: 'as.t.slcmj', como: 'as.t.slcmj.h', min: 3, max: 70, ref: 'as.r.myjump' },
    { k: 'broad_jump', fam: 'jump', unidad: 'cm', decimales: 0, mas: true, fatiga: true,
      label: 'as.t.broad_jump', como: 'as.t.broad_jump.h', min: 60, max: 380 },
    { k: 'triple_hop', fam: 'jump', unidad: 'cm', decimales: 0, mas: true, porLado: true,
      label: 'as.t.triple_hop', como: 'as.t.triple_hop.h', min: 100, max: 900, ref: 'as.r.hop' },

    // ── Velocidad ────────────────────────────────────────────────────────────
    // El sprint NO son tres tests sueltos. Los parciales son la entrada de uno
    // solo: de ellos sale el perfil fuerza-velocidad, que es lo que separa al
    // que empuja fuerte y se apaga del que arranca flojo y vuela al final.
    // Dos atletas pueden hacer el mismo tiempo en 30 m con perfiles opuestos,
    // y se entrenan distinto.
    { k: 'sprint', fam: 'speed', unidad: 's', decimales: 2, mas: false, fatiga: true,
      label: 'as.t.sprint', como: 'as.t.sprint.h', min: 0.5, max: 15,
      parciales: [5, 10, 15, 20, 30, 40],
      ref: 'as.r.samozino', perfil: true },
    { k: 'cod_505', fam: 'speed', unidad: 's', decimales: 2, mas: false, porLado: true,
      label: 'as.t.cod_505', como: 'as.t.cod_505.h', min: 1.5, max: 6, ref: 'as.r.cod' },

    // ── Fuerza ───────────────────────────────────────────────────────────────
    { k: 'pushups', fam: 'strength', unidad: 'reps', decimales: 0, mas: true,
      label: 'as.t.pushups', como: 'as.t.pushups.h', min: 0, max: 150 },
    { k: 'plank', fam: 'strength', unidad: 's', decimales: 0, mas: true,
      label: 'as.t.plank', como: 'as.t.plank.h', min: 0, max: 900 },
    { k: 'side_plank', fam: 'strength', unidad: 's', decimales: 0, mas: true, porLado: true,
      label: 'as.t.side_plank', como: 'as.t.side_plank.h', min: 0, max: 600 },
    { k: 'calf_raise', fam: 'strength', unidad: 'reps', decimales: 0, mas: true, porLado: true,
      label: 'as.t.calf_raise', como: 'as.t.calf_raise.h', min: 0, max: 80 },

    // ── Resistencia ──────────────────────────────────────────────────────────
    { k: 'cooper', fam: 'endurance', unidad: 'm', decimales: 0, mas: true, ref: 'as.r.cooper',
      label: 'as.t.cooper', como: 'as.t.cooper.h', min: 800, max: 4200 },
    { k: 'run_1000', fam: 'endurance', unidad: 's', decimales: 0, mas: false,
      label: 'as.t.run_1000', como: 'as.t.run_1000.h', min: 120, max: 900 },

    // ── Movilidad ────────────────────────────────────────────────────────────
    { k: 'sit_reach', fam: 'mobility', unidad: 'cm', decimales: 1, mas: true,
      label: 'as.t.sit_reach', como: 'as.t.sit_reach.h', min: -30, max: 45 },
    { k: 'ankle_lunge', fam: 'mobility', unidad: 'cm', decimales: 1, mas: true, porLado: true,
      label: 'as.t.ankle_lunge', como: 'as.t.ankle_lunge.h', min: 0, max: 25 },

    // ── Salud ────────────────────────────────────────────────────────────────
    // La frecuencia en reposo sube cuando el cuerpo no terminó de recuperarse,
    // y se toma sin moverse de la cama. Es el test más barato que existe.
    { k: 'rhr', fam: 'health', unidad: 'lpm', decimales: 0, mas: false, fatiga: true,
      label: 'as.t.rhr', como: 'as.t.rhr.h', min: 30, max: 120 },
  ];

  const byKey = {};
  TESTS.forEach(x => { byKey[x.k] = x; });
  const def = (key) => byKey[key] || null;
  const label = (key) => { const d = def(key); return d ? t(d.label, key) : key; };
  const famLabel = (k) => { const f = FAMILIAS.find(x => x.k === k); return f ? t(f.label, k) : k; };

  // ── Del tiempo de vuelo a la altura ────────────────────────────────────────
  //
  //   h = g · t² / 8
  //
  // Sale de que subir y bajar tardan lo mismo: el tiempo en el aire es dos
  // veces el de subida, y con caída libre h = g·(t/2)²/2. Es lo que calcula
  // MyJump por dentro (Balsalobre-Fernández et al., 2015), y el mismo método
  // de la alfombra de contacto de toda la vida (Bosco et al., 1983).
  //
  // Un aviso que vale la pena: el método asume que el atleta despega y aterriza
  // en la misma posición. Si recoge las piernas en el aire o cae con las
  // rodillas más flexionadas, el tiempo de vuelo se estira y la altura sale
  // más alta de lo que fue. Por eso el test dice que hay que caer igual que se
  // despegó — no es un detalle de forma, es de dónde sale el número.
  const G = 9.81;
  const alturaDeVuelo = (ms) => {
    const t = Number(ms) / 1000;
    return isFinite(t) && t > 0 ? (G * t * t / 8) * 100 : null;   // cm
  };
  const vueloDeAltura = (cm) => {
    const h = Number(cm) / 100;
    return isFinite(h) && h > 0 ? Math.sqrt(8 * h / G) * 1000 : null;  // ms
  };

  // Formatear con los decimales del test: un salto en 41.3 cm y un sprint en
  // 1.87 s no se escriben igual, y «41.30 cm» sugiere una precisión que la
  // cinta métrica no tiene.
  function fmt(key, v) {
    const d = def(key);
    if (v == null || !d) return '—';
    return Number(v).toFixed(d.decimales) + ' ' + t('as.u.' + d.unidad, d.unidad);
  }

  // ── El basal ───────────────────────────────────────────────────────────────
  //
  // Contra qué se compara el número de hoy. Se toma el PROMEDIO de las mejores
  // mediciones previas, no la mejor de todas: el récord personal se hizo un día
  // bueno y comparar todo contra el mejor día de la vida deja al atleta
  // permanentemente en rojo.
  //
  // Se piden al menos tres mediciones. Con una sola, «bajó un 12%» puede ser
  // simplemente que la primera vez la tomó mal.
  const MINIMO_BASAL = 3;

  function baseline(serie, hasta) {
    const previas = serie
      .filter(m => !hasta || m.date < hasta)
      .slice(-10);                       // el estado de hace un año no es basal
    if (previas.length < MINIMO_BASAL) return null;
    const vals = previas.map(m => Number(m.value));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // ── Qué significa el número ────────────────────────────────────────────────
  //
  // Devuelve el cambio contra el basal, siempre con el signo en términos de
  // RENDIMIENTO: negativo es peor, sea un salto que bajó o un sprint que subió.
  // Sin esa normalización, un tiempo mayor se leería como una mejora.
  function readingOn(key, serie, medicion) {
    const d = def(key);
    if (!d || !medicion) return null;
    const base = baseline(serie, medicion.date);
    if (base == null || !base) return { base: null, cambio: null, estado: 'none' };

    const v = Number(medicion.value);
    const cambio = d.mas ? (v - base) / base * 100 : (base - v) / base * 100;
    // Sólo los tests de fatiga disparan alarma. En los demás una caída puede
    // ser mil cosas y encender una luz roja por eso sería ruido.
    let estado = 'ok';
    if (d.fatiga && cambio <= -CAIDA_ALERTA) estado = 'alert';
    else if (d.fatiga && cambio <= -CAIDA_VIGILAR) estado = 'watch';
    else if (cambio >= CAIDA_VIGILAR) estado = 'up';
    return { base, cambio, estado };
  }

  // La diferencia entre lados de la última toma. Por encima del 10% se mira y
  // del 15% se hace algo: son los mismos cortes que la caída, y por la misma
  // razón —debajo de eso, la diferencia se la come el error de medir.
  function asymmetry(izq, der) {
    const a = Number(izq), b = Number(der);
    if (!isFinite(a) || !isFinite(b)) return null;
    const alto = Math.max(a, b);
    if (!alto) return null;
    const pct = Math.abs(a - b) / alto * 100;
    return {
      pct,
      lado: a === b ? null : (a > b ? 'L' : 'R'),
      estado: pct >= CAIDA_ALERTA ? 'alert' : pct >= CAIDA_VIGILAR ? 'watch' : 'ok',
    };
  }

  window.prAssess = {
    TESTS, FAMILIAS, CAIDA_VIGILAR, CAIDA_ALERTA, MINIMO_BASAL,
    def, label, famLabel, fmt, baseline, readingOn, asymmetry,
    alturaDeVuelo, vueloDeAltura,
    // Los parciales de un sprint se guardan con una clave por distancia, pero
    // son UN test: la pantalla los junta y de ahí sale el perfil.
    claveParcial: (m) => 'sprint_' + m,
    distanciaDe: (key) => (/^sprint_(\d+)$/.test(key) ? Number(RegExp.$1) : null),
  };
})();
