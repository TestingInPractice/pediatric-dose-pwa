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
    bindDiary();
    initTheme();
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
        if (btn.dataset.screen === 'diary') renderDiary();
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
    if (!history.length) { histContainer.innerHTML = '<p class="text-muted">Нет записей</p>'; }
    else {
      histContainer.innerHTML = history.map(h => `
        <div class="patient-history-item">
          <div class="drug-name">${h.drug_name || 'Препарат #' + h.drug_id}</div>
          <div class="history-meta">${h.dose_ml ? h.dose_ml + ' мл' : ''} ${h.dose_mg ? '· ' + h.dose_mg + ' мг' : ''} · ${formatDate(h.timestamp)}</div>
        </div>
      `).join('');
    }
    $('detail-report-btn').onclick = () => generateReport(p);
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
        let episodeId = null;
        if (currentPatientId) {
          const active = await DB.getActiveEpisode(currentPatientId);
          if (active) episodeId = active.id;
        }
        const id = await DB.saveCalculation({
          patient_id: currentPatientId, drug_id: drug.id, drug_name: drug.name,
          weight, dose_ml: result.standard_dose_ml, dose_mg: result.standard_dose_mg,
          episode_id: episodeId
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
        const id = parseInt(btn.dataset.id);
        const record = await DB.db.history.get(id);
        if (record && record.patient_id != null && !record.episode_id) {
          const activeEp = await DB.getActiveEpisode(record.patient_id);
          if (activeEp) {
            await DB.db.history.update(id, { episode_id: activeEp.id });
          }
        }
        await DB.confirmAdministration(id);
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

  // ===================== DIARY =====================

  let diaryPatientId = null;
  let diaryActiveEpisode = null;

  function bindDiary() {
    $('diary-modal-close').addEventListener('click', closeModal);
    $('diary-modal').addEventListener('click', e => { if (e.target === $('diary-modal')) closeModal(); });
  }

  function closeModal() {
    $('diary-modal').classList.add('hidden');
  }

  function openModal(title, bodyHtml) {
    $('diary-modal-title').textContent = title;
    $('diary-modal-body').innerHTML = bodyHtml;
    $('diary-modal').classList.remove('hidden');
  }

  function renderDiary() {
    const container = $('diary-patient-selector');
    container.innerHTML = `<select id="diary-patient-select" class="form-select"><option value="">— Выберите ребёнка —</option>
      ${patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>`;

    const select = $('diary-patient-select');
    if (diaryPatientId && patients.find(p => p.id === diaryPatientId)) {
      select.value = diaryPatientId;
    }

    select.addEventListener('change', async () => {
      diaryPatientId = select.value ? parseInt(select.value) : null;
      await loadDiary();
    });

    if (diaryPatientId) loadDiary();
    else {
      $('diary-episode-header').innerHTML = '';
      $('diary-quick-actions').classList.add('hidden');
      $('diary-timeline').innerHTML = '<p class="text-muted">Выберите ребёнка</p>';
    }
  }

  async function loadDiary() {
    if (!diaryPatientId) return;
    diaryActiveEpisode = await DB.getActiveEpisode(diaryPatientId);

    renderEpisodeHeader();
    renderDiaryTimeline();

    const actions = $('diary-quick-actions');
    if (diaryActiveEpisode) {
      actions.classList.remove('hidden');
      actions.querySelectorAll('.quick-btn').forEach(btn => {
        btn.onclick = () => {
          const action = btn.dataset.action;
          if (action === 'temperature') showTempModal();
          else if (action === 'vomit') addVomit();
          else if (action === 'stool') showStoolModal();
          else if (action === 'symptom') showSymptomModal();
        };
      });
    } else {
      actions.classList.add('hidden');
    }
  }

  function renderEpisodeHeader() {
    const container = $('diary-episode-header');
    if (diaryActiveEpisode) {
      const startDate = new Date(diaryActiveEpisode.startDate).toLocaleDateString('ru-RU');
      container.innerHTML = `<div class="episode-active-card">
        <div><div class="episode-active-name">🤒 ${diaryActiveEpisode.name}</div>
        <div class="episode-active-date">с ${startDate}</div></div>
        <div class="episode-active-actions">
          <button class="btn btn-sm btn-secondary" id="episode-edit-btn">✏️</button>
          <button class="btn btn-sm btn-success" id="episode-close-btn">✅</button>
        </div></div>`;
      $('episode-edit-btn').onclick = showEditEpisodeModal;
      $('episode-close-btn').onclick = async () => {
        if (confirm(`Завершить эпизод «${diaryActiveEpisode.name}»?`)) {
          await DB.closeEpisode(diaryActiveEpisode.id);
          diaryActiveEpisode = null;
          await loadDiary();
        }
      };
    } else {
      container.innerHTML = `<button class="btn btn-primary btn-block" id="episode-start-btn">➕ Заболел(а) — начать эпизод</button>`;
      $('episode-start-btn').onclick = showStartEpisodeModal;
    }
  }

  function showStartEpisodeModal() {
    openModal('Новый эпизод', `<div class="form-group">
      <label class="form-label">Название</label>
      <input type="text" class="form-input" id="episode-name-input" placeholder="Например: ОРВИ, Отит..." autofocus>
      <div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px">Можно вписать позже</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="episode-start-cancel">Отмена</button>
      <button class="btn btn-primary" id="episode-start-save">Начать</button>
    </div>`);

    $('episode-start-cancel').onclick = closeModal;
    $('episode-start-save').onclick = async () => {
      const name = ($('episode-name-input').value || '').trim() || 'Болезнь';
      await DB.addEpisode({ patient_id: diaryPatientId, name, startDate: new Date().toISOString() });
      closeModal();
      await loadDiary();
    };
    $('episode-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('episode-start-save').click(); });
    setTimeout(() => $('episode-name-input').focus(), 100);
  }

  function showEditEpisodeModal() {
    const ep = diaryActiveEpisode;
    if (!ep) return;
    openModal('Редактировать эпизод', `<div class="form-group">
      <label class="form-label">Название</label>
      <input type="text" class="form-input" id="episode-edit-name" value="${ep.name}">
    </div>
    <div class="form-group">
      <label class="form-label">Заметки</label>
      <input type="text" class="form-input" id="episode-edit-notes" value="${ep.notes || ''}" placeholder="Опционально">
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="episode-edit-cancel">Отмена</button>
      <button class="btn btn-primary" id="episode-edit-save">Сохранить</button>
    </div>`);

    $('episode-edit-cancel').onclick = closeModal;
    $('episode-edit-save').onclick = async () => {
      const name = ($('episode-edit-name').value || '').trim();
      if (!name) { alert('Введите название'); return; }
      await DB.updateEpisode(ep.id, { name, notes: ($('episode-edit-notes').value || '').trim() });
      closeModal();
      await loadDiary();
    };
  }

  // --- Quick Actions ---

  function showTempModal() {
    openModal('🌡 Температура', `<div class="form-group">
      <label class="form-label">Температура (°C)</label>
      <input type="number" class="form-input" id="temp-input" step="0.1" min="34" max="42" placeholder="36.6" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">Метод измерения</label>
      <select class="form-select" id="temp-method">
        <option value="подмышка">Подмышечная впадина</option>
        <option value="рот">Ротовая полость</option>
        <option value="ректально">Ректально</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="temp-cancel">Отмена</button>
      <button class="btn btn-primary" id="temp-save">Сохранить</button>
    </div>`);

    $('temp-cancel').onclick = closeModal;
    $('temp-save').onclick = async () => {
      const val = parseFloat($('temp-input').value);
      if (isNaN(val) || val < 34 || val > 42) { alert('Введите корректную температуру (34-42°C)'); return; }
      await DB.addSymptom({
        patient_id: diaryPatientId, episode_id: diaryActiveEpisode.id,
        type: 'temperature', value: val,
        method: $('temp-method').value,
        timestamp: new Date().toISOString()
      });
      closeModal();
      renderDiaryTimeline();
    };
    $('temp-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('temp-save').click(); });
    setTimeout(() => $('temp-input').focus(), 100);
  }

  async function addVomit() {
    await DB.addSymptom({
      patient_id: diaryPatientId, episode_id: diaryActiveEpisode.id,
      type: 'vomit', value: null,
      timestamp: new Date().toISOString()
    });
    renderDiaryTimeline();
  }

  function showStoolModal() {
    const types = [
      { id: 1, emoji: '🔩', label: 'Отдельные шарики' },
      { id: 2, emoji: '🥜', label: 'Комковатая колбаска' },
      { id: 3, emoji: '🌽', label: 'Колбаска с трещинами' },
      { id: 4, emoji: '🍌', label: 'Гладкая колбаска' },
      { id: 5, emoji: '🧇', label: 'Мягкие шарики' },
      { id: 6, emoji: '🥣', label: 'Кашица' },
      { id: 7, emoji: '💧', label: 'Водянистый' }
    ];

    const grid = types.map(t =>
      `<div class="bristol-item" data-type="${t.id}">
        <span class="bristol-item-emoji">${t.emoji}</span>
        <span class="bristol-item-label">${t.label}</span>
      </div>`
    ).join('');

    openModal('💩 Стул (Бристольская шкала)', `<div class="bristol-grid">${grid}</div>
      <p style="font-size:12px;color:var(--color-text-secondary);margin-top:8px">Типы 1-2: запор. Типы 3-5: норма. Типы 6-7: диарея.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="stool-cancel">Отмена</button>
        <button class="btn btn-primary" id="stool-save" disabled>Выберите тип</button>
      </div>`);

    let selected = null;
    $('diary-modal-body').querySelectorAll('.bristol-item').forEach(el => {
      el.addEventListener('click', () => {
        $('diary-modal-body').querySelectorAll('.bristol-item').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        selected = parseInt(el.dataset.type);
        $('stool-save').textContent = `💩 Тип ${selected} — сохранить`;
        $('stool-save').disabled = false;
      });
    });

    $('stool-cancel').onclick = closeModal;
    $('stool-save').onclick = async () => {
      if (!selected) return;
      await DB.addSymptom({
        patient_id: diaryPatientId, episode_id: diaryActiveEpisode.id,
        type: 'stool', value: selected,
        timestamp: new Date().toISOString()
      });
      closeModal();
      renderDiaryTimeline();
    };
  }

  function showSymptomModal() {
    openModal('🤒 Симптом', `<div class="form-group">
      <label class="form-label">Что беспокоит</label>
      <input type="text" class="form-input" id="symptom-name-input" placeholder="Кашель, насморк, сыпь..." autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">Выраженность</label>
      <div class="severity-group">
        <div class="severity-btn" data-severity="mild">🌱 Слабо</div>
        <div class="severity-btn" data-severity="moderate">🌿 Средне</div>
        <div class="severity-btn" data-severity="severe">🔥 Сильно</div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="symptom-cancel">Отмена</button>
      <button class="btn btn-primary" id="symptom-save">Сохранить</button>
    </div>`);

    let severity = 'moderate';
    $('diary-modal-body').querySelectorAll('.severity-btn').forEach(el => {
      el.addEventListener('click', () => {
        $('diary-modal-body').querySelectorAll('.severity-btn').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        severity = el.dataset.severity;
      });
    });
    $('diary-modal-body').querySelector('.severity-btn[data-severity="moderate"]').classList.add('selected');

    $('symptom-cancel').onclick = closeModal;
    $('symptom-save').onclick = async () => {
      const name = ($('symptom-name-input').value || '').trim();
      if (!name) { alert('Опишите симптом'); return; }
      await DB.addSymptom({
        patient_id: diaryPatientId, episode_id: diaryActiveEpisode.id,
        type: 'symptom', notes: name, severity,
        timestamp: new Date().toISOString()
      });
      closeModal();
      renderDiaryTimeline();
    };
    $('symptom-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('symptom-save').click(); });
    setTimeout(() => $('symptom-name-input').focus(), 100);
  }

  // --- Timeline ---

  async function renderDiaryTimeline() {
    const container = $('diary-timeline');
    if (!diaryPatientId) { container.innerHTML = '<p class="text-muted">Выберите ребёнка</p>'; return; }

    const episodeId = diaryActiveEpisode ? diaryActiveEpisode.id : null;

    const [symptoms, historyItems] = await Promise.all([
      DB.getSymptoms(diaryPatientId, episodeId, 200),
      DB.getHistory(200, diaryPatientId)
    ]);

    const events = [];

    symptoms.forEach(s => {
      events.push({
        type: s.type,
        timestamp: s.timestamp,
        data: s,
        sortKey: s.timestamp
      });
    });

    const histFiltered = episodeId
      ? historyItems.filter(h =>
          h.episode_id === episodeId ||
          (h.timestamp && diaryActiveEpisode && h.timestamp >= diaryActiveEpisode.startDate)
        )
      : historyItems.filter(h => !h.episode_id);

    histFiltered.forEach(h => {
      events.push({
        type: 'drug',
        timestamp: h.timestamp,
        data: h,
        sortKey: h.timestamp
      });
    });

    events.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));

    if (!events.length) {
      container.innerHTML = `<div class="timeline-empty">${episodeId ? 'Нет событий в этом эпизоде' : 'Нет записей'}</div>`;
      return;
    }

    // Check if we should show temp chart
    const temps = events.filter(e => e.type === 'temperature').slice(0, 48);

    let html = '';

    if (temps.length >= 2) {
      html += `<div class="temp-chart-container"><canvas id="temp-chart-canvas" height="120"></canvas>
        <div class="temp-chart-labels"><span>-24ч</span><span>Сейчас</span></div></div>`;
    }

    // Group by day
    const grouped = {};
    events.forEach(e => {
      const day = e.timestamp ? e.timestamp.slice(0, 10) : 'unknown';
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(e);
    });

    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(day => {
      html += `<div class="timeline-day-header">${formatDayLabel(day)}</div>`;
      grouped[day].forEach(e => {
        const d = e.data;
        let emoji = '', title = '', desc = '';

        switch (e.type) {
          case 'temperature':
            emoji = '🌡';
            title = `${d.value}°C`;
            if (d.method) title += ` (${d.method})`;
            desc = tempInterpretation(d.value);
            break;
          case 'vomit':
            emoji = '🤮';
            title = 'Рвота';
            desc = '';
            break;
          case 'stool':
            emoji = '💩';
            title = `Стул — тип ${d.value}`;
            desc = bristolLabel(d.value);
            break;
          case 'symptom':
            emoji = '🤒';
            title = d.notes || 'Симптом';
            desc = severityLabel(d.severity);
            break;
          case 'drug':
            emoji = '💊';
            title = d.drug_name || 'Препарат';
            desc = d.dose_ml ? `${d.dose_ml} мл (${d.dose_mg} мг)` : `${d.dose_mg} мг`;
            break;
        }

        const cssType = e.type === 'drug' ? 'drug' : e.type;
        const time = formatTime(e.timestamp);
        html += `<div class="timeline-event type-${cssType}">
          <div class="timeline-event-emoji">${emoji}</div>
          <div class="timeline-event-body">
            <div class="timeline-event-title">${title}</div>
            ${desc ? `<div class="timeline-event-desc">${desc}</div>` : ''}
            <div class="timeline-event-time">${time}</div>
          </div>
        </div>`;
      });
    });

    container.innerHTML = html;

    if (temps.length >= 2) {
      renderTempChart(temps);
    }
  }

  function tempInterpretation(val) {
    if (val < 37.2) return 'Норма';
    if (val < 38) return 'Субфебрильная';
    if (val < 39) return 'Фебрильная';
    if (val < 40) return 'Высокая';
    return 'Очень высокая — нужен врач';
  }

  function bristolLabel(type) {
    const labels = ['', 'Запор (тип 1)', 'Запор (тип 2)', 'Норма (тип 3)', 'Норма (тип 4)', 'Норма (тип 5)', 'Диарея (тип 6)', 'Диарея (тип 7)'];
    return labels[type] || '';
  }

  function severityLabel(s) {
    const map = { mild: '🌱 Слабо', moderate: '🌿 Средне', severe: '🔥 Сильно' };
    return map[s] || '';
  }

  function renderTempChart(temps) {
    const canvas = $('temp-chart-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 16;
    canvas.height = 120;

    const w = canvas.width, h = canvas.height;
    const padding = { top: 16, bottom: 20, left: 32, right: 8 };

    const sorted = [...temps].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    const values = sorted.map(e => e.data.value);
    const minTemp = 35;
    const maxTemp = 41;
    const range = maxTemp - minTemp;

    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    function yPos(val) { return padding.top + chartH - ((val - minTemp) / range) * chartH; }
    function xPos(i) { return padding.left + (i / Math.max(values.length - 1, 1)) * chartW; }

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = document.documentElement.classList.contains('dark') ? '#333' : '#eee';
    ctx.lineWidth = 0.5;
    for (let t = 36; t <= 40; t += 1) {
      const y = yPos(t);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#9e9e9e' : '#757575';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(t + '°', padding.left - 4, y + 3);
    }

    // Fever zones
    ctx.fillStyle = 'rgba(229, 57, 53, 0.08)';
    ctx.fillRect(padding.left, yPos(39), chartW, yPos(37.5) - yPos(39));

    ctx.fillStyle = 'rgba(245, 124, 0, 0.06)';
    ctx.fillRect(padding.left, yPos(37.5), chartW, padding.top + chartH - yPos(37.5));

    // Threshold lines
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 1;
    const y39 = yPos(39);
    ctx.beginPath(); ctx.moveTo(padding.left, y39); ctx.lineTo(w - padding.right, y39); ctx.stroke();
    ctx.fillStyle = '#e53935'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('39°', w - padding.right - 20, y39 - 2);

    ctx.strokeStyle = '#f57c00';
    const y375 = yPos(37.5);
    ctx.beginPath(); ctx.moveTo(padding.left, y375); ctx.lineTo(w - padding.right, y375); ctx.stroke();
    ctx.fillStyle = '#f57c00';
    ctx.fillText('37.5°', w - padding.right - 22, y375 - 2);
    ctx.setLineDash([]);

    // Line
    ctx.strokeStyle = '#1976d2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = xPos(i), y = yPos(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    values.forEach((v, i) => {
      const x = xPos(i), y = yPos(v);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = v >= 39 ? '#e53935' : v >= 37.5 ? '#f57c00' : '#1976d2';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  // ===================== DOCTOR REPORT =====================

  async function generateReport(patient) {
    if (!patient) return;
    const [history, episodes, symptoms] = await Promise.all([
      DB.getHistory(500, patient.id),
      DB.getEpisodes(patient.id),
      DB.getSymptoms(patient.id, null, 500)
    ]);

    const age = calcAge(patient.birthDate);
    let text = `=== ДОКТОР-РЕПОРТ ===\n`;
    text += `\n👶 ${patient.name}\n`;
    text += `📅 ${patient.birthDate || '—'} (${age})\n`;
    text += `⚖️ ${patient.weight ? patient.weight + ' кг' : '—'}\n`;
    text += `📏 ${patient.height ? patient.height + ' см' : '—'}\n`;
    text += `⚠️ Аллергии: ${patient.allergies || 'нет'}\n`;
    text += `📄 Создан: ${new Date().toLocaleString('ru-RU')}\n`;
    text += `\n${'='.repeat(40)}\n\n`;

    if (episodes.length) {
      text += `📋 ЭПИЗОДЫ БОЛЕЗНИ\n\n`;
      episodes.forEach(ep => {
        const start = new Date(ep.startDate).toLocaleDateString('ru-RU');
        const end = ep.endDate ? new Date(ep.endDate).toLocaleDateString('ru-RU') : 'продолжается';
        text += `🤒 ${ep.name} (${start} — ${end})\n`;
        if (ep.notes) text += `   Заметки: ${ep.notes}\n`;

        const epSymptoms = symptoms.filter(s => s.episode_id === ep.id);
        const epHistory = history.filter(h => h.episode_id === ep.id);

        if (epSymptoms.length) {
          text += `\n   Симптомы:\n`;
          epSymptoms.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(s => {
            const t = formatDateTime(s.timestamp);
            switch (s.type) {
              case 'temperature': text += `   🌡 ${t} — ${s.value}°C (${s.method || '—'}) ${tempInterpretation(s.value)}\n`; break;
              case 'vomit': text += `   🤮 ${t} — Рвота\n`; break;
              case 'stool': text += `   💩 ${t} — Стул тип ${s.value} (${bristolLabel(s.value)})\n`; break;
              case 'symptom': text += `   🤒 ${t} — ${s.notes || 'Симптом'} (${severityLabel(s.severity) || '—'})\n`; break;
            }
          });
        }

        if (epHistory.length) {
          text += `\n   Препараты:\n`;
          epHistory.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(h => {
            const t = formatDateTime(h.timestamp);
            text += `   💊 ${t} — ${h.drug_name || 'Препарат'}: ${h.dose_ml || '—'} мл (${h.dose_mg || '—'} мг)\n`;
          });
        }
        text += '\n';
      });
    }

    if (!episodes.length) {
      text += `📋 ИСТОРИЯ ПРИЁМОВ\n\n`;
      if (history.length) {
        history.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(h => {
          text += `💊 ${formatDateTime(h.timestamp)} — ${h.drug_name || 'Препарат'}: ${h.dose_ml || '—'} мл (${h.dose_mg || '—'} мг)\n`;
        });
      } else {
        text += 'Нет записей\n';
      }
      text += '\n';
      if (symptoms.length) {
        text += `📋 СИМПТОМЫ\n\n`;
        symptoms.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(s => {
          const t = formatDateTime(s.timestamp);
          switch (s.type) {
            case 'temperature': text += `🌡 ${t} — ${s.value}°C\n`; break;
            case 'vomit': text += `🤮 ${t} — Рвота\n`; break;
            case 'stool': text += `💩 ${t} — Стул тип ${s.value}\n`; break;
            case 'symptom': text += `🤒 ${t} — ${s.notes || 'Симптом'}\n`; break;
          }
        });
      }
    }

    text += `${'='.repeat(40)}\n`;
    text += `⚠️ Калькулятор предназначен для ознакомительных целей.\n`;
    text += `Перед применением любых лекарств проконсультируйтесь с врачом.\n`;

    openModal('📋 Доктор-репорт', `<textarea class="form-input" style="min-height:200px;resize:vertical;font-size:13px;font-family:monospace" readonly>${text}</textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="report-close">Закрыть</button>
        <button class="btn btn-primary" id="report-copy">📋 Копировать</button>
      </div>`);

    $('report-close').onclick = closeModal;
    $('report-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        $('report-copy').textContent = '✅ Скопировано';
        setTimeout(() => { $('report-copy').textContent = '📋 Копировать'; }, 2000);
      } catch {
        alert('Не удалось скопировать. Выделите текст вручную.');
      }
    };
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // ===================== THEME =====================

  let currentTheme = 'auto';

  function initTheme() {
    const saved = localStorage.getItem('dose_pwa_theme') || 'auto';
    currentTheme = saved;
    applyTheme(saved);

    const chips = document.querySelectorAll('#theme-switcher .filter-chip');
    chips.forEach(c => c.classList.toggle('active', c.dataset.theme === saved));
    chips.forEach(c => {
      c.addEventListener('click', () => {
        chips.forEach(ch => ch.classList.remove('active'));
        c.classList.add('active');
        currentTheme = c.dataset.theme;
        localStorage.setItem('dose_pwa_theme', currentTheme);
        applyTheme(currentTheme);
      });
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (currentTheme === 'auto') applyTheme('auto');
    });
  }

  function applyTheme(mode) {
    const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? '#121212' : '#1976d2';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
