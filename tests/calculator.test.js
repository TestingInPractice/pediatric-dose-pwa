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
  high_range: true, high_modifier: 1.5
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
