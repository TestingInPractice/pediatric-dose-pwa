import { describe, it, expect } from 'vitest';

const { Calculator } = globalThis;
const { Level2Rules } = globalThis;

const paracetamol120 = {
  id: 1, category_id: 1, name: 'Парацетамол 120мг/5мл',
  mls_var: 0.625, mgs_var: 15,
  mgs_max: 60, range2_dose: 24,
  high_range: true, high_modifier: 1.5,
  min_age_months: 1, min_weight_kg: 3
};

const ibuprofen100 = {
  id: 3, category_id: 1, name: 'Ибупрофен 100мг/5мл',
  mls_var: 0.25, mgs_var: 5,
  mgs_max: 30, range2_dose: 20,
  high_range: true, high_modifier: 2
};

const cefekon50 = {
  id: 5, category_id: 3, name: 'Цефекон 50мг',
  dose_per_unit: 50, mgs_var: 12,
  mgs_max: 60,
  high_range: true, high_modifier: 1.5
};

const ibuprofen60 = {
  id: 8, category_id: 3, name: 'Ибупрофен 60мг',
  dose_per_unit: 60, mgs_var: 5,
  mgs_max: 30,
  high_range: true, high_modifier: 2
};

describe('Calculator.calculateDose', () => {
  it('throws on empty drug', () => {
    expect(() => Calculator.calculateDose(null, 8)).toThrow();
  });

  it('throws on zero weight', () => {
    expect(() => Calculator.calculateDose(paracetamol120, 0)).toThrow();
  });

  it('throws on negative weight', () => {
    expect(() => Calculator.calculateDose(paracetamol120, -1)).toThrow();
  });
});

describe('Calculator — Paracetamol 120mg/5ml', () => {
  const r = Calculator.calculateDose(paracetamol120, 8);

  it('standard dose ml: 8 × 0.625 = 5.0 мл', () => {
    expect(r.standard_dose_ml).toBe(5.0);
  });

  it('standard dose mg: 8 × 15 = 120 мг', () => {
    expect(r.standard_dose_mg).toBe(120);
  });

  it('high dose ml: 5 × 1.5 = 7.5 мл', () => {
    expect(r.high_dose_ml).toBe(7.5);
  });

  it('max daily ml: (8 × 60) / 24 = 20.0 мл', () => {
    expect(r.max_dose_ml).toBe(20.0);
  });

  it('max daily mg: 8 × 60 = 480 мг', () => {
    expect(r.max_dose_mg).toBe(480);
  });

  it('no suppositories for liquids', () => {
    expect(r.suppositories_min).toBeNull();
    expect(r.suppositories_high).toBeNull();
  });
});

describe('Calculator — Ibuprofen 100mg/5ml', () => {
  const r = Calculator.calculateDose(ibuprofen100, 10);

  it('standard dose ml: 10 × 0.25 = 2.5 мл', () => {
    expect(r.standard_dose_ml).toBe(2.5);
  });

  it('standard dose mg: 10 × 5 = 50 мг', () => {
    expect(r.standard_dose_mg).toBe(50);
  });

  it('high dose ml: 2.5 × 2 = 5.0 мл', () => {
    expect(r.high_dose_ml).toBe(5.0);
  });

  it('max daily mg: 10 × 30 = 300 мг', () => {
    expect(r.max_dose_mg).toBe(300);
  });
});

describe('Calculator — Paracetamol, граничные значения', () => {
  it('вес 3 кг: 3 × 0.625 = 1.875 мл', () => {
    const r = Calculator.calculateDose(paracetamol120, 3);
    expect(r.standard_dose_ml).toBe(1.9);
  });

  it('вес 1 кг: 1 × 0.625 = 0.625 мл', () => {
    const r = Calculator.calculateDose(paracetamol120, 1);
    expect(r.standard_dose_ml).toBe(0.6);
  });

  it('вес 0.5 кг: 0.5 × 0.625 = 0.3125 мл', () => {
    const r = Calculator.calculateDose(paracetamol120, 0.5);
    expect(r.standard_dose_ml).toBe(0.3);
  });
});

describe('Calculator — Suppositories', () => {
  it('Цефекон 50мг, вес 6 кг: (6 × 12) / 50 = 1.4 шт', () => {
    const r = Calculator.calculateDose(cefekon50, 6);
    expect(r.suppositories_min).toBe(1.4);
  });

  it('Цефекон 50мг, вес 3 кг: (3 × 12) / 50 = 0.7 шт', () => {
    const r = Calculator.calculateDose(cefekon50, 3);
    expect(r.suppositories_min).toBe(0.7);
  });

  it('high dose: 0.7 × 1.5 = 1.05 → 1.1 шт', () => {
    const r = Calculator.calculateDose(cefekon50, 3);
    expect(r.suppositories_high).toBe(1.1);
  });

  it('Цефекон 50мг, 6 кг: max_dose_mg = 360, suppositories_max = 7.2', () => {
    const r = Calculator.calculateDose(cefekon50, 6);
    expect(r.max_dose_mg).toBe(360);
    expect(r.suppositories_max).toBe(7.2);
    expect(r.formula_parts.some(p => p.includes('360 мг = 7.2 шт'))).toBe(true);
  });

  it('Цефекон 50мг, 3 кг: max_dose_mg = 180, suppositories_max = 3.6', () => {
    const r = Calculator.calculateDose(cefekon50, 3);
    expect(r.max_dose_mg).toBe(180);
    expect(r.suppositories_max).toBe(3.6);
  });

  it('Ибупрофен 60мг, 10 кг: suppositories_max = 5.0, max_dose_mg = 300', () => {
    const r = Calculator.calculateDose(ibuprofen60, 10);
    expect(r.max_dose_mg).toBe(300);
    expect(r.suppositories_max).toBe(5);
  });
});

