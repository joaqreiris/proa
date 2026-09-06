// Proa — cálculos de nutrición.
// Traído de ClavaMetrics tal cual: son cuentas puras, sin dependencias, y los
// coeficientes de metabolismo basal están verificados contra los papers
// originales (no de memoria). No tocar sin volver a la fuente.
// Pure calculation functions, no external dependencies.
// All functions exposed on window.prNutri.
// RMR formulas (Fase B) NOT included yet — pending exact-coefficient
// verification against the source papers (see nutrition-module-spec.md §4).
(function () {
  'use strict';

  const round = (n, d = 1) => {
    const f = Math.pow(10, d);
    return Math.round((Number(n) || 0) * f) / f;
  };

  window.prNutri = {

    // ── macros de un alimento a una cantidad dada ──────────────
    // food: { kcal, protein_g, carbs_g, fats_g, fiber_g } por 100 g.
    // quantityG: gramos (o ml) consumidos.
    // Devuelve los macros escalados (food × quantity/100).
    macrosForQuantity(food, quantityG) {
      const k = (Number(quantityG) || 0) / 100;
      return {
        kcal:      round((food.kcal      || 0) * k),
        protein_g: round((food.protein_g || 0) * k),
        carbs_g:   round((food.carbs_g   || 0) * k),
        fats_g:    round((food.fats_g    || 0) * k),
        fiber_g:   round((food.fiber_g   || 0) * k),
      };
    },

    // ── macros de un meal_plan_item (food + quantity_g) ────────
    // item: { quantity_g, food: {...} }  ó  (item, food) por separado.
    macrosForItem(item, food) {
      const f = food || item.food || item.foods; // tolera el join de supabase
      return this.macrosForQuantity(f, item.quantity_g);
    },

    // ── sumar una lista de macros ──────────────────────────────
    sumMacros(list) {
      return (list || []).reduce((acc, m) => ({
        kcal:      round(acc.kcal      + (m.kcal      || 0)),
        protein_g: round(acc.protein_g + (m.protein_g || 0)),
        carbs_g:   round(acc.carbs_g   + (m.carbs_g   || 0)),
        fats_g:    round(acc.fats_g    + (m.fats_g    || 0)),
        fiber_g:   round(acc.fiber_g   + (m.fiber_g   || 0)),
      }), { kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0 });
    },

    // ── total de un array de items (food + quantity) ───────────
    totalForItems(items) {
      return this.sumMacros((items || []).map(it => this.macrosForItem(it)));
    },

    // ── escalar una cantidad por el scale_factor del jugador ───
    scaleQuantity(quantityG, scaleFactor) {
      return round((Number(quantityG) || 0) * (Number(scaleFactor) || 1), 0);
    },

    // ── lean mass desde peso + % graso ─────────────────────────
    leanMass(weightKg, bodyFatPct) {
      if (weightKg == null || bodyFatPct == null) return null;
      return round(weightKg * (1 - bodyFatPct / 100), 1);
    },

    // ── distribución de macros (% de kcal por macro) ───────────
    // 4 kcal/g proteína y carbo, 9 kcal/g grasa.
    macroSplitPct(m) {
      const pK = (m.protein_g || 0) * 4;
      const cK = (m.carbs_g   || 0) * 4;
      const fK = (m.fats_g    || 0) * 9;
      const tot = pK + cK + fK;
      if (!tot) return { protein: 0, carbs: 0, fats: 0 };
      return {
        protein: round((pK / tot) * 100, 0),
        carbs:   round((cK / tot) * 100, 0),
        fats:    round((fK / tot) * 100, 0),
      };
    },

    // ═══════════════════════════════════════════════════════════
    //  RMR / TDEE  ·  coeficientes VERIFICADOS contra paper fuente
    //  (no de memoria — ver nutrition-module-spec.md §4)
    //  in: { weightKg, heightCm, age, sex:'male'|'female', bodyFatPct }
    //  out: RMR en kcal/día.  null si faltan inputs requeridos.
    // ═══════════════════════════════════════════════════════════
    rmr: {

      // Ten-Haaf & Weijs 2014 (PLoS ONE 9:e108460) — DEFAULT.
      // altura en METROS; sexo M=1, F=0.
      ten_haaf({ weightKg, heightCm, age, sex }) {
        if (weightKg == null || heightCm == null || age == null) return null;
        const s = sex === 'female' ? 0 : 1;
        return round(11.936 * weightKg + 587.728 * (heightCm / 100)
                     - 8.129 * age + 191.027 * s + 29.279, 0);
      },

      // Cunningham 1980 — REE = 500 + 22 × LBM(kg). Requiere % graso.
      cunningham({ weightKg, bodyFatPct }) {
        if (weightKg == null || bodyFatPct == null) return null;
        const lbm = weightKg * (1 - bodyFatPct / 100);
        return round(500 + 22 * lbm, 0);
      },

      // De Lorenzo 1999 (J Sports Med Phys Fitness 39:213) — sin sexo.
      de_lorenzo({ weightKg, heightCm }) {
        if (weightKg == null || heightCm == null) return null;
        return round(-857 + 9.0 * weightKg + 11.7 * heightCm, 0);
      },

      // Harris-Benedict 1918 (original).
      harris_benedict({ weightKg, heightCm, age, sex }) {
        if (weightKg == null || heightCm == null || age == null) return null;
        return sex === 'female'
          ? round(655.0955 + 9.5634 * weightKg + 1.8496 * heightCm - 4.6756 * age, 0)
          : round(66.473  + 13.7516 * weightKg + 5.0033 * heightCm - 6.755  * age, 0);
      },

      // Mifflin-St Jeor 1990. s = +5 hombres, −161 mujeres.
      mifflin({ weightKg, heightCm, age, sex }) {
        if (weightKg == null || heightCm == null || age == null) return null;
        const s = sex === 'female' ? -161 : 5;
        return round(10 * weightKg + 6.25 * heightCm - 5 * age + s, 0);
      },
    },

    // dispatcher: calcula RMR por modelo (key = rmr_model en DB).
    computeRMR(model, inputs) {
      const fn = this.rmr[model];
      return fn ? fn.call(this.rmr, inputs) : null;
    },

    // TDEE = RMR × activity_factor.
    computeTDEE(rmrKcal, activityFactor = 1.6) {
      if (rmrKcal == null) return null;
      return round(rmrKcal * (Number(activityFactor) || 1.6), 0);
    },

    // Sugerencia de macros a partir de kcal target + peso.
    // Proteína 1.8 g/kg, grasa 1.0 g/kg, resto carbos. Hidratación 35 ml/kg.
    // Todo editable por el nutri (son puntos de partida, no dogma).
    suggestTargets(kcalTarget, weightKg, { proteinPerKg = 1.8, fatPerKg = 1.0 } = {}) {
      if (kcalTarget == null || weightKg == null) return null;
      const protein_g = round(proteinPerKg * weightKg, 0);
      const fats_g    = round(fatPerKg * weightKg, 0);
      const carbKcal  = kcalTarget - protein_g * 4 - fats_g * 9;
      const carbs_g   = round(Math.max(0, carbKcal) / 4, 0);
      return {
        protein_g, fats_g, carbs_g,
        hydration_ml: round(35 * weightKg, 0),
      };
    },

    // ── Cantidades como se dicen ─────────────────────────────────────────────
    // Media taza es «1/2», no «0.5». Nadie mide en decimales cuando cocina, y
    // obligar a traducir mentalmente antes de escribir es fricción en lo que
    // más se repite: cargar comida.
    //
    // Se aceptan las tres formas de escribirlo —1/2, 1 1/2 y ½— porque las tres
    // son naturales según de dónde venga uno, y el punto decimal sigue andando.
    FRACTIONS: [
      [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'],
      [2 / 3, '2/3'], [3 / 4, '3/4'],
    ],

    // Los caracteres de fracción que mandan los teclados y los copiar-pegar.
    UNICODE_FRACTIONS: {
      '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
      '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
    },

    parseAmount(txt) {
      if (txt == null) return null;
      let s = String(txt).trim().replace(',', '.');
      if (!s) return null;

      // Un símbolo de fracción, solo o pegado a un entero: «1½».
      for (const [sym, val] of Object.entries(this.UNICODE_FRACTIONS)) {
        if (s.includes(sym)) {
          const entero = Number(s.replace(sym, '').trim() || 0);
          if (!Number.isFinite(entero)) return null;
          return round(entero + val, 4);
        }
      }

      // «1 1/2» o «1/2».
      const m = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/.exec(s);
      if (m) {
        const den = Number(m[3]);
        if (!den) return null;
        return round((Number(m[1] || 0)) + Number(m[2]) / den, 4);
      }

      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    },

    // Y de vuelta: 0.5 se muestra «1/2», porque es lo que la persona escribió y
    // lo que va a querer leer mañana. Solo si cae razonablemente cerca de una
    // fracción de cocina; si no, el decimal.
    formatAmount(n, tol = 0.02) {
      const v = Number(n);
      if (!Number.isFinite(v) || v <= 0) return '';
      const entero = Math.floor(v + 1e-9);
      const resto = v - entero;
      if (resto < tol) return String(entero);
      for (const [val, txt] of this.FRACTIONS) {
        if (Math.abs(resto - val) <= tol) return entero ? entero + ' ' + txt : txt;
      }
      return String(round(v, 2));
    },

    // ── Del gasto al objetivo ────────────────────────────────────────────────
    // Cuánto se corre el objetivo diario respecto del gasto, según a dónde va
    // el atleta. Los rangos son los de uso corriente en la literatura:
    //
    //   Perder grasa   −15% a −20%. Eso da alrededor de 0,5% del peso por
    //                  semana; más agresivo cuesta masa magra, que es
    //                  justamente lo que no se quiere perder.
    //   Ganar músculo  +10% a +15%. Más que eso no construye más rápido: lo
    //                  que sobra se va a grasa.
    //
    // Se devuelve el punto medio, y queda editable: esto es un punto de
    // partida, no una receta.
    GOALS: {
      fat_loss:    { factor: 0.825, proteinPerKg: 2.2, fatPerKg: 0.8 },
      maintain:    { factor: 1.00,  proteinPerKg: 1.8, fatPerKg: 1.0 },
      muscle_gain: { factor: 1.125, proteinPerKg: 1.8, fatPerKg: 1.0 },
    },

    // La proteína no sale de una sola cifra: en déficit se sube para preservar
    // masa magra, y para hipertrofia el rango útil va de 1,6 a 2,2 g/kg —por
    // encima de 1,6 el beneficio adicional es chico, y por encima de 2,2 no se
    // observa—. Ver Morton et al., Br J Sports Med 2018;52:376-384.
    PROTEIN_RANGE: { min: 1.6, max: 2.2 },

    // El plan completo a partir del gasto y el objetivo. Devuelve también de
    // dónde salió cada número, para poder mostrarlo y no pedir fe.
    planForGoal(tdeeKcal, weightKg, goal = 'maintain', over = {}) {
      if (tdeeKcal == null || weightKg == null) return null;
      const g = this.GOALS[goal] || this.GOALS.maintain;
      const factor       = over.factor       != null ? Number(over.factor)       : g.factor;
      const proteinPerKg = over.proteinPerKg != null ? Number(over.proteinPerKg) : g.proteinPerKg;
      const fatPerKg     = over.fatPerKg     != null ? Number(over.fatPerKg)     : g.fatPerKg;

      const kcal = round(tdeeKcal * factor, 0);
      const macros = this.suggestTargets(kcal, weightKg, { proteinPerKg, fatPerKg });
      return Object.assign({ kcal, factor, proteinPerKg, fatPerKg, tdee: round(tdeeKcal, 0) }, macros);
    },

    // Lo que falta —o lo que sobró— para llegar al objetivo del día.
    // El signo importa: pasarse de proteína no es lo mismo que quedarse corto.
    remaining(target, eaten) {
      const t = target || {}, e = eaten || {};
      const dif = (k) => (t[k] == null ? null : round(Number(t[k]) - (Number(e[k]) || 0), 0));
      return {
        kcal: dif('kcal'), protein_g: dif('protein_g'),
        carbs_g: dif('carbs_g'), fats_g: dif('fats_g'),
      };
    },

    // ── ¿Está funcionando? ───────────────────────────────────────────────────
    // El gasto se ESTIMA con una fórmula, y las fórmulas se equivocan: dos
    // personas del mismo peso y altura pueden gastar cuatrocientas calorías
    // distintas. Lo único que dice si el número estaba bien es el peso.
    //
    // Se ajusta una recta por mínimos cuadrados en vez de restar el primero
    // del último: el peso sube y baja dos kilos por agua y glucógeno, así que
    // dos días sueltos pueden decir cualquier cosa. La recta usa todos los
    // puntos y el ruido se compensa.
    weightTrend(rows, days = 28) {
      const list = (rows || [])
        .filter(r => r && r.date && r.weight_kg != null)
        .map(r => ({ t: Date.parse(r.date + 'T00:00:00'), w: Number(r.weight_kg) }))
        .filter(r => Number.isFinite(r.t) && Number.isFinite(r.w))
        .sort((a, b) => a.t - b.t);
      if (list.length < 2) return null;

      const corte = list[list.length - 1].t - days * 86400000;
      const usados = list.filter(r => r.t >= corte);
      if (usados.length < 2) return null;

      // Días desde el primero, para que los números no sean gigantes.
      const t0 = usados[0].t;
      const xs = usados.map(r => (r.t - t0) / 86400000);
      const ys = usados.map(r => r.w);
      const n = xs.length;
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
      if (den === 0) return null;              // todo el mismo día

      const porDia = num / den;
      return {
        kgPerWeek: round(porDia * 7, 2),
        puntos: n,
        dias: Math.round(xs[n - 1]),
        desde: usados[0].w,
        hasta: usados[n - 1].w,
      };
    },

    // Lo que se esperaría ver, según a dónde va. En porcentaje del peso por
    // semana, que es como se escribe en la literatura: medio por ciento para
    // bajar, la mitad de eso para construir sin engordar.
    EXPECTED_RATE: {
      fat_loss:    { pct: -0.005, tol: 0.004 },
      maintain:    { pct: 0,      tol: 0.004 },
      muscle_gain: { pct: 0.0025, tol: 0.003 },
    },

    // El veredicto. Devuelve qué pasó, qué se esperaba y en qué dirección
    // habría que corregir — sin decir un número de calorías nuevo, porque eso
    // lo decide el entrenador mirando también cómo entrena y cómo duerme.
    trendVerdict(trend, goal, weightKg) {
      if (!trend || weightKg == null) return null;
      const esperado = this.EXPECTED_RATE[goal] || this.EXPECTED_RATE.maintain;
      const objetivoKg = round(esperado.pct * weightKg, 2);
      const tolKg = round(esperado.tol * weightKg, 2);
      const dif = round(trend.kgPerWeek - objetivoKg, 2);

      // Con menos de dos semanas no se concluye nada: el peso de una semana es
      // ruido con forma de dato.
      const suficiente = trend.dias >= 14 && trend.puntos >= 3;
      let estado = 'on_track';
      if (!suficiente) estado = 'too_soon';
      else if (Math.abs(dif) <= tolKg) estado = 'on_track';
      else if (dif > 0) estado = 'above';     // sube más (o baja menos) de lo buscado
      else estado = 'below';

      return { estado, real: trend.kgPerWeek, objetivo: objetivoKg, dif, dias: trend.dias, puntos: trend.puntos };
    },

    // Metadata para la UI: label, cita, explicación, inputs requeridos.
    RMR_MODELS: {
      ten_haaf: {
        label: 'Ten-Haaf',
        recommended: true,
        needs: ['weight', 'height', 'age', 'sex'],
        blurb: 'Most accurate & consistent in athletes (80% within ±10% of measured). Default recommendation.',
        cite: 'ten Haaf & Weijs, PLoS ONE 2014;9(9):e108460.',
      },
      cunningham: {
        label: 'Cunningham',
        needs: ['weight', 'bodyFat'],
        blurb: 'Best for athletes with high muscle mass — uses lean body mass. Requires body-fat %. ACSM-endorsed.',
        cite: 'Cunningham JJ, Am J Clin Nutr 1980.',
      },
      de_lorenzo: {
        label: 'De Lorenzo',
        needs: ['weight', 'height'],
        blurb: 'Athlete-specific equation (weight + height only). No sex term.',
        cite: 'De Lorenzo A et al., J Sports Med Phys Fitness 1999.',
      },
      harris_benedict: {
        label: 'Harris-Benedict',
        needs: ['weight', 'height', 'age', 'sex'],
        blurb: 'Classic 1918 equation, ACSM-endorsed. General population.',
        cite: 'Harris JA, Benedict FG, 1918.',
      },
      mifflin: {
        label: 'Mifflin-St Jeor',
        needs: ['weight', 'height', 'age', 'sex'],
        blurb: 'Most widely used in clinical practice — tends to underestimate in athletes.',
        cite: 'Mifflin MD, St Jeor ST et al., Am J Clin Nutr 1990.',
      },
    },

  };
})();
