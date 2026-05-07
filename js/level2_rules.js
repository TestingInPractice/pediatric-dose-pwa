const Level2Rules = {
  validate(drug, weight, calculatedDose) {
    const checks = [];
    let allPassed = true;

    if (drug.min_age_months != null) {
      checks.push({
        icon: '👶',
        title: 'Возрастное ограничение',
        status: 'info',
        detail: `Препарат разрешён с ${drug.min_age_months} мес.`
      });
    }

    if (drug.min_weight_kg != null && weight < drug.min_weight_kg) {
      allPassed = false;
      checks.push({
        icon: '🚫',
        title: 'Вес ниже минимального',
        status: 'error',
        detail: `Минимальный вес для этого препарата: ${drug.min_weight_kg} кг. Ваш вес: ${weight} кг.`
      });
    } else if (drug.min_weight_kg != null) {
      checks.push({
        icon: '✅',
        title: 'Минимальный вес',
        status: 'pass',
        detail: `${weight} кг ≥ ${drug.min_weight_kg} кг`
      });
    }

    if (calculatedDose.standard_dose_mg != null && drug.mgs_var != null) {
      const mg_per_kg = weight > 0 ? calculatedDose.standard_dose_mg / weight : 0;
      const range_note = drug.mgs_range || `~${drug.mgs_var} мг/кг`;

      if (range_note) {
        checks.push({
          icon: '📏',
          title: 'Доза на кг веса',
          status: 'pass',
          detail: `${mg_per_kg.toFixed(1)} мг/кг (норма: ${range_note})`
        });
      }
    }

    if (calculatedDose.max_dose_mg != null && calculatedDose.standard_dose_mg != null) {
      const isInRange = calculatedDose.standard_dose_mg <= calculatedDose.max_dose_mg;
      if (!isInRange) {
        allPassed = false;
        checks.push({
          icon: '⚠️',
          title: 'Превышение суточной дозы',
          status: 'error',
          detail: `Разовая доза ${calculatedDose.standard_dose_mg} мг превышает макс. суточную ${calculatedDose.max_dose_mg} мг.`
        });
      } else {
        checks.push({
          icon: '✅',
          title: 'Суточная доза',
          status: 'pass',
          detail: `В пределах нормы (макс: ${calculatedDose.max_dose_mg} мг/сут)`
        });
      }
    }

    if (drug.contraindications) {
      checks.push({
        icon: '📋',
        title: 'Противопоказания',
        status: 'info',
        detail: drug.contraindications
      });
    }

    return {
      status: allPassed ? 'pass' : 'warn',
      checks
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Level2Rules };
}
