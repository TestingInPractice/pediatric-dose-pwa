(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => document.querySelectorAll(sel);

  let drugs = [];
  let categories = [];
  let patients = [];
  let currentResult = null;
  let currentPatientId = null;
  let historyFilterDays = null;

  async function init() {
    try { await DB.init(); } catch (e) { console.error('DB init failed:', e); }
    bindNav();
    bindCalculator();
    bindConfirm();
    bindProfiles();
    bindHistory();
    bindSettings();
    loadData();
    loadPatients();
  }

  function navigateTo(screen) {
    qsa('.screen').forEach(s => s.classList.remove('active'));
    const target = $(`screen-${screen}`);
    if (target) target.classList.add('active');
    qsa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === screen));
    if (screen !== 'calculator') {
      $('result-section').classList.add('hidden');
      $('go-to-confirm-btn').classList.add('hidden');
      currentResult = null;
    }
  }

  function bindNav() {
    qsa('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.screen);
        if (btn.dataset.screen === 'profiles') loadPatients();
        if (btn.dataset.screen === 'history') renderHistory();
      });
    });
  }

  // ===================== DATA =====================

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

  // ===================== PATIENTS =====================

  async function loadPatients() {
    patients = await DB.getPatients();
    renderPatientSelect();
    renderPatientsList();
  }

  function renderPatientSelect() {
    const select = $('patient-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Без профиля —</option>';
    patients.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${calcAge(p.birthDate)}, ${p.weight || '?'} кг)`;
      select.appendChild(opt);
    });
    if (currentVal && patients.find(p => p.id == currentVal)) select.value = currentVal;
  }

  function renderPatientsList() {
    const container = $('patients-list');
    if (!patients.length) { container.innerHTML = '<p class="text-muted">Нет добавленных детей</p>'; return; }
    container.innerHTML = patients.map(p => {
      const age = calcAge(p.birthDate);
      return `<div class="patient-card" data-id="${p.id}"><div><div class="patient-card-name">${p.name}</div><div class="patient-card-meta">${age}, ${p.weight || '?'} кг${p.height ? ', ' + p.height + ' см' : ''}</div></div><span class="patient-card-arrow">›</span></div>`;
    }).join('');
    container.querySelectorAll('.patient-card').forEach(card => {
      card.addEventListener('click', () => showPatientDetail(parseInt(card.dataset.id)));
    });
  }

  function calcAge(birthDate) {
    if (!birthDate) return '?';
    const now = new Date(), birth = new Date(birthDate);
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (months < 1) return '0 мес';
    if (months < 12) return months + ' мес';
    const years = Math.floor(months / 12), rem = months % 12;
    return rem ? `${years}г ${rem}мес` : `${years} г`;
  }

  function showPatientForm(patient) {
    $('patient-form-card').classList.remove('hidden');
    $('patient-detail-card').classList.add('hidden');
    const title = $('patient-form-title'), id = $('patient-form-id');
    if (patient) {
      title.textContent = '✏️ Редактировать ребёнка';
      id.value = patient.id;
      $('patient-name').value = patient.name;
      $('patient-birth').value = patient.birthDate || '';
      $('patient-weight').value = patient.weight || '';
      $('patient-height').value = patient.height || '';
      $('patient-allergies').value = patient.allergies || '';
    } else {
      title.textContent = '➕ Добавить ребёнка';
      id.value = '';
      $('patient-name').value = '';
      $('patient-birth').value = '';
      $('patient-weight').value = '';
      $('patient-height').value = '';
      $('patient-allergies').value = '';
    }
  }

  async function savePatientForm() {
    const id = $('patient-form-id').value;
    const data = {
      name: $('patient-name').value.trim(),
      birthDate: $('patient-birth').value,
      weight: parseFloat($('patient-weight').value) || null,
      height: parseFloat($('patient-height').value) || null,
      allergies: $('patient-allergies').value.trim() || ''
    };
    if (!data.name) { alert('Введите имя ребёнка'); return; }
    if (id) { await DB.updatePatient(parseInt(id), data); }
    else { await DB.addPatient(data); }
    $('patient-form-card').classList.add('hidden');
    await loadPatients();
    showPatientDetail(parseInt(id) || patients[patients.length - 1].id);
  }

  async function showPatientDetail(id) {
    const p = patients.find(p => p.id === id);
    if (!p) return;
    $('patient-detail-card').classList.remove('hidden');
    $('patient-form-card').classList.add('hidden');
    $('detail-patient-name').textContent = '👶 ' + p.name;
    $('detail-patient-info').innerHTML = `
      <div><strong>Дата рождения:</strong> ${p.birthDate || '—'}</div>
      <div><strong>Возраст:</strong> ${calcAge(p.birthDate)}</div>
      <div><strong>Вес:</strong> ${p.weight ? p.weight + ' кг' : '—'}</div>
      <div><strong>Рост:</strong> ${p.height ? p.height + ' см' : '—'}</div>
      <div><strong>Аллергии:</strong> ${p.allergies || 'нет'}</div>`;
    $('detail-edit-btn').onclick = () => showPatientForm(p);
    $('detail-delete-btn').onclick = async () => {
      if (confirm(`Удалить профиль ${p.name} и всю историю приёмов?`)) {
        await DB.deletePatient(p.id);
        $('patient-detail-card').classList.add('hidden');
        await loadPatients();
      }
    };
    const history = await DB.getHistory(50, p.id);
    const histContainer = $('detail-patient-history');
    if (!history.length) { histContainer.innerHTML = '<p class="text-muted">Нет записей</p>'; return; }
    histContainer.innerHTML = history.map(h => `
      <div class="patient-history-item">
        <div class="drug-name">${h.drug_name || 'Препарат #' + h.drug_id}</div>
        <div class="history-meta">${h.dose_ml ? h.dose_ml + ' мл' : ''} ${h.dose_mg ? '· ' + h.dose_mg + ' мг' : ''} · ${formatDate(h.timestamp)}</div>
      </div>
    `).join('');
  }

  function bindProfiles() {
    $('add-patient-btn').addEventListener('click', () => showPatientForm(null));
    $('patient-form-cancel').addEventListener('click', () => $('patient-form-card').classList.add('hidden'));
    $('patient-form-save').addEventListener('click', savePatientForm);
    $('patient-name').addEventListener('keydown', e => { if (e.key === 'Enter') savePatientForm(); });
  }

  // ===================== CALCULATOR =====================

  function bindCalculator() {
    const weightInput = $('weight-input'), drugSelect = $('drug-select');
    const patientSelect = $('patient-select'), calcBtn = $('calc-btn');
    const confirmBtn = $('go-to-confirm-btn');

    patientSelect.addEventListener('change', () => {
      currentPatientId = patientSelect.value ? parseInt(patientSelect.value) : null;
      const patient = patients.find(p => p.id === currentPatientId);
      if (patient && patient.weight) weightInput.value = patient.weight;
      checkReady();
    });

    function checkReady() { calcBtn.disabled = !(weightInput.value && drugSelect.value); }
    weightInput.addEventListener('input', checkReady);
    drugSelect.addEventListener('change', checkReady);
    calcBtn.addEventListener('click', handleCalculate);
    weightInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !calcBtn.disabled) handleCalculate(); });
    confirmBtn.addEventListener('click', () => renderConfirmScreen());
  }

  async function handleCalculate() {
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

      const btn = $('go-to-confirm-btn');
      if (currentPatientId) btn.classList.remove('hidden');
      else btn.classList.add('hidden');

      try {
        const id = await DB.saveCalculation({
          patient_id: currentPatientId, drug_id: drug.id, drug_name: drug.name,
          weight, dose_ml: result.standard_dose_ml, dose_mg: result.standard_dose_mg
        });
        currentResult.dbId = id;
      } catch (_) {}
    } catch (e) { showError(e.message); }
  }

  function renderResult(drug, weight, result) {
    $('result-drug').textContent = drug.name;
    const patient = patients.find(p => p.id === currentPatientId);
    $('result-weight').textContent = patient ? `${patient.name}, ${weight} кг` : `Вес: ${weight} кг`;
    let html = '';
    if (result.standard_dose_ml != null) html += doseItem('Стандартная доза (мл)', result.standard_dose_ml + ' мл');
    if (result.standard_dose_mg != null) html += doseItem('Стандартная доза (мг)', result.standard_dose_mg + ' мг');
    if (result.high_dose_ml != null) html += doseItem('Повышенная доза (мл)', result.high_dose_ml + ' мл');
    if (result.suppositories_min != null) {
      html += doseItem('Обычная доза (свечи)', result.suppositories_min + ' шт');
      html += doseItem('Повышенная доза (свечи)', result.suppositories_high + ' шт');
    }
    if (result.max_dose_ml != null) html += doseItem('Макс. в сутки (мл)', result.max_dose_ml + ' мл', true);
    if (result.formula_parts && result.formula_parts.length) html += `<div class="formula-box">${result.formula_parts.join('\n')}</div>`;
    if (drug.number_of_times_a_day) html += doseItem('Кратность приёма', drug.number_of_times_a_day);
    $('result-doses').innerHTML = html;
  }

  function doseItem(label, value, danger) {
    return `<div class="dose-item"><span class="dose-label">${label}</span><span class="dose-value ${danger ? 'danger' : ''}">${value}</span></div>`;
  }

  // ===================== CONFIRM =====================

  async function renderConfirmScreen() {
    navigateTo('confirm');
    const body = $('confirm-body');
    const pending = await DB.getPending();

    if (!pending.length) { body.innerHTML = '<p class="text-muted">Нет ожидающих подтверждения</p>'; return; }

    const pendingHtml = await Promise.all(pending.map(async h => {
      const patient = patients.find(p => p.id === h.patient_id);
      const drug = drugs.find(d => d.id === h.drug_id);
      let intervalHtml = '', canConfirm = true;

      const recentConfirmed = (patient && drug) ? await DB.getRecentConfirmed(patient.id, 12) : [];
      const lastSameDrug = recentConfirmed.find(r => r.drug_id === h.drug_id);
      const lastSameCategory = drug ? recentConfirmed.find(r => { const rd = drugs.find(d => d.id === r.drug_id); return rd && rd.category_id === drug.category_id; }) : null;

      if (lastSameDrug || lastSameCategory) {
        const target = lastSameDrug || lastSameCategory;
        const diffHours = (Date.now() - new Date(target.timestamp).getTime()) / (1000 * 60 * 60);
        const isSameDrug = !!lastSameDrug;
        const minInterval = isSameDrug ? 4 : 3;
        const label = isSameDrug ? 'этого же препарата' : 'препарата той же группы (жаропонижающие/антибиотики)';
        if (diffHours < minInterval) {
          const remaining = (minInterval - diffHours).toFixed(1);
          intervalHtml = `<div class="tracker-alert warning">⚠️ Последний приём ${label} был ${diffHours.toFixed(1)} ч назад. Минимальный интервал: ${minInterval} ч. Подождите ещё ${remaining} ч.</div>`;
          if (isSameDrug) canConfirm = false;
        } else {
          intervalHtml = `<div class="tracker-alert success">✅ Интервал ${minInterval} ч соблюдён.</div>`;
        }
      } else if (recentConfirmed.length) {
        intervalHtml = `<div class="tracker-alert success">✅ Последний приём — препарат из другой группы, интервал не требуется.</div>`;
      } else {
        intervalHtml = `<div class="tracker-alert info">ℹ️ Первый приём для этого ребёнка.</div>`;
      }

      return `<div class="pending-item card" data-id="${h.id}"><div class="card-body">${intervalHtml}
        <div class="confirm-detail-row"><span class="confirm-detail-label">Ребёнок</span><span class="confirm-detail-value">${patient ? patient.name : '—'}</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Препарат</span><span class="confirm-detail-value">${h.drug_name || 'Препарат #' + h.drug_id}</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Доза</span><span class="confirm-detail-value">${h.dose_ml || '?'} мл (${h.dose_mg || '?'} мг)</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Время расчёта</span><span class="confirm-detail-value">${formatDate(h.timestamp)}</span></div>
        <div class="pending-actions">
          <button class="btn ${canConfirm ? 'btn-primary' : 'btn-danger'} confirm-item-btn" data-id="${h.id}" ${canConfirm ? '' : 'disabled'}>${canConfirm ? '✅ Подтвердить' : '⚠️ Слишком рано'}</button>
          <button class="btn btn-secondary reject-item-btn" data-id="${h.id}">✕ Отклонить</button>
        </div></div></div>`;
    }));

    body.innerHTML = pendingHtml.join('');

    body.querySelectorAll('.confirm-item-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.confirmAdministration(parseInt(btn.dataset.id));
        btn.closest('.pending-item').remove();
        if (!body.querySelector('.pending-item')) body.innerHTML = '<p class="text-muted">Нет ожидающих подтверждения</p>';
      });
    });

    body.querySelectorAll('.reject-item-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Отклонить приём? Запись будет удалена.')) return;
        await DB.deleteHistoryItem(parseInt(btn.dataset.id));
        btn.closest('.pending-item').remove();
        if (!body.querySelector('.pending-item')) body.innerHTML = '<p class="text-muted">Нет ожидающих подтверждения</p>';
      });
    });
  }

  function bindConfirm() {
    $('confirm-back-btn').addEventListener('click', () => navigateTo('calculator'));
  }

  // ===================== VALIDATION =====================

  function renderValidationLevels(drug, weight, result) {
    const container = $('validation-levels'), section = $('validation-section');
    const l2 = Level2Rules.validate(drug, weight, result);
    let html = `<div class="validation-level"><span class="level-icon">${l2.status === 'pass' ? '✅' : '⚠️'}</span><div class="level-content"><div class="level-title">L2: Экспертная система (правила)</div>`;
    l2.checks.forEach(c => { const icon = c.status === 'pass' ? '✅' : c.status === 'error' ? '🚫' : 'ℹ️'; html += `<div class="level-desc">${icon} ${c.detail}</div>`; });
    html += `</div></div><div class="validation-level"><span class="level-icon">🔲</span><div class="level-content"><div class="level-title">L3: ML-модель (ONNX)</div><div class="level-desc">Будет добавлена в следующем обновлении</div></div></div>
      <div style="margin-top:8px;font-weight:600;font-size:14px">${l2.status === 'pass' ? '✅ Все проверки пройдены' : '⚠️ Есть предупреждения'}</div>`;
    container.innerHTML = html;
    section.classList.remove('hidden');
  }

  function renderInstruction(drug, weight) {
    const section = $('instruction-section'), body = $('instruction-body');
    let html = '';
    if (drug.instructions) html += `<p style="margin-bottom:12px">${drug.instructions}</p>`;
    if (drug.dose_table && drug.dose_table.length) {
      html += `<table class="instruction-table"><thead><tr><th>Вес (кг)</th><th>Доза (мл)</th><th>Доза (мг)</th></tr></thead><tbody>`;
      let foundMatch = false;
      drug.dose_table.forEach(row => {
        const highlight = weight >= row.weight_min && weight < row.weight_max;
        if (highlight) foundMatch = true;
        const cls = highlight ? ' class="highlight-row"' : '';
        let doseDisplay = row.dose_ml;
        if (drug.form === 'суппозитории') { doseDisplay = row.dose_ml + ' свеча'; if (row.dose_ml > 1) doseDisplay += '(-и)'; }
        html += `<tr${cls}><td>${row.weight_min}-${row.weight_max}</td><td>${doseDisplay}</td><td>${row.dose_mg} мг</td></tr>`;
      });
      if (!foundMatch) html += `<tr class="highlight-row"><td colspan="3">Ваш вес (${weight} кг) — сверьтесь с таблицей</td></tr>`;
      html += `</tbody></table>`;
    }
    if (drug.grls_link) html += `<div class="instruction-source">📎 ГРЛС: <a href="${drug.grls_link}" target="_blank" rel="noopener">открыть инструкцию</a></div>`;
    if (drug.pharmacy_link) html += `<div class="instruction-source">💊 Аптека: <a href="${drug.pharmacy_link}" target="_blank" rel="noopener">проверить цену</a></div>`;
    body.innerHTML = html;
    section.classList.remove('hidden');
  }

  function showError(msg) { $('error-section').textContent = msg; $('error-section').classList.remove('hidden'); $('result-section').classList.add('hidden'); }

  // ===================== HISTORY =====================

  function bindHistory() {
    qsa('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        qsa('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        historyFilterDays = chip.dataset.days ? parseInt(chip.dataset.days) : null;
        renderHistory();
      });
    });
  }

  function renderHistory() {
    DB.getHistory(200).then(all => {
      const container = $('history-list');
      container.innerHTML = '';
      let filtered = all;
      if (historyFilterDays) {
        const cutoff = Date.now() - historyFilterDays * 86400000;
        filtered = all.filter(h => new Date(h.timestamp).getTime() >= cutoff);
      }
      if (!filtered.length) { container.innerHTML = '<p class="text-muted">Нет записей за этот период</p>'; return; }

      const grouped = {};
      filtered.forEach(h => { const day = h.timestamp ? h.timestamp.slice(0, 10) : 'unknown'; if (!grouped[day]) grouped[day] = []; grouped[day].push(h); });

      Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(day => {
        container.innerHTML += `<div class="history-day-header">${formatDayLabel(day)}</div>`;
        grouped[day].forEach(h => {
          const patient = patients.find(p => p.id === h.patient_id);
          const div = document.createElement('div');
          div.className = 'history-item';
          div.innerHTML = `<div class="history-drug">${h.drug_name || 'Препарат'}</div>
            <div class="history-meta">${h.dose_ml || '?'} мл · ${h.dose_mg || '?'} мг · ${formatTime(h.timestamp)}${patient ? ' · ' + patient.name : ''} · ✅ Принято</div>
            <button class="btn btn-sm btn-danger history-delete-btn" data-id="${h.id}" style="margin-top:4px">🗑 Удалить</button>`;
          container.appendChild(div);
        });
      });

      container.querySelectorAll('.history-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Удалить запись из истории?')) return;
          if (!confirm('Вы уверены? Это действие нельзя отменить. Вся ответственность за удаление лежит на вас.')) return;
          await DB.deleteHistoryItem(parseInt(btn.dataset.id));
          btn.closest('.history-item').remove();
        });
      });
    }).catch(() => {});
  }

  function formatDayLabel(isoDay) {
    const today = new Date(), todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    if (isoDay === todayStr) return 'Сегодня';
    if (isoDay === yesterdayStr) return 'Вчера';
    return new Date(isoDay + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  // ===================== SETTINGS =====================

  function bindSettings() {
    $('clear-btn').addEventListener('click', async () => { if (confirm('Очистить всю историю расчётов?')) { await DB.clearHistory(); renderHistory(); } });
    $('export-btn').addEventListener('click', async () => {
      const data = await DB.exportHistory();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dose-history-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
    });
    $('update-btn').addEventListener('click', async () => {
      $('update-btn').textContent = '⏳ Проверка...'; $('update-btn').disabled = true;
      try {
        const resp = await fetch('data/manifest.json?_=' + Date.now());
        const remote = await resp.json();
        $('settings-version').textContent = remote.version;
        $('settings-updated').textContent = remote.updated;
        $('update-btn').textContent = '✅ Актуальная версия';
      } catch (e) {
        $('update-btn').textContent = '❌ Ошибка обновления';
        setTimeout(() => { $('update-btn').textContent = '🔄 Проверить обновления'; $('update-btn').disabled = false; }, 2000);
      }
    });
  }

  function formatDate(iso) { if (!iso) return '—'; return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function formatTime(iso) { if (!iso) return '—'; return new Date(iso).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }

  document.addEventListener('DOMContentLoaded', init);
})();
