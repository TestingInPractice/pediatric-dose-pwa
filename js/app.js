(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => document.querySelectorAll(sel);

  let drugs = [];
  let categories = [];
  let currentResult = null;

  function init() {
    bindNav();
    bindCalculator();
    bindSettings();
    loadData();
  }

  function bindNav() {
    qsa('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        qsa('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        qsa('.screen').forEach(s => s.classList.remove('active'));
        const target = $(`screen-${btn.dataset.screen}`);
        if (target) target.classList.add('active');
      });
    });
  }

  async function loadData() {
    try {
      const stored = localStorage.getItem('dose_pwa_drugs');
      if (stored) {
        const parsed = JSON.parse(stored);
        drugs = parsed.drugs || [];
        categories = parsed.categories || [];
        renderDrugSelect();
        updateVersion();
        return;
      }

      const resp = await fetch('data/drugs.json?_=' + Date.now());
      const data = await resp.json();
      drugs = data.drugs || [];
      categories = data.categories || [];
      localStorage.setItem('dose_pwa_drugs', JSON.stringify({ drugs, categories }));
      renderDrugSelect();
      updateVersion();
    } catch (e) {
      showError('Ошибка загрузки данных: ' + e.message);
    }
  }

  function renderDrugSelect() {
    const select = $('drug-select');
    select.innerHTML = '<option value="">— Выберите препарат —</option>';

    categories.forEach(cat => {
      const group = document.createElement('optgroup');
      group.label = cat.name;
      const catDrugs = drugs.filter(d => d.category_id === cat.id);
      catDrugs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });
  }

  function updateVersion() {
    $('data-version').textContent = '1.0.0';
    $('version-badge').style.display = 'inline';
  }

  function bindCalculator() {
    const weightInput = $('weight-input');
    const drugSelect = $('drug-select');
    const calcBtn = $('calc-btn');

    function checkReady() {
      calcBtn.disabled = !(weightInput.value && drugSelect.value);
    }

    weightInput.addEventListener('input', checkReady);
    drugSelect.addEventListener('change', checkReady);

    calcBtn.addEventListener('click', handleCalculate);

    weightInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !calcBtn.disabled) handleCalculate();
    });
  }

  function handleCalculate() {
    const drugId = parseInt($('drug-select').value);
    const weight = parseFloat($('weight-input').value);

    if (!drugId || !weight || weight <= 0) return;

    const drug = drugs.find(d => d.id === drugId);
    if (!drug) return;

    try {
      const result = Calculator.calculateDose(drug, weight);
      currentResult = { drug, weight, result, timestamp: new Date().toISOString() };

      renderResult(drug, weight, result);
      renderValidationLevels(drug, weight, result);
      renderInstruction(drug, weight);

      $('result-section').classList.remove('hidden');
      $('error-section').classList.add('hidden');

      DB.saveCalculation({
        drug_id: drug.id,
        drug_name: drug.name,
        weight,
        dose_ml: result.standard_dose_ml,
        dose_mg: result.standard_dose_mg
      }).catch(() => {});

    } catch (e) {
      showError(e.message);
    }
  }

  function renderResult(drug, weight, result) {
    $('result-drug').textContent = drug.name;
    $('result-weight').textContent = `Вес: ${weight} кг`;

    const container = $('result-doses');
    let html = '';

    if (result.standard_dose_ml != null) {
      html += `
        <div class="dose-item">
          <span class="dose-label">Стандартная доза (мл)</span>
          <span class="dose-value">${result.standard_dose_ml} мл</span>
        </div>
      `;
    }

    if (result.standard_dose_mg != null) {
      html += `
        <div class="dose-item">
          <span class="dose-label">Стандартная доза (мг)</span>
          <span class="dose-value">${result.standard_dose_mg} мг</span>
        </div>
      `;
    }

    if (result.high_dose_ml != null) {
      html += `
        <div class="dose-item">
          <span class="dose-label">Повышенная доза (мл)</span>
          <span class="dose-value">${result.high_dose_ml} мл</span>
        </div>
      `;
    }

    if (result.suppositories_min != null) {
      html += `
        <div class="dose-item">
          <span class="dose-label">Обычная доза (свечи)</span>
          <span class="dose-value">${result.suppositories_min} шт</span>
        </div>
        <div class="dose-item">
          <span class="dose-label">Повышенная доза (свечи)</span>
          <span class="dose-value">${result.suppositories_high} шт</span>
        </div>
      `;
    }

    if (result.max_dose_ml != null) {
      html += `
        <div class="dose-item">
          <span class="dose-label">Макс. в сутки (мл)</span>
          <span class="dose-value danger">${result.max_dose_ml} мл</span>
        </div>
      `;
    }

    if (result.formula_parts && result.formula_parts.length) {
      html += `
        <div class="formula-box">${result.formula_parts.join('\n')}</div>
      `;
    }

    if (drug.number_of_times_a_day) {
      html += `
        <div class="dose-item">
          <span class="dose-label">Кратность приёма</span>
          <span class="dose-value">${drug.number_of_times_a_day}</span>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  function renderValidationLevels(drug, weight, result) {
    const container = $('validation-levels');
    const section = $('validation-section');

    const l2 = Level2Rules.validate(drug, weight, result);

    let html = '';

    html += `
      <div class="validation-level">
        <span class="level-icon">${l2.status === 'pass' ? '✅' : '⚠️'}</span>
        <div class="level-content">
          <div class="level-title">L2: Экспертная система (правила)</div>
      `;

    l2.checks.forEach(c => {
      const icon = c.status === 'pass' ? '✅' : c.status === 'error' ? '🚫' : 'ℹ️';
      html += `
        <div class="level-desc">${icon} ${c.detail}</div>
      `;
    });

    html += `</div></div>`;

    const l3Note = `
      <div class="validation-level">
        <span class="level-icon">🔲</span>
        <div class="level-content">
          <div class="level-title">L3: ML-модель (ONNX)</div>
          <div class="level-desc">Будет добавлена в следующем обновлении</div>
        </div>
      </div>
    `;

    const status = l2.status === 'pass' ? '✅ Все проверки пройдены' : '⚠️ Есть предупреждения';
    html += l3Note;
    html += `<div style="margin-top:8px;font-weight:600;font-size:14px">${status}</div>`;

    container.innerHTML = html;
    section.classList.remove('hidden');
  }

  function renderInstruction(drug, weight) {
    const section = $('instruction-section');
    const body = $('instruction-body');

    let html = '';

    if (drug.instructions) {
      html += `<p style="margin-bottom:12px">${drug.instructions}</p>`;
    }

    if (drug.dose_table && drug.dose_table.length) {
      html += `<table class="instruction-table"><thead><tr><th>Вес (кг)</th><th>Доза (мл)</th><th>Доза (мг)</th></tr></thead><tbody>`;

      let foundMatch = false;
      drug.dose_table.forEach(row => {
        const highlight = weight >= row.weight_min && weight < row.weight_max;
        if (highlight) foundMatch = true;
        const cls = highlight ? ' class="highlight-row"' : '';
        let doseDisplay = row.dose_ml;
        if (drug.form === 'суппозитории') {
          doseDisplay = row.dose_ml + ' свеча';
          if (row.dose_ml > 1) doseDisplay += '(-и)';
        }
        html += `<tr${cls}><td>${row.weight_min}-${row.weight_max}</td><td>${doseDisplay}</td><td>${row.dose_mg} мг</td></tr>`;
      });

      if (!foundMatch) {
        html += `<tr class="highlight-row"><td colspan="3">Ваш вес (${weight} кг) — сверьтесь с таблицей</td></tr>`;
      }

      html += `</tbody></table>`;
    }

    if (drug.grls_link) {
      html += `<div class="instruction-source">
        📎 ГРЛС: <a href="${drug.grls_link}" target="_blank" rel="noopener">открыть инструкцию</a>
      </div>`;
    }

    if (drug.pharmacy_link) {
      html += `<div class="instruction-source">
        💊 Аптека: <a href="${drug.pharmacy_link}" target="_blank" rel="noopener">проверить цену</a>
      </div>`;
    }

    body.innerHTML = html;
    section.classList.remove('hidden');
  }

  function showError(msg) {
    const section = $('error-section');
    section.textContent = msg;
    section.classList.remove('hidden');
    $('result-section').classList.add('hidden');
  }

  function bindSettings() {
    $('clear-btn').addEventListener('click', async () => {
      if (confirm('Очистить всю историю расчётов?')) {
        await DB.clearHistory();
        renderHistory();
      }
    });

    $('export-btn').addEventListener('click', async () => {
      const data = await DB.exportHistory();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dose-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    $('update-btn').addEventListener('click', async () => {
      $('update-btn').textContent = '⏳ Проверка...';
      $('update-btn').disabled = true;

      try {
        const resp = await fetch('data/manifest.json?_=' + Date.now());
        const remote = await resp.json();
        $('settings-version').textContent = remote.version;
        $('settings-updated').textContent = remote.updated;
        $('update-btn').textContent = '✅ Актуальная версия';
      } catch (e) {
        $('update-btn').textContent = '❌ Ошибка обновления';
        setTimeout(() => {
          $('update-btn').textContent = '🔄 Проверить обновления';
          $('update-btn').disabled = false;
        }, 2000);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