describe('Level2Rules — validation', () => {
  it('passes for valid dose', () => {
    const dose = Calculator.calculateDose(paracetamol120, 8);
    const v = Level2Rules.validate(paracetamol120, 8, dose);
    expect(v.status).toBe('pass');
  });

  it('warns on weight below minimum', () => {
    const dose = Calculator.calculateDose(paracetamol120, 2);
    const v = Level2Rules.validate(paracetamol120, 2, dose);
    expect(v.status).toBe('warn');
    expect(v.checks.some(c => c.status === 'error' && c.title === 'Вес ниже минимального')).toBe(true);
  });

  it('allergy: penicillin allergy → error for amoxiclav', () => {
    const amoxiclav = { id: 9, name: 'Амоксиклав', contraindications: 'Аллергия на пенициллины.', allergens: ['пенициллин', 'амоксициллин'], mgs_var: 45, mgs_max: 90, mgs_range: '45 мг/кг/сут', min_age_months: 3, min_weight_kg: 4 };
    const dose = Calculator.calculateDose(amoxiclav, 10);
    const v = Level2Rules.validate(amoxiclav, 10, dose, 12, 'пенициллин');
    expect(v.status).toBe('warn');
    expect(v.checks.some(c => c.status === 'error' && c.title === 'Аллергия' && c.detail.includes('противопоказан'))).toBe(true);
    expect(v.checks.some(c => c.status === 'pass' && c.title === 'Аллергии')).toBe(false);
  });

  it('allergy: plural «аллергия на пенициллины» still matches stem', () => {
    const amoxiclav = { id: 9, name: 'Амоксиклав', contraindications: 'Аллергия на пенициллины.', allergens: ['пенициллин', 'амоксициллин'], mgs_var: 45, mgs_max: 90, mgs_range: '45 мг/кг/сут', min_age_months: 3, min_weight_kg: 4 };
    const dose = Calculator.calculateDose(amoxiclav, 10);
    const v = Level2Rules.validate(amoxiclav, 10, dose, 12, 'аллергия на пенициллины');
    expect(v.status).toBe('warn');
    expect(v.checks.some(c => c.status === 'error' && c.title === 'Аллергия')).toBe(true);
  });

  it('allergy: uppercase «ПЕНИЦИЛЛИН» matches (case-insensitive)', () => {
    const amoxiclav = { id: 9, name: 'Амоксиклав', contraindications: 'Аллергия на пенициллины.', allergens: ['пенициллин', 'амоксициллин'], mgs_var: 45, mgs_max: 90, mgs_range: '45 мг/кг/сут', min_age_months: 3, min_weight_kg: 4 };
    const dose = Calculator.calculateDose(amoxiclav, 10);
    const v = Level2Rules.validate(amoxiclav, 10, dose, 12, 'ПЕНИЦИЛЛИН');
    expect(v.status).toBe('warn');
    expect(v.checks.some(c => c.status === 'error' && c.title === 'Аллергия')).toBe(true);
  });

  it('allergy: амоксициллин → error for amoxiclav', () => {
    const amoxiclav = { id: 9, name: 'Амоксиклав', contraindications: 'Аллергия на пенициллины.', allergens: ['пенициллин', 'амоксициллин'], mgs_var: 45, mgs_max: 90, mgs_range: '45 мг/кг/сут', min_age_months: 3, min_weight_kg: 4 };
    const dose = Calculator.calculateDose(amoxiclav, 10);
    const v = Level2Rules.validate(amoxiclav, 10, dose, 12, 'амоксициллин');
    expect(v.status).toBe('warn');
    expect(v.checks.some(c => c.status === 'error' && c.title === 'Аллергия' && c.detail.includes('противопоказан'))).toBe(true);
  });

  it('allergy: empty string → no error, pass check for amoxiclav with allergens', () => {
    const amoxiclav = { id: 9, name: 'Амоксиклав', contraindications: 'Аллергия на пенициллины.', allergens: ['пенициллин', 'амоксициллин'], mgs_var: 45, mgs_max: 90, mgs_range: '45 мг/кг/сут', min_age_months: 3, min_weight_kg: 4 };
    const dose = Calculator.calculateDose(amoxiclav, 10);
    const v = Level2Rules.validate(amoxiclav, 10, dose, 12, '');
    expect(v.checks.some(c => c.status === 'error' && c.title === 'Аллергия')).toBe(false);
    expect(v.checks.some(c => c.status === 'pass' && c.title === 'Аллергии' && c.detail.includes('Аллергий'))).toBe(true);
  });

  it('allergy: undefined patientAllergies → no error, pass check for amoxiclav with allergens', () => {
    const amoxiclav = { id: 9, name: 'Амоксиклав', contraindications: 'Аллергия на пенициллины.', allergens: ['пенициллин', 'амоксициллин'], mgs_var: 45, mgs_max: 90, mgs_range: '45 мг/кг/сут', min_age_months: 3, min_weight_kg: 4 };
    const dose = Calculator.calculateDose(amoxiclav, 10);
    const v = Level2Rules.validate(amoxiclav, 10, dose, 12);
    expect(v.checks.some(c => c.status === 'error' && c.title === 'Аллергия')).toBe(false);
    expect(v.checks.some(c => c.status === 'pass' && c.title === 'Аллергии')).toBe(true);
  });

  it('regression: drug WITHOUT allergens + patientAllergies → no allergy check', () => {
    const dose = Calculator.calculateDose(paracetamol120, 8);
    const v = Level2Rules.validate(paracetamol120, 8, dose, 12, 'пенициллин');
    expect(v.checks.some(c => c.title === 'Аллергия' || c.title === 'Аллергии')).toBe(false);
  });
});

