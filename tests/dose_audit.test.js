import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const Module = { exports: {} };
  const fn = new Function('module', 'exports', code + '\nreturn module.exports;');
  const result = fn(Module, Module.exports);
  return result || Module.exports;
}

const { DoseAudit } = loadModule(path.join(root, 'js', 'dose_audit.js'));

// Валидный препарат: таблица 3–5 / 5–7 кг, согласованные поля
const validDrug = {
  id: 100, category_id: 1, name: 'Тестовый препарат',
  form: 'суспензия',
  mls_var: 0.5, mgs_var: 10,
  mgs_max: 45, range2_dose: 20,
  number_of_times_a_day: '3-4 раза в день',
  min_age_months: 3, min_weight_kg: 3,
  dose_table: [
    { weight_min: 3, weight_max: 5, dose_ml: 2, dose_mg: 40 },
    { weight_min: 5, weight_max: 7, dose_ml: 3, dose_mg: 60 }
  ]
};

function drugWithTable(id, name, rows, extra = {}) {
  return { ...validDrug, id, name, dose_table: rows, ...extra };
}

describe('DoseAudit.runAudit — валидный препарат', () => {
  it('валидный препарат → 0 issues', () => {
    const { issues } = DoseAudit.runAudit([validDrug]);
    expect(issues).toEqual([]);
  });
});

describe('DoseAudit.parseMaxPerDay', () => {
  it('«3-4 раза в день»→4, «1 раз в день»→1, «2 раза в день»→2', () => {
    expect(DoseAudit.parseMaxPerDay('3-4 раза в день')).toBe(4);
    expect(DoseAudit.parseMaxPerDay('1 раз в день')).toBe(1);
    expect(DoseAudit.parseMaxPerDay('2 раза в день')).toBe(2);
  });
});

describe('DoseAudit.runAudit — table_structure', () => {
  it('разрыв в таблице (5-7 затем 8-10) → флаг', () => {
    const d = drugWithTable(101, 'Gap', [
      { weight_min: 5, weight_max: 7, dose_ml: 3, dose_mg: 60 },
      { weight_min: 8, weight_max: 10, dose_ml: 4.5, dose_mg: 90 }
    ], { min_weight_kg: 4 });
    const { issues } = DoseAudit.runAudit([d]);
    const flag = issues.find(i => i.code === 'table_structure');
    expect(flag).toBeTruthy();
    expect(flag.message).toContain('Разрыв');
  });

  it('перекрытие строк (3-6 затем 5-7) → флаг', () => {
    const d = drugWithTable(102, 'Overlap', [
      { weight_min: 3, weight_max: 6, dose_ml: 2.25, dose_mg: 45 },
      { weight_min: 5, weight_max: 7, dose_ml: 3, dose_mg: 60 }
    ]);
    const { issues } = DoseAudit.runAudit([d]);
    const flag = issues.find(i => i.code === 'table_structure');
    expect(flag).toBeTruthy();
    expect(flag.message).toContain('Перекрытие');
  });

  it('несортированная таблица → флаг', () => {
    const d = drugWithTable(103, 'Unsorted', [
      { weight_min: 5, weight_max: 7, dose_ml: 3, dose_mg: 60 },
      { weight_min: 3, weight_max: 5, dose_ml: 2, dose_mg: 40 }
    ]);
    const { issues } = DoseAudit.runAudit([d]);
    const flag = issues.find(i => i.code === 'table_structure');
    expect(flag).toBeTruthy();
    expect(flag.message).toContain('не отсортирована');
  });

  it('первая строка не покрывает min_weight_kg → warn', () => {
    const d = drugWithTable(104, 'Coverage', [
      { weight_min: 5, weight_max: 7, dose_ml: 3, dose_mg: 60 },
      { weight_min: 7, weight_max: 9, dose_ml: 4, dose_mg: 80 }
    ], { min_weight_kg: 3 });
    const { issues } = DoseAudit.runAudit([d]);
    const flag = issues.find(i => i.code === 'table_structure' && i.severity === 'warn');
    expect(flag).toBeTruthy();
    expect(flag.message).toContain('не покрывает минимальный вес');
  });
});

