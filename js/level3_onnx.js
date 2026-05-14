(function () {
  'use strict';

  const L3 = {};

  let statsData = null;

  const DATA_URL = window.location.href.includes('localhost')
    ? '/data/l3_stats.json'
    : '/pediatric-dose-pwa/data/l3_stats.json';

  async function loadStats() {
    if (statsData) return statsData;
    try {
      const res = await fetch(DATA_URL + '?v=1.0.0');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      statsData = await res.json();
      return statsData;
    } catch (e) {
      console.warn('L3: stats not loaded', e.message);
      return null;
    }
  }

  const ACTIVE_INGREDIENT = {
    1: 'paracetamol', 2: 'paracetamol',
    3: 'ibuprofen', 4: 'ibuprofen',
    5: 'paracetamol', 6: 'paracetamol', 7: 'paracetamol',
    8: 'ibuprofen',
    9: 'amoxicillin', 10: 'amoxicillin',
    11: null, 12: 'cetirizine', 13: null,
    14: 'acetylcysteine', 15: null, 16: null,
  };

  function getPercentileRank(values, dose) {
    let below = 0;
    for (const v of values) {
      if (v < dose) below++;
    }
    return below / values.length;
  }

  async function validate(drugId, ageMonths, weightKg, dosePerKg) {
    const stats = await loadStats();
    if (!stats) {
      return { level: -1, message: 'L3: статистика не загружена', icon: '⏳' };
    }

    if (!(drugId in ACTIVE_INGREDIENT)) {
      return { level: -1, message: 'L3: нет данных для этого препарата', icon: 'ℹ️' };
    }

    const genericName = ACTIVE_INGREDIENT[drugId];
    if (!genericName || !stats.by_generic[genericName]) {
      return { level: -1, message: 'L3: нет данных для этого препарата', icon: 'ℹ️' };
    }

    const drugStats = stats.by_generic[genericName];
    const doseStats = drugStats.dose_mg_per_kg;
    const data = doseStats._all || null;

    const p50 = doseStats.p50;
    const p95 = doseStats.p95;
    const p5 = doseStats.p5;
    const mean = doseStats.mean;

    let percentile = null;
    if (data) {
      percentile = getPercentileRank(data, dosePerKg);
    } else {
      if (dosePerKg <= p5) percentile = 0.05;
      else if (dosePerKg >= p95) percentile = 0.95;
      else if (dosePerKg <= p50) percentile = 0.25 + (dosePerKg - p5) / Math.max(0.001, p50 - p5) * 0.25;
      else percentile = 0.50 + (dosePerKg - p50) / Math.max(0.001, p95 - p50) * 0.45;
    }

    const ratio = dosePerKg / mean;

    if (dosePerKg >= p5 && dosePerKg <= p95) {
      return {
        level: 0,
        message: `L3: доза в типичном диапазоне (p${Math.round(percentile * 100)})`,
        icon: '✅',
        percentile: Math.round(percentile * 100),
      };
    } else if (dosePerKg < p5) {
      return {
        level: -1,
        message: `L3: доза ниже 95% реальных назначений`,
        icon: '⬇️',
        percentile: Math.round(percentile * 100),
      };
    } else {
      return {
        level: 1,
        message: `L3: доза выше 95% реальных назначений`,
        icon: '⬆️',
        percentile: Math.round(percentile * 100),
      };
    }
  }

  function getDrugIdForModel(drug) {
    return drug && drug.id != null ? drug.id : null;
  }

  L3.loadStats = loadStats;
  L3.validate = validate;
  L3.getDrugIdForModel = getDrugIdForModel;

  window.L3 = L3;
})();