describe('Formula consistency across all drugs', () => {
  it('all drugs have formula parts after calculation', () => {
    const drugs = [paracetamol120, ibuprofen100, cefekon50];
    drugs.forEach(d => {
      const r = Calculator.calculateDose(d, 10);
      expect(r.formula_parts.length).toBeGreaterThan(0);
    });
  });
});

const aquadetrim = {
  id: 15, category_id: 8, name: 'Аквадетрим капли 15000МЕ/мл',
  form: 'капли',
  dose_from_table: true, units: 'МЕ',
  mls_var: 0.033, mgs_var: 500,
  mgs_max: 1500, range2_dose: 15000,
  high_range: true, high_modifier: 3,
  mgs_range: '500-1000 МЕ/сут',
  min_age_months: 0, min_weight_kg: 2,
  dose_table: [
    { weight_min: 2, weight_max: 5, dose_ml: 0.033, dose_mg: 500 },
    { weight_min: 5, weight_max: 10, dose_ml: 0.033, dose_mg: 500 },
    { weight_min: 10, weight_max: 15, dose_ml: 0.067, dose_mg: 1000 },
    { weight_min: 15, weight_max: 25, dose_ml: 0.067, dose_mg: 1000 },
    { weight_min: 25, weight_max: 40, dose_ml: 0.1, dose_mg: 1500 }
  ]
};

describe('Calculator — Аквадетрим (dose_from_table)', () => {
  it('weight 4 kg → 0.033 мл / 500 МЕ', () => {
    const r = Calculator.calculateDose(aquadetrim, 4);
    expect(r.standard_dose_ml).toBe(0.033);
    expect(r.standard_dose_mg).toBe(500);
    expect(r.units).toBe('МЕ');
  });

  it('weight 10 kg → 0.067 мл / 1000 МЕ', () => {
    const r = Calculator.calculateDose(aquadetrim, 10);
    expect(r.standard_dose_ml).toBe(0.067);
    expect(r.standard_dose_mg).toBe(1000);
    expect(r.units).toBe('МЕ');
  });

  it('weight 30 kg → 0.1 мл / 1500 МЕ', () => {
    const r = Calculator.calculateDose(aquadetrim, 30);
    expect(r.standard_dose_ml).toBe(0.1);
    expect(r.standard_dose_mg).toBe(1500);
    expect(r.units).toBe('МЕ');
  });

  it('max_dose_mg is absolute 1500 МЕ, max_dose_ml = 0.1', () => {
    const r = Calculator.calculateDose(aquadetrim, 10);
    expect(r.max_dose_mg).toBe(1500);
    expect(r.max_dose_ml).toBe(0.1);
  });

  it('formula_parts contain "МЕ"', () => {
    const r = Calculator.calculateDose(aquadetrim, 10);
    expect(r.formula_parts.some(p => p.includes('МЕ'))).toBe(true);
  });

  it('does NOT use weight-proportional calculation', () => {
    const r10 = Calculator.calculateDose(aquadetrim, 10);
    expect(r10.standard_dose_mg).toBe(1000);
    expect(r10.standard_dose_mg).not.toBe(5000);
  });
});

describe('Regression — Paracetamol unchanged (no dose_from_table)', () => {
  it('8 kg → 5.0 мл / 120 мг (not affected by dose_from_table changes)', () => {
    const r = Calculator.calculateDose(paracetamol120, 8);
    expect(r.standard_dose_ml).toBe(5.0);
    expect(r.standard_dose_mg).toBe(120);
    expect(r.units).toBeUndefined();
  });
});
