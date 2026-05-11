(function () {
  'use strict';

  async function init() {
    try { await DB.init(); } catch (e) { console.error('DB init failed:', e); }
    localStorage.removeItem('dose_pwa_drugs');
    bindNav();
    bindCalculator();
    bindConfirm();
    bindProfiles();
    bindHistory();
    bindSettings();
    $('diary-modal-close').addEventListener('click', UI.closeModal);
    $('diary-modal').addEventListener('click', e => { if (e.target === $('diary-modal')) UI.closeModal(); });
    Theme.init();
    await Store.loadData();
    Store.loadPatients().then(() => { Store.renderPatientSelect(); $('patient-select').dispatchEvent(new Event('change')); });
  }

  function navigateTo(screen) {
    qsa('.screen').forEach(s => s.classList.remove('active'));
    const target = $(`screen-${screen}`);
    if (target) target.classList.add('active');
    qsa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === screen));
    if (screen !== 'calculator') {
      $('result-section').classList.add('hidden');
      $('go-to-confirm-btn').classList.add('hidden');
      Store.currentResult = null;
    }
  }

  function bindNav() {
    qsa('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.screen);
        if (btn.dataset.screen === 'profiles') renderPatientsList();
        if (btn.dataset.screen === 'history') renderHistory();
        if (btn.dataset.screen === 'diary') DiaryScreen.render();
        if (btn.dataset.screen === 'calculator') {
          Store.loadPatients().then(() => { Store.renderPatientSelect(); $('patient-select').dispatchEvent(new Event('change')); });
        }
      });
    });
  }

  // ===================== CALCULATOR =====================

  function bindCalculator() {
    const weightInput = $('weight-input'), drugSelect = $('drug-select');
    const patientSelect = $('patient-select'), calcBtn = $('calc-btn');
    const confirmBtn = $('go-to-confirm-btn');

    patientSelect.addEventListener('change', async () => {
      Store.currentPatientId = patientSelect.value ? parseInt(patientSelect.value) : null;
      const patient = Store.patients.find(p => p.id === Store.currentPatientId);
      if (patient && patient.weight) weightInput.value = patient.weight;
      await updateEpisodeIndicator();
      checkReady();
    });

    async function updateEpisodeIndicator() {
      const indicator = $('episode-indicator');
      if (!Store.currentPatientId) { indicator.classList.add('hidden'); return; }
      const active = await DB.getActiveEpisode(Store.currentPatientId);
      if (active) {
        indicator.classList.remove('hidden');
        indicator.innerHTML = `🤒 <span class="episode-indicator-name">${active.name}</span>`;
      } else {
        indicator.classList.add('hidden');
      }
    }

    function checkReady() {
      const patient = Store.patients.find(p => p.id === Store.currentPatientId);
      const hasPatientData = patient && patient.birthDate;
      calcBtn.disabled = !(weightInput.value && drugSelect.value && hasPatientData);
      const msg = $('calc-block-msg');
      if (!Store.patients.length) { msg.textContent = '👶 Добавьте ребёнка в разделе Дети'; msg.classList.remove('hidden'); }
      else if (!patient) { msg.textContent = '👶 Выберите ребёнка'; msg.classList.remove('hidden'); }
      else if (!patient.birthDate) { msg.textContent = '📅 Заполните дату рождения в профиле ребёнка'; msg.classList.remove('hidden'); }
      else { msg.classList.add('hidden'); }
    }
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
    const drug = Store.drugs.find(d => d.id === drugId);
    if (!drug) return;

    const patient = Store.patients.find(p => p.id === Store.currentPatientId);
    if (!patient) { UI.showError('Выберите ребёнка из списка'); return; }
    if (!patient.birthDate) { UI.showError('У ребёнка не указана дата рождения. Заполните её в профиле.'); return; }
    const ageMonths = UI.getAgeMonths(patient.birthDate);

    try {
      const result = Calculator.calculateDose(drug, weight);
      Store.currentResult = { drug, weight, result, timestamp: new Date().toISOString() };

      renderResult(drug, weight, result);
      renderValidationLevels(drug, weight, result, ageMonths);
      renderInstruction(drug, weight);

      $('result-section').classList.remove('hidden');
      $('error-section').classList.add('hidden');

      const btn = $('go-to-confirm-btn');
      if (Store.currentPatientId) btn.classList.remove('hidden');
      else btn.classList.add('hidden');

      try {
        let episodeId = null;
        if (Store.currentPatientId) {
          const active = await DB.getActiveEpisode(Store.currentPatientId);
          if (active) episodeId = active.id;
        }
        const id = await DB.saveCalculation({
          patient_id: Store.currentPatientId, drug_id: drug.id, drug_name: drug.name,
          weight, dose_ml: result.standard_dose_ml, dose_mg: result.standard_dose_mg,
          dose_form: drug.form || null, dose_qty: result.suppositories_min || null,
          episode_id: episodeId
        });
        Store.currentResult.dbId = id;
      } catch (_) {}
    } catch (e) { UI.showError(e.message); }
  }

  function renderResult(drug, weight, result) {
    $('result-drug').textContent = drug.name;
    const patient = Store.patients.find(p => p.id === Store.currentPatientId);
    $('result-weight').textContent = patient ? `${patient.name}, ${weight} кг` : `Вес: ${weight} кг`;
    let html = '';
    if (result.standard_dose_ml != null) html += UI.doseItem('Стандартная доза (мл)', result.standard_dose_ml + ' мл');
    if (result.standard_dose_mg != null) html += UI.doseItem('Стандартная доза (мг)', result.standard_dose_mg + ' мг');
    if (result.high_dose_ml != null) html += UI.doseItem('Повышенная доза (мл)', result.high_dose_ml + ' мл');
    if (result.suppositories_min != null) {
      html += UI.doseItem('Обычная доза (свечи)', result.suppositories_min + ' шт');
      html += UI.doseItem('Повышенная доза (свечи)', result.suppositories_high + ' шт');
    }
    if (result.max_dose_ml != null) html += UI.doseItem('Макс. в сутки (мл)', result.max_dose_ml + ' мл', true);
    if (result.formula_parts && result.formula_parts.length) html += `<div class="formula-box">${result.formula_parts.join('\n')}</div>`;
    if (drug.number_of_times_a_day) html += UI.doseItem('Кратность приёма', drug.number_of_times_a_day);
    $('result-doses').innerHTML = html;
  }

  // ===================== VALIDATION =====================

  function renderValidationLevels(drug, weight, result, ageMonths) {
    const container = $('validation-levels'), section = $('validation-section');
    const l2 = Level2Rules.validate(drug, weight, result, ageMonths);
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
    const grlsUrl = drug.grls?.url || drug.grls_link;
    if (grlsUrl) html += `<div class="instruction-source">📎 ГРЛС: <a href="${grlsUrl}" target="_blank" rel="noopener">открыть инструкцию</a></div>`;
    if (drug.pharmacy_link) html += `<div class="instruction-source">💊 Аптека: <a href="${drug.pharmacy_link}" target="_blank" rel="noopener">проверить цену</a></div>`;
    const l4html = Level4Images.getImageHtml(drug);
    if (l4html) html += `<div class="validation-level" style="margin-top:12px"><span class="level-icon">🖼️</span><div class="level-content"><div class="level-title">L4: Визуальная проверка (скриншот инструкции)</div><div class="level-desc">${l4html}</div></div></div>`;
    body.innerHTML = html;
    section.classList.remove('hidden');
  }

  // ===================== CONFIRM =====================

  async function renderConfirmScreen() {
    navigateTo('confirm');
    const body = $('confirm-body');
    const pending = await DB.getPending();

    if (!pending.length) { body.innerHTML = '<p class="text-muted">Нет ожидающих подтверждения</p>'; return; }

    const pendingHtml = await Promise.all(pending.map(async h => {
      const patient = Store.patients.find(p => p.id === h.patient_id);
      const drug = Store.drugs.find(d => d.id === h.drug_id);
      let intervalHtml = '', canConfirm = true;

      const recentConfirmed = (patient && drug) ? await DB.getRecentConfirmed(patient.id, 12) : [];
      const lastSameDrug = recentConfirmed.find(r => r.drug_id === h.drug_id);
      const lastSameCategory = drug ? recentConfirmed.find(r => { const rd = Store.drugs.find(d => d.id === r.drug_id); return rd && rd.category_id === drug.category_id; }) : null;

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
        <div class="confirm-detail-row"><span class="confirm-detail-label">Доза</span><span class="confirm-detail-value">${UI.formatDose(h)}</span></div>
        <div class="confirm-detail-row"><span class="confirm-detail-label">Время расчёта</span><span class="confirm-detail-value">${UI.formatDate(h.timestamp)}</span></div>
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
        const pendingItem = btn.closest('.pending-item');
        pendingItem.innerHTML = `<div class="confirm-success">
          <span class="confirm-success-icon">✅</span>
          <div class="confirm-success-text">Подтверждено</div>
        </div>`;
        setTimeout(() => renderConfirmScreen(), 1200);
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
    // Check for overdue reminders
    if ('Notification' in window && Notification.permission === 'granted') {
      Reminder.checkOverdue();
    }
  }

  // ===================== PROFILES =====================

  function renderPatientsList() {
    const container = $('patients-list');
    if (!Store.patients.length) { container.innerHTML = '<p class="text-muted">Нет добавленных детей</p>'; return; }
    container.innerHTML = Store.patients.map(p => {
      const age = UI.calcAge(p.birthDate);
      const sexIcon = p.sex === 'girl' ? '👧' : '👦';
      return `<div class="patient-card" data-id="${p.id}"><div><div class="patient-card-name">${sexIcon} ${p.name}</div><div class="patient-card-meta">${age}, ${p.weight || '?'} кг${p.height ? ', ' + p.height + ' см' : ''}</div></div><span class="patient-card-arrow">›</span></div>`;
    }).join('');
    container.querySelectorAll('.patient-card').forEach(card => {
      card.addEventListener('click', () => showPatientDetail(parseInt(card.dataset.id)));
    });
  }

  function showPatientForm(patient) {
    $('patient-form-card').classList.remove('hidden');
    $('patient-detail-card').classList.add('hidden');
    const title = $('patient-form-title'), id = $('patient-form-id');
    const sex = patient ? (patient.sex || 'boy') : 'boy';
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
    $('patient-sex').value = sex;
    document.querySelectorAll('#patient-sex-group .filter-chip').forEach(c => c.classList.toggle('active', c.dataset.sex === sex));
  }

  async function savePatientForm() {
    const id = $('patient-form-id').value;
    const data = {
      name: $('patient-name').value.trim(),
      birthDate: $('patient-birth').value,
      sex: $('patient-sex').value || 'boy',
      weight: parseFloat($('patient-weight').value) || null,
      height: parseFloat($('patient-height').value) || null,
      allergies: $('patient-allergies').value.trim() || ''
    };
    if (!data.name) { alert('Введите имя ребёнка'); return; }
    if (!data.birthDate) { alert('Введите дату рождения'); return; }
    if (new Date(data.birthDate) > new Date()) { alert('Дата рождения не может быть в будущем'); return; }
    if (id) { await DB.updatePatient(parseInt(id), data); }
    else { await DB.addPatient(data); }
    $('patient-form-card').classList.add('hidden');
    await Store.loadPatients();
    Store.renderPatientSelect();
    renderPatientsList();
    showPatientDetail(parseInt(id) || Store.patients[Store.patients.length - 1].id);
  }

  async function showPatientDetail(id) {
    const p = Store.patients.find(p => p.id === id);
    if (!p) return;
    $('patient-detail-card').classList.remove('hidden');
    $('patient-form-card').classList.add('hidden');
    const sexIcon = p.sex === 'girl' ? '👧 Девочка' : '👦 Мальчик';
    $('detail-patient-name').textContent = sexIcon + ' ' + p.name;
    $('detail-patient-info').innerHTML = `
      <div><strong>Дата рождения:</strong> ${p.birthDate || '—'}</div>
      <div><strong>Возраст:</strong> ${UI.calcAge(p.birthDate)}</div>
      <div><strong>Пол:</strong> ${p.sex === 'girl' ? 'Девочка' : 'Мальчик'}</div>
      <div><strong>Вес:</strong> ${p.weight ? p.weight + ' кг' : '—'}</div>
      <div><strong>Рост:</strong> ${p.height ? p.height + ' см' : '—'}</div>
      <div><strong>Аллергии:</strong> ${p.allergies || 'нет'}</div>`;
    $('detail-edit-btn').onclick = () => showPatientForm(p);
    $('detail-delete-btn').onclick = async () => {
      if (confirm(`Удалить профиль ${p.name} и всю историю приёмов?`)) {
        await DB.deletePatient(p.id);
        $('patient-detail-card').classList.add('hidden');
        if (Store.currentPatientId === p.id) Store.currentPatientId = null;
        if (Store.diaryPatientId === p.id) Store.diaryPatientId = null;
        await Store.loadPatients();
        Store.renderPatientSelect();
        renderPatientsList();
      }
    };
    const history = await DB.getHistory(50, p.id);
    const histContainer = $('detail-patient-history');
    if (!history.length) { histContainer.innerHTML = '<p class="text-muted">Нет записей</p>'; }
    else {
      histContainer.innerHTML = history.map(h => `
        <div class="patient-history-item">
          <div class="drug-name">${h.drug_name || 'Препарат #' + h.drug_id}</div>
          <div class="history-meta">${UI.formatDose(h)} · ${UI.formatDate(h.timestamp)}</div>
        </div>
      `).join('');
    }
    $('detail-report-btn').onclick = () => generateReport(p);
    $('detail-growth-btn').onclick = () => GrowthCharts.open(p);
  }

  function bindProfiles() {
    $('add-patient-btn').addEventListener('click', () => showPatientForm(null));
    $('patient-form-cancel').addEventListener('click', () => $('patient-form-card').classList.add('hidden'));
    $('patient-form-save').addEventListener('click', savePatientForm);
    $('patient-name').addEventListener('keydown', e => { if (e.key === 'Enter') savePatientForm(); });
    document.querySelectorAll('#patient-sex-group .filter-chip').forEach(c => {
      c.addEventListener('click', () => {
        document.querySelectorAll('#patient-sex-group .filter-chip').forEach(ch => ch.classList.remove('active'));
        c.classList.add('active');
        $('patient-sex').value = c.dataset.sex;
      });
    });
  }

  // ===================== HISTORY =====================

  function bindHistory() {
    qsa('.history-filters .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        qsa('.history-filters .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        Store.historyFilterDays = chip.dataset.days ? parseInt(chip.dataset.days) : null;
        renderHistory();
      });
    });

    $('hist-mode-drugs').addEventListener('click', () => {
      $('hist-mode-drugs').classList.add('active');
      $('hist-mode-episodes').classList.remove('active');
      $('history-filters').classList.remove('hidden');
      renderHistory();
    });
    $('hist-mode-episodes').addEventListener('click', () => {
      $('hist-mode-episodes').classList.add('active');
      $('hist-mode-drugs').classList.remove('active');
      $('history-filters').classList.add('hidden');
      renderEpisodesList();
    });

    const searchInput = $('history-search');
    const dateInput = $('history-date');
    const dateClear = $('history-date-clear');

    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { Store.historySearchQuery = searchInput.value.trim().toLowerCase(); renderHistory(); }, 250);
    });

    dateInput.addEventListener('change', () => {
      Store.historyDateFilter = dateInput.value || null;
      renderHistory();
    });

    dateClear.addEventListener('click', () => {
      dateInput.value = '';
      Store.historyDateFilter = null;
      renderHistory();
    });
  }

  function renderHistory() {
    if ($('hist-mode-episodes').classList.contains('active')) { renderEpisodesList(); return; }

    DB.getHistory(200).then(all => {
      const container = $('history-list');
      container.innerHTML = '';
      let filtered = all;
      if (Store.historyFilterDays) {
        const cutoff = Date.now() - Store.historyFilterDays * 86400000;
        filtered = all.filter(h => new Date(h.timestamp).getTime() >= cutoff);
      }
      if (Store.historyDateFilter) {
        const d = Store.historyDateFilter;
        filtered = filtered.filter(h => h.timestamp && h.timestamp.slice(0, 10) === d);
      }
      if (Store.historySearchQuery) {
        const q = Store.historySearchQuery;
        filtered = filtered.filter(h => {
          const drug = (h.drug_name || '').toLowerCase();
          const patient = h.patient_id ? (Store.patients.find(p => p.id === h.patient_id)?.name || '').toLowerCase() : '';
          return drug.includes(q) || patient.includes(q) || (h.dose_ml && h.dose_ml.toString().includes(q));
        });
      }
      if (!filtered.length) { container.innerHTML = '<p class="text-muted">Нет записей за этот период</p>'; return; }

      const grouped = {};
      filtered.forEach(h => { const day = h.timestamp ? h.timestamp.slice(0, 10) : 'unknown'; if (!grouped[day]) grouped[day] = []; grouped[day].push(h); });

      Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(day => {
        container.innerHTML += `<div class="history-day-header">${UI.formatDayLabel(day)}</div>`;
        grouped[day].forEach(h => {
          const patient = Store.patients.find(p => p.id === h.patient_id);
          const div = document.createElement('div');
          div.className = 'history-item';
          div.innerHTML = `<div class="history-drug">${h.drug_name || 'Препарат'}</div>
            <div class="history-meta">${UI.formatDose(h)} · ${UI.formatTime(h.timestamp)}${patient ? ' · ' + patient.name : ''} · ✅ Принято</div>
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

  async function renderEpisodesList() {
    const container = $('history-list');
    container.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';

    const allPatients = await DB.getPatients();
    let allEpisodes = [];
    for (const p of allPatients) {
      const eps = await DB.getEpisodes(p.id);
      eps.forEach(e => { e._patient = p; });
      allEpisodes = allEpisodes.concat(eps);
    }
    allEpisodes.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

    if (!allEpisodes.length) { container.innerHTML = '<p class="text-muted">Нет эпизодов</p>'; return; }

    container.innerHTML = allEpisodes.map(ep => {
      const start = new Date(ep.startDate).toLocaleDateString('ru-RU');
      const end = ep.endDate ? new Date(ep.endDate).toLocaleDateString('ru-RU') : 'продолжается';
      const pName = ep._patient ? ep._patient.name : '—';
      const status = ep.endDate ? '✅ Завершён' : '🟢 Активен';
      return `<div class="episode-history-item">
        <div class="episode-history-header">
          <span class="episode-history-name">🤒 ${ep.name}</span>
          <span class="episode-history-status">${status}</span>
        </div>
        <div class="episode-history-meta">${pName} · ${start} — ${end}</div>
        ${ep.notes ? `<div class="episode-history-notes">${ep.notes}</div>` : ''}
      </div>`;
    }).join('');
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
      $('update-btn').textContent = '⏳ Очистка кэша...'; $('update-btn').disabled = true;
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        const theme = localStorage.getItem('dose_pwa_theme');
        localStorage.clear();
        if (theme) localStorage.setItem('dose_pwa_theme', theme);
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(r => r.unregister()));
        }
        const resp = await fetch('data/manifest.json?_=' + Date.now());
        const remote = await resp.json();
        $('settings-version').textContent = remote.version;
        $('settings-updated').textContent = remote.updated;
        $('update-btn').textContent = '✅ Перезагрузка...';
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        $('update-btn').textContent = '❌ Ошибка';
        setTimeout(() => { $('update-btn').textContent = '🔄 Проверить обновления'; $('update-btn').disabled = false; }, 2000);
      }
    });
  }

  function renderGrlsTable() {
    const section = $('grls-table-section');
    const body = $('grls-table-body');
    const summary = $('grls-summary');
    const isVisible = !section.classList.contains('hidden');
    if (isVisible) { section.classList.add('hidden'); return; }

    const fields = ['reg_number', 'inn', 'manufacturer', 'atx', 'url'];
    const fieldLabels = { reg_number: 'РУ', inn: 'МНН', manufacturer: 'Произв.', atx: 'АТХ', url: 'Ссылка' };
    let totalScore = 0, maxScore = Store.drugs.length * fields.length;

    let html = '<table class="grls-table"><thead><tr><th>Препарат</th>';
    fields.forEach(f => { html += `<th>${fieldLabels[f]}</th>`; });
    html += '<th>L4</th><th>Полнота</th></tr></thead><tbody>';

    Store.drugs.forEach(d => {
      const grls = d.grls || {};
      let drugScore = 0;
      html += `<tr><td class="grls-drug-name">${d.name}</td>`;
      fields.forEach(f => {
        const val = grls[f];
        const ok = val && val.trim() !== '' && (f !== 'url' || val !== 'https://grls.rosminzdrav.ru/');
        if (ok) drugScore++;
        html += `<td><span class="grls-dot ${ok ? 'ok' : 'miss'}"></span></td>`;
      });
      html += `<td>${Level4Images.getImageIcon(d)}</td>`;
      totalScore += drugScore;
      const pct = Math.round(drugScore / fields.length * 100);
      html += `<td><div class="grls-progress"><div class="grls-progress-fill" style="width:${pct}%;background:${pct===100?'var(--color-success)':pct>0?'var(--color-warning)':'var(--color-border)'}"></div></div></td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    body.innerHTML = html;

    const overall = Math.round(totalScore / maxScore * 100);
    summary.textContent = `${Store.drugs.filter(d => { const g=d.grls||{}; return fields.every(f => g[f]&&g[f].trim()!==''&&(f!=='url'||g[f]!=='https://grls.rosminzdrav.ru/')); }).length}/${Store.drugs.length} полных`;
    section.classList.remove('hidden');
  }

  window.renderGrlsTable = renderGrlsTable;

  document.addEventListener('DOMContentLoaded', init);
})();