describe('DoseAudit.runAudit — row_vs_formula и grid_gap', () => {
  it('строка с отклонением >35% от формулы → warn', () => {
    const d = drugWithTable(105, 'Deviation', [
      { weight_min: 3, weight_max: 5, dose_ml: 3, dose_mg: 60 },
      { weight_min: 5, weight_max: 7, dose_ml: 3, dose_mg: 60 }
    ]);
    const { issues } = DoseAudit.runAudit([d]);
    const flag = issues.find(i => i.code === 'row_vs_formula');
    expect(flag).toBeTruthy();
    expect(flag.severity).toBe('warn');
    expect(flag.message).toContain('против формулы');
  });

  it('препарат в единицах, отличных от мг (напр. МЕ), пропускает row_vs_formula', () => {
    const d = drugWithTable(115, 'VitaminD_IU', [
      { weight_min: 2, weight_max: 5, dose_ml: 1, dose_mg: 300 },
      { weight_min: 5, weight_max: 10, dose_ml: 1, dose_mg: 400 }
    ], { units: 'МЕ', mgs_var: 500 });
    const { issues } = DoseAudit.runAudit([d]);
    expect(issues.filter(i => i.code === 'row_vs_formula')).toEqual([]);
  });

  it('дыра внутри диапазона таблицы → error с номером веса', () => {
    const d = drugWithTable(106, 'Hole', [
      { weight_min: 3, weight_max: 5, dose_ml: 2, dose_mg: 40 },
      { weight_min: 7, weight_max: 9, dose_ml: 4, dose_mg: 80 }
    ]);
    const { issues } = DoseAudit.runAudit([d]);
    const gaps = issues.filter(i => i.code === 'grid_gap');
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].severity).toBe('error');
    expect(gaps.some(i => i.message.includes('веса 5 кг'))).toBe(true);
  });

  it('экстраполяция за последней строкой → НЕ флаг', () => {
    const d = drugWithTable(107, 'Extrapolation', [
      { weight_min: 3, weight_max: 5, dose_ml: 2, dose_mg: 40 },
      { weight_min: 5, weight_max: 7, dose_ml: 3, dose_mg: 60 }
    ]);
    const { issues } = DoseAudit.runAudit([d]);
    expect(issues.filter(i => i.code === 'grid_gap')).toEqual([]);
  });
});

describe('DoseAudit.runAudit — daily_limit и high_range_sanity', () => {
  it('mgs_var×n > mgs_max → warn; ровно на границе (≤ ×1.001) → не флаг', () => {
    const over = drugWithTable(108, 'OverLimit', validDrug.dose_table, { mgs_max: 30 });
    const r1 = DoseAudit.runAudit([over]);
    const flag = r1.issues.find(i => i.code === 'daily_limit');
    expect(flag).toBeTruthy();
    expect(flag.severity).toBe('warn');

    const boundary = { ...validDrug, id: 109, number_of_times_a_day: '2-3 раза в день', mgs_max: 30 };
    const r2 = DoseAudit.runAudit([boundary]);
    expect(r2.issues.filter(i => i.code === 'daily_limit')).toEqual([]);
  });

  it('high_range без high_modifier → warn; mls_max < mls_var → warn', () => {
    const noMod = { ...validDrug, id: 110, high_range: true };
    const r1 = DoseAudit.runAudit([noMod]);
    expect(r1.issues.some(i => i.code === 'high_range_sanity' && i.severity === 'warn')).toBe(true);

    const badMlsMax = { ...validDrug, id: 111, mls_max: 0.2 };
    const r2 = DoseAudit.runAudit([badMlsMax]);
    expect(r2.issues.some(i => i.code === 'high_range_sanity' && i.severity === 'warn')).toBe(true);
  });
});

describe('DoseAudit.runAudit — summary counts на смешанном наборе', () => {
  it('drugsChecked, combosChecked, errors, warnings корректны', () => {
    const hole = drugWithTable(112, 'Hole', [
      { weight_min: 3, weight_max: 5, dose_ml: 2, dose_mg: 40 },
      { weight_min: 7, weight_max: 9, dose_ml: 4, dose_mg: 80 }
    ]);
    const noTable = {
      id: 113, category_id: 1, name: 'Без таблицы',
      mgs_var: 20, mgs_max: 30,
      number_of_times_a_day: '3-4 раза в день',
      min_weight_kg: 3
    };
    const { issues, summary } = DoseAudit.runAudit([validDrug, hole, noTable]);

    expect(summary.drugsChecked).toBe(3);
    // сетка: validDrug 3..7 → 5 весов; hole 3..9 → 7 весов; noTable — без сетки
    expect(summary.combosChecked).toBe(12);
    // hole: разрыв (error) + дыры на 5 и 6 кг (2 error)
    expect(summary.errors).toBe(3);
    // noTable: 20 мг/кг × 4 = 80 > 30 × 1.001 → warn
    expect(summary.warnings).toBe(1);
    expect(issues.length).toBe(summary.errors + summary.warnings);
  });
});
