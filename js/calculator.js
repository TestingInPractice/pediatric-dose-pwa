const Calculator = {
  calculateDose(drug, weight) {
    if (!drug || !weight || weight <= 0) {
      throw new Error('Неверные входные данные');
    }

    const result = {
      standard_dose_ml: null,
      standard_dose_mg: null,
      high_dose_ml: null,
      high_dose_mg: null,
      max_dose_ml: null,
      max_dose_mg: null,
      suppositories_min: null,
      suppositories_high: null,
      suppositories_max: null,
      formula_parts: []
    };

    const isSuppository = drug.category_id === 3;
    const isFixed = drug.fixed_dose != null;
    const isDoseFromTable = drug.dose_from_table && drug.dose_table && drug.dose_table.length > 0;
    const units = drug.units || 'мг';

    if (isDoseFromTable) {
      const row = drug.dose_table.find(r => weight >= r.weight_min && weight < r.weight_max)
        || drug.dose_table[drug.dose_table.length - 1];
      result.standard_dose_ml = row.dose_ml;
      result.standard_dose_mg = row.dose_mg;
      result.units = units;
      if (drug.mgs_max != null) {
        result.max_dose_mg = drug.mgs_max;
        if (drug.range2_dose) {
          result.max_dose_ml = +(drug.mgs_max / drug.range2_dose).toFixed(2);
        }
      }
      result.formula_parts.push(
        `${row.weight_min}–${row.weight_max} кг: ${row.dose_mg} ${units}`,
        `${row.dose_ml} мл (${drug.range2_dose} ${units}/мл)`
      );
      return result;
    }

    if (isFixed) {
      result.standard_dose_ml = drug.fixed_dose;
      result.formula_parts.push(`Фиксированная доза: ${drug.fixed_dose} ${drug.fixed_dose_unit || 'мл'}`);
      return result;
    }

    if (isSuppository && drug.dose_per_unit) {
      const mg_dose_min = weight * (drug.mgs_var || 10);
      const mg_dose_high = drug.high_range ? mg_dose_min * (drug.high_modifier || 1.5) : mg_dose_min;
      result.suppositories_min = +(mg_dose_min / drug.dose_per_unit).toFixed(1);
      result.suppositories_high = +(mg_dose_high / drug.dose_per_unit).toFixed(1);
      result.formula_parts.push(
        `${weight} кг × ${drug.mgs_var} мг/кг = ${mg_dose_min} мг`,
        `${mg_dose_min} мг / ${drug.dose_per_unit} мг/свеча = ${result.suppositories_min} шт`
      );
      if (drug.mgs_max != null) {
        const max_dose_mg = +(weight * drug.mgs_max).toFixed(1);
        result.max_dose_mg = max_dose_mg;
        result.suppositories_max = +(max_dose_mg / drug.dose_per_unit).toFixed(1);
        result.formula_parts.push(
          `Макс. в сутки: ${weight} × ${drug.mgs_max} мг/кг = ${max_dose_mg} мг = ${result.suppositories_max} шт (${drug.dose_per_unit} мг/свеча)`
        );
      }
      return result;
    }

    if (drug.mls_var != null) {
      const dose_ml = weight * drug.mls_var;
      result.standard_dose_ml = +dose_ml.toFixed(1);
      result.formula_parts.push(
        `${weight} кг × ${drug.mls_var} мл/кг = ${result.standard_dose_ml} мл`
      );
    }

    if (drug.mgs_var != null) {
      const dose_mg = weight * drug.mgs_var;
      result.standard_dose_mg = +dose_mg.toFixed(1);
      result.formula_parts.push(
        `${weight} кг × ${drug.mgs_var} мг/кг = ${result.standard_dose_mg} мг`
      );
    }

    if (drug.high_range && drug.mls_var != null && drug.high_modifier != null) {
      let high_ml = weight * drug.mls_var * drug.high_modifier;
      if (drug.mls_max != null) high_ml = Math.min(high_ml, drug.mls_max);
      result.high_dose_ml = +high_ml.toFixed(1);

      let high_mg = weight * drug.mgs_var * drug.high_modifier;
      if (drug.mgs_max != null) high_mg = Math.min(high_mg, drug.mgs_max);
      result.high_dose_mg = +high_mg.toFixed(1);

      result.formula_parts.push(
        `Повышенная: ${weight} × ${drug.mls_var} × ${drug.high_modifier} = ${result.high_dose_ml} мл`
      );
    }

    if (drug.mgs_max != null) {
      const max_mg = weight * drug.mgs_max;
      result.max_dose_mg = +max_mg.toFixed(1);
      if (drug.range2_dose) {
        result.max_dose_ml = +(max_mg / drug.range2_dose).toFixed(1);
      }
      result.formula_parts.push(
        `Макс. в сутки: ${weight} × ${drug.mgs_max} = ${result.max_dose_mg} мг`
      );
    }

    return result;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Calculator };
}
