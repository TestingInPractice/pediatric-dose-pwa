(function () {
  'use strict';

  // Тюнибельные константы аудита
  const ROW_DEVIATION_TOLERANCE = 0.35;   // допустимое отклонение строки таблицы от формулы (35%)
  const DAILY_LIMIT_TOLERANCE = 1.001;    // допуск на округление суточного лимита
  const GRID_MIN_WEIGHT = 3;              // нижняя граница сетки весов, кг
  const DEFAULT_MIN_WEIGHT = 3;           // min_weight_kg по умолчанию

  function parseMaxPerDay(s) {
    if (!s) return null;
    const nums = String(s).match(/\d+/g);
    if (!nums || !nums.length) return null;
    return Math.max.apply(null, nums.map(Number));
  }

  function round1(x) { return Math.round(x * 10) / 10; }

  // Малые значения (капли: 0.04 мг/кг) не должны печататься как «0»
  function fmt(x) { return (x > 0 && x < 1) ? Math.round(x * 100) / 100 : round1(x); }

  function addIssue(issues, drug, severity, code, message) {
    issues.push({ drugId: drug.id, drugName: drug.name, severity, code, message });
  }

  function checkTableStructure(drug, rows, issues) {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1], cur = rows[i];
      if (cur.weight_min < prev.weight_min) {
        addIssue(issues, drug, 'error', 'table_structure',
          `Таблица не отсортирована: строка ${round1(cur.weight_min)}–${round1(cur.weight_max)} кг идёт после ${round1(prev.weight_min)}–${round1(prev.weight_max)} кг`);
        return;
      }
      if (cur.weight_min > prev.weight_max) {
        addIssue(issues, drug, 'error', 'table_structure',
          `Разрыв в таблице: между ${round1(prev.weight_min)}–${round1(prev.weight_max)} и ${round1(cur.weight_min)}–${round1(cur.weight_max)} кг нет строки`);
      } else if (cur.weight_min < prev.weight_max) {
        addIssue(issues, drug, 'error', 'table_structure',
          `Перекрытие строк таблицы: ${round1(prev.weight_min)}–${round1(prev.weight_max)} и ${round1(cur.weight_min)}–${round1(cur.weight_max)} кг`);
      }
    }
    const mw = drug.min_weight_kg || DEFAULT_MIN_WEIGHT;
    const coverLimit = Math.ceil(mw) + 1;
    if (rows[0].weight_min > coverLimit) {
      addIssue(issues, drug, 'warn', 'table_structure',
        `Таблица не покрывает минимальный вес: первая строка с ${round1(rows[0].weight_min)} кг при минимуме ${round1(mw)} кг`);
    }
  }

  function checkRowVsFormula(drug, rows, issues) {
    if (!(drug.mgs_var > 0)) return;
    if (drug.units && drug.units !== 'мг') return;
    rows.forEach(row => {
      if (row.dose_mg == null) return;
      const mid = (row.weight_min + row.weight_max) / 2;
      if (!mid) return;
      const expected = row.dose_mg / mid;
      if (Math.abs(expected - drug.mgs_var) / drug.mgs_var > ROW_DEVIATION_TOLERANCE) {
        addIssue(issues, drug, 'warn', 'row_vs_formula',
          `Строка ${round1(row.weight_min)}–${row.weight_max} кг: ${fmt(expected)} мг/кг против формулы ${fmt(drug.mgs_var)} мг/кг`);
      }
    });
  }

  function checkGridGap(drug, rows, issues) {
    let last = rows[0];
    rows.forEach(r => { if (r.weight_max > last.weight_max) last = r; });
    const start = Math.max(GRID_MIN_WEIGHT, Math.ceil(drug.min_weight_kg || DEFAULT_MIN_WEIGHT));
    const end = Math.floor(last.weight_max);
    let combos = 0;
    for (let w = start; w <= end; w++) {
      combos++;
      if (w >= last.weight_max) continue; // за последней строкой — экстраполяция формулой, это норма
      const covered = rows.some(r => r.weight_min <= w && w < r.weight_max);
      if (!covered) {
        addIssue(issues, drug, 'error', 'grid_gap', `Нет строки таблицы для веса ${w} кг`);
      }
    }
    return combos;
  }

  function checkDailyLimit(drug, issues) {
    const n = parseMaxPerDay(drug.number_of_times_a_day);
    if (n == null || drug.mgs_max == null || !(drug.mgs_var > 0)) return;
    const daily = drug.mgs_var * n;
    if (daily > drug.mgs_max * DAILY_LIMIT_TOLERANCE) {
      addIssue(issues, drug, 'warn', 'daily_limit',
        `Разовая ${fmt(drug.mgs_var)} мг/кг × ${n} приёмов/день = ${fmt(daily)} мг/кг превышает суточный лимит ${fmt(drug.mgs_max)} мг/кг`);
    }
  }

  function checkHighRangeSanity(drug, issues) {
    if (drug.high_range && (typeof drug.high_modifier !== 'number' || drug.high_modifier <= 1)) {
      const mod = typeof drug.high_modifier === 'number' ? `сейчас ${round1(drug.high_modifier)}` : 'не задан';
      addIssue(issues, drug, 'warn', 'high_range_sanity', `Повышенная дозировка включена, но коэффициент high_modifier ≤ 1 или ${mod}`);
    }
    if (drug.mls_max != null && drug.mls_var != null && drug.mls_max < drug.mls_var) {
      addIssue(issues, drug, 'warn', 'high_range_sanity',
        `mls_max (${round1(drug.mls_max)} мл/кг) меньше разовой дозы mls_var (${round1(drug.mls_var)} мл/кг)`);
    }
  }

  function runAudit(drugs) {
    const issues = [];
    const summary = { drugsChecked: 0, combosChecked: 0, errors: 0, warnings: 0 };
    (drugs || []).forEach(drug => {
      if (!drug) return;
      summary.drugsChecked++;
      try {
        const rows = Array.isArray(drug.dose_table) ? drug.dose_table : null;
        if (rows && rows.length) {
          checkTableStructure(drug, rows, issues);
          checkRowVsFormula(drug, rows, issues);
          summary.combosChecked += checkGridGap(drug, rows, issues);
        }
        checkDailyLimit(drug, issues);
        checkHighRangeSanity(drug, issues);
      } catch (_) { /* пропущенные поля не роняют аудит */ }
    });
    summary.errors = issues.filter(i => i.severity === 'error').length;
    summary.warnings = issues.filter(i => i.severity === 'warn').length;
    return { issues, summary };
  }

  function runAndRender(containerEl) {
    if (!containerEl) return;
    const drugs = (typeof Store !== 'undefined' && Store.drugs) ? Store.drugs : [];
    const { issues, summary } = runAudit(drugs);
    let html = `<p class="audit-summary">✅ Препаратов: ${summary.drugsChecked} · комбинаций: ${summary.combosChecked} · ошибок: ${summary.errors} · предупреждений: ${summary.warnings}</p>`;
    if (!issues.length) {
      html += '<p class="text-muted">Аномалий не найдено</p>';
    } else {
      let lastId = null;
      issues.forEach(issue => {
        if (issue.drugId !== lastId) {
          html += `<p class="audit-drug-name">${issue.drugName}</p>`;
          lastId = issue.drugId;
        }
        html += `<div class="audit-issue ${issue.severity}">${issue.message}</div>`;
      });
    }
    containerEl.innerHTML = html;
  }

  const DoseAudit = { runAudit, runAndRender, parseMaxPerDay };

  if (typeof window !== 'undefined') {
    window.DoseAudit = DoseAudit;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DoseAudit };
  }
})();
