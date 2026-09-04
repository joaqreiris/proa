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
