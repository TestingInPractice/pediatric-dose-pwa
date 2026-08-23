(function () {
  'use strict';

  // ===================== DRUGS REFERENCE SCREEN =====================
  // Справочник препаратов: список по категориям + полная инструкция.
  // Данные — только из Store (data/drugs.json), без новых сетевых вызовов.

  function dash(v) { return (v === null || v === undefined || v === '') ? '—' : v; }

  function showList() {
    $('drugs-list-card').classList.remove('hidden');
    $('drug-detail-card').classList.add('hidden');
  }

  function showDetail() {
    $('drugs-list-card').classList.add('hidden');
    $('drug-detail-card').classList.remove('hidden');
    const main = $('app-main');
    if (main) main.scrollTop = 0;
  }

  function matches(drug, q) {
    const inn = drug.grls && drug.grls.inn ? drug.grls.inn : '';
    return ((drug.name || '') + ' ' + inn).toLowerCase().includes(q);
  }

  function renderList() {
    const q = ($('drugs-search').value || '').trim().toLowerCase();
    const drugs = Store.drugs || [];
    let html = '', total = 0;
    (Store.categories || []).forEach(cat => {
      const catDrugs = drugs.filter(d => d.category_id === cat.id && (!q || matches(d, q)));
      if (!catDrugs.length) return;
      html += `<div class="drugs-group-title">${cat.name}</div>`;
      catDrugs.forEach(d => {
        const sub = [d.form, d.grls && d.grls.inn ? d.grls.inn : ''].filter(Boolean).join(' · ');
        html += `<button class="drug-row" data-drug-id="${d.id}">` +
          `<span class="drug-row-name">${d.name}</span>` +
          (sub ? `<span class="drug-row-sub">${sub}</span>` : '') +
          `</button>`;
        total++;
      });
    });
    $('drugs-list').innerHTML = total ? html : '<p class="text-muted">Ничего не найдено</p>';
  }

  function infoRow(label, value) {
    return `<div class="settings-item"><span>${label}</span><span style="text-align:right">${value}</span></div>`;
  }

  function blockTitle(text) {
    return `<div class="form-label" style="margin-top:14px">${text}</div>`;
  }

  function doseTableHtml(drug) {
    const units = drug.units || 'мг';
    let html = blockTitle('Таблица дозирования') +
      '<table class="instruction-table"><thead><tr><th>Вес, кг</th><th>Доза, мл</th><th>Доза, ' + units + '</th></tr></thead><tbody>';
    drug.dose_table.forEach(row => {
      let doseDisplay = row.dose_ml;
      if (drug.form === 'суппозитории') {
        doseDisplay = row.dose_ml + ' свеча';
        if (row.dose_ml > 1) doseDisplay += '(-и)';
      }
      html += `<tr><td>${row.weight_min}-${row.weight_max}</td><td>${doseDisplay}</td><td>${row.dose_mg} ${units}</td></tr>`;
    });
    return html + '</tbody></table>';
  }

  function buildDetailHtml(d) {
    const g = d.grls || {};
    let html = `<h2 class="drug-detail-name">${d.name}</h2><span class="drug-form-chip">${dash(d.form)}</span>`;

    html += blockTitle('Реестр ГРЛС');
    html += infoRow('Форма выпуска', dash(d.form));
    html += infoRow('Действующее вещество (МНН)', dash(g.inn));
    html += infoRow('Рег. номер', dash(g.reg_number));
    html += infoRow('Производитель', dash(g.manufacturer));
    html += infoRow('ATX', dash(g.atx));

    html += blockTitle('Дозирование');
    html += infoRow('Разовая доза', dash(d.mgs_range));
    html += infoRow('Кратность', dash(d.number_of_times_a_day));
    if (d.mgs_max != null) html += infoRow('Макс. суточная', `${d.mgs_max} мг/кг`);
    if (d.min_age_months != null) html += infoRow('Мин. возраст', `${d.min_age_months} мес`);
    if (d.min_weight_kg != null) html += infoRow('Мин. вес', `${d.min_weight_kg} кг`);

    if (d.contraindications) html += blockTitle('⚠️ Противопоказания') + `<p style="margin:6px 0 0">${d.contraindications}</p>`;
    if (d.instructions) html += blockTitle('📄 Способ применения и дозы') + `<p style="margin:6px 0 0">${d.instructions}</p>`;
    if (d.dose_table && d.dose_table.length) html += doseTableHtml(d);

    const grlsUrl = g.url || d.grls_link;
    if (grlsUrl) html += `<div class="instruction-source">📎 ГРЛС: <a href="${grlsUrl}" target="_blank" rel="noopener">открыть инструкцию</a></div>`;
    if (d.pharmacy_link) html += `<div class="instruction-source">💊 Аптека: <a href="${d.pharmacy_link}" target="_blank" rel="noopener">проверить цену</a></div>`;

    if (typeof Level4Images !== 'undefined' && typeof Level4Images.getImageHtml === 'function') {
      const l4html = Level4Images.getImageHtml(d);
      if (l4html) html += `<div class="validation-level" style="margin-top:12px"><span class="level-icon">🖼️</span><div class="level-content"><div class="level-title">L4: Визуальная проверка (скриншот инструкции)</div><div class="level-desc">${l4html}</div></div></div>`;
    }
    return html;
  }

  function openDrug(id) {
    const drug = (Store.drugs || []).find(d => String(d.id) === String(id));
    if (!drug) return;
    $('drug-detail-body').innerHTML = buildDetailHtml(drug);
    showDetail();
  }

  function bindOnce() {
    const search = $('drugs-search');
    if (!search || search.dataset.bound) return;
    search.dataset.bound = '1';
    search.addEventListener('input', renderList);
    $('drugs-list').addEventListener('click', e => {
      const row = e.target.closest('.drug-row');
      if (row) openDrug(row.dataset.drugId);
    });
    $('drug-detail-back').addEventListener('click', showList);
  }

  function render() {
    bindOnce();
    showList();
    renderList();
  }

  window.DrugsScreen = { render };
})();
