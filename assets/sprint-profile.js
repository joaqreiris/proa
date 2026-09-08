// Proa — el perfil fuerza-velocidad de un sprint.
//
// MÉTODO: Samozino P, Rabita G, Dorel S, Slawinski J, Peyrot N, Saez de
// Villarreal E, Morin JB (2016). «A simple method for measuring power, force,
// velocity properties, and mechanical effectiveness in sprint running».
// Scandinavian Journal of Medicine & Science in Sports, 26(6), 648–658.
//
// Portado del que ya usa ClavaMetrics, que a su vez sigue el artículo paso a
// paso. Se valida contra plataforma de fuerza y radar, y es el que hace por
// dentro MySprint (Romero-Franco et al., 2017, Eur J Sport Sci): por eso los
// parciales tomados con el teléfono sirven de entrada.
//
// QUÉ RESPONDE, que es lo que no dicen tres tiempos sueltos. Dos atletas
// pueden correr los 30 metros en el mismo tiempo con perfiles opuestos: uno
// que empuja fuerte y se apaga, y otro que arranca flojo y vuela al final.
// Se entrenan distinto, y sin separar fuerza de velocidad no hay forma de
// saber cuál es cuál.
//
//   F0    la fuerza horizontal que podría aplicar a velocidad cero: la
//         arrancada, los primeros metros.
//   V0    la velocidad teórica a la que ya no puede aplicar fuerza: el techo.
//   Pmax  la potencia máxima, que sale de las dos: F0·V0/4.
//   RFmax cuánta de toda la fuerza que produce va hacia adelante en vez de
//         hacia el piso. Es técnica de carrera, no motor.
//   DRF   cuánto se le cae esa orientación a medida que gana velocidad.
//
// Cálculo puro: no toca la base, no toca el DOM. Así se puede probar solo.
(function (root) {
  'use strict';

  const R_AIRE = 287.058;  // constante del aire seco, J/(kg·K)
  const G = 9.81;
  const CD = 0.9;          // coeficiente de arrastre (Samozino/Arsac)

  // Densidad del aire con la temperatura y la presión del día (gas ideal).
  // Importa poco en 30 metros, pero es parte del método y sale gratis.
  function densidadAire(tempC, presion_kPa) {
    return (presion_kPa * 1000) / (R_AIRE * (tempC + 273.15));
  }

  // Área frontal del corredor (Samozino 2016, siguiendo a Arsac & Locatelli
  // 2002): la superficie corporal de Du Bois por la fracción frontal, 0.266.
  function areaFrontal(altura_m, masa_kg) {
    return 0.2025 * Math.pow(altura_m, 0.725) * Math.pow(masa_kg, 0.425) * 0.266;
  }

  // ── Paso 1: ajustar v(t) = vmax·(1 − e^(−t/τ)) a los parciales ────────────
  //
  // La posición modelada es x(t) = vmax·(t + τ·e^(−t/τ) − τ).
  //
  // Con τ FIJO, x(t) es lineal en vmax, así que el vmax de mínimos cuadrados
  // tiene forma cerrada: vmax = Σ(x·g) / Σ(g²). Eso reduce un ajuste de dos
  // parámetros a buscar un solo número. Se barre τ en grilla gruesa para
  // encajonar el mínimo y se afina por sección áurea: determinista, sin
  // depender de ningún solver.
  function ajustar(parciales) {
    const xs = parciales.map(s => Number(s.distancia));
    const ts = parciales.map(s => Number(s.tiempo));

    function enTau(tau) {
      let sxg = 0, sgg = 0;
      for (let i = 0; i < ts.length; i++) {
        const g = ts[i] + tau * Math.exp(-ts[i] / tau) - tau;
        sxg += xs[i] * g;
        sgg += g * g;
      }
      const vmax = sgg > 0 ? sxg / sgg : 0;
      let sse = 0;
      for (let i = 0; i < ts.length; i++) {
        const g = ts[i] + tau * Math.exp(-ts[i] / tau) - tau;
        const r = xs[i] - vmax * g;
        sse += r * r;
      }
      return { vmax, sse };
    }

    let mejor = { tau: 0.8, sse: Infinity, vmax: 0 };
    for (let tau = 0.2; tau <= 2.5; tau += 0.005) {
      const e = enTau(tau);
      if (e.sse < mejor.sse) mejor = { tau, sse: e.sse, vmax: e.vmax };
    }

    const phi = (Math.sqrt(5) - 1) / 2;
    let a = mejor.tau - 0.005, b = mejor.tau + 0.005;
    let c = b - phi * (b - a), d = a + phi * (b - a);
    let fc = enTau(c).sse, fd = enTau(d).sse;
    for (let k = 0; k < 60; k++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = enTau(c).sse; }
      else         { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = enTau(d).sse; }
    }
    const tau = (a + b) / 2;
    const fin = enTau(tau);
    return { vmax: fin.vmax, tau, sse: fin.sse };
  }

  // Recta de mínimos cuadrados y = m·x + b.
  function recta(xs, ys) {
    const n = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { m, b: (sy - m * sx) / n };
  }

  // ── El perfil ─────────────────────────────────────────────────────────────
  // parciales : [{ distancia (m), tiempo (s) }, ...] acumulados desde la salida.
  // masa (kg), altura (m). El artículo pide cuatro o cinco parciales; con
  // menos, el ajuste exponencial no tiene con qué y el número saldría igual,
  // pero mintiendo.
  function perfil(parciales, masa, altura, opts) {
    const o = opts || {};
    const tempC = o.tempC != null ? o.tempC : 20;
    const presion = o.presion_kPa != null ? o.presion_kPa : 101.325;

    const pts = (parciales || [])
      .map(s => ({ distancia: Number(s.distancia), tiempo: Number(s.tiempo) }))
      .filter(p => isFinite(p.distancia) && isFinite(p.tiempo) && p.distancia > 0 && p.tiempo > 0)
      .sort((a, b) => a.distancia - b.distancia);
    if (pts.length < 4) return null;
    if (!(masa > 0) || !(altura > 0)) return null;

    const kAero = 0.5 * densidadAire(tempC, presion) * areaFrontal(altura, masa) * CD;
    const { vmax, tau, sse } = ajustar(pts);
    if (!(vmax > 0) || !(tau > 0)) return null;

    // CUÁNTO SE LE PUEDE CREER. El perfil sale de extrapolar una recta, así
    // que un parcial mal tomado no da un número un poco peor: da otro número.
    // Un 5 m cronometrado medio segundo antes de tiempo empuja F0 varios N/kg
    // para arriba, y nada en el resultado lo delataría.
    //
    // El error del ajuste es lo que lo delata: si el modelo exponencial no
    // puede pasar cerca de todos los parciales a la vez, es que los parciales
    // no son de una misma carrera bien medida. Se devuelve en metros, que es
    // algo que se entiende sin saber qué es una suma de cuadrados.
    const rmse = Math.sqrt(sse / pts.length);
    const confiable = rmse <= 0.10;

    // Paso 2 y 3: muestrear el sprint modelado y sacar fuerza y velocidad
    // instantáneas en cada punto.
    const tFin = Math.max(...pts.map(p => p.tiempo));
    const N = 1000, dt = tFin / N;
    const vs = [], fhs = [], rfs = [];
    for (let i = 0; i <= N; i++) {
      const t = i * dt;
      const v = vmax * (1 - Math.exp(-t / tau));
      const a = (vmax / tau) * Math.exp(-t / tau);
      const fh = masa * a + kAero * v * v;     // lo que empuja, más el aire
      const fTot = Math.hypot(fh, masa * G);   // resultante, con el peso
      vs.push(v); fhs.push(fh); rfs.push(fh / fTot);
    }

    // Paso 4: la relación fuerza-velocidad es lineal. Extrapolarla da F0 y V0.
    const fv = recta(vs, fhs);
    const F0 = fv.b;
    const V0 = -F0 / fv.m;
    const Pmax = F0 * V0 / 4;

    // La orientación de la fuerza se lee desde los 0.3 s: antes, el modelo
    // exponencial todavía no representa lo que pasa en el primer apoyo.
    const desde = Math.ceil(0.3 / dt);
    const rfFit = recta(vs.slice(desde), rfs.slice(desde));

    return {
      vmax, tau, rmse, confiable,
      F0, F0_rel: F0 / masa,
      V0,
      Pmax, Pmax_rel: Pmax / masa,
      RFmax: Math.max(...rfs.slice(desde)),
      DRF: rfFit.m,
      pendienteFV: fv.m,
      // Para dibujar la recta junto a los puntos medidos.
      vs, fhs,
    };
  }

  // Las velocidades entre parciales, sin modelo de por medio: aritmética.
  // Sirve cuando hay dos o tres parciales y el perfil todavía no se puede
  // calcular — y para mirar el tramo lanzado, que es velocidad casi pura.
  function tramos(parciales) {
    const pts = (parciales || [])
      .map(s => ({ d: Number(s.distancia), t: Number(s.tiempo) }))
      .filter(p => isFinite(p.d) && isFinite(p.t) && p.d > 0 && p.t > 0)
      .sort((a, b) => a.d - b.d);
    if (pts.length < 2) return null;

    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      const dd = pts[i].d - pts[i - 1].d, dt = pts[i].t - pts[i - 1].t;
      if (dd <= 0 || dt <= 0) continue;   // un tiempo que no crece es un error de carga
      segs.push({ desde: pts[i - 1].d, hasta: pts[i].d, v: dd / dt });
    }
    if (!segs.length) return null;
    return {
      segmentos: segs,
      vmax: segs.reduce((a, b) => (b.v > a.v ? b : a)),
      lanzado: segs.length >= 2 ? segs[segs.length - 1] : null,
      arrancada: { hasta: pts[0].d, v: pts[0].d / pts[0].t, tiempo: pts[0].t },
    };
  }

  const api = { perfil, tramos, densidadAire, areaFrontal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.prSprint = api;
})(typeof window !== 'undefined' ? window : null);
