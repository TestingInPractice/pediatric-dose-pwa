(function () {
  'use strict';

  async function generateReport(patient) {
    if (!patient) return;
    const [history, episodes, symptoms] = await Promise.all([
      DB.getHistory(500, patient.id),
      DB.getEpisodes(patient.id),
      DB.getSymptoms(patient.id, null, 500)
    ]);

    const age = UI.calcAge(patient.birthDate);
    const text = buildTextReport(patient, age, episodes, history, symptoms);
    const html = buildHtmlReport(patient, age, episodes, history, symptoms);

    UI.openModal('📋 Доктор-репорт', `<textarea class="form-input" style="min-height:200px;resize:vertical;font-size:13px;font-family:monospace" readonly>${text}</textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="report-close">Закрыть</button>
        <button class="btn btn-primary" id="report-copy">📋 Копировать</button>
        <button class="btn btn-primary" id="report-print">🖨 Печать / PDF</button>
      </div>`);

    $('report-close').onclick = UI.closeModal;
    $('report-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        $('report-copy').textContent = '✅ Скопировано';
        setTimeout(() => { $('report-copy').textContent = '📋 Копировать'; }, 2000);
      } catch {
        alert('Не удалось скопировать. Выделите текст вручную.');
      }
    };
    $('report-print').onclick = () => printReport(html);
  }

  function buildTextReport(patient, age, episodes, history, symptoms) {
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
            const t = UI.formatDateTime(s.timestamp);
            switch (s.type) {
              case 'temperature': text += `   🌡 ${t} — ${s.value}°C (${s.method || '—'}) ${UI.tempInterpretation(s.value)}\n`; break;
              case 'vomit': text += `   🤮 ${t} — Рвота\n`; break;
              case 'stool': text += `   💩 ${t} — Стул тип ${s.value} (${UI.bristolLabel(s.value)})\n`; break;
              case 'symptom': text += `   🤒 ${t} — ${s.notes || 'Симптом'} (${UI.severityLabel(s.severity) || '—'})\n`; break;
            }
          });
        }

        if (epHistory.length) {
          text += `\n   Препараты:\n`;
          epHistory.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(h => {
            const t = UI.formatDateTime(h.timestamp);
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
          text += `💊 ${UI.formatDateTime(h.timestamp)} — ${h.drug_name || 'Препарат'}: ${h.dose_ml || '—'} мл (${h.dose_mg || '—'} мг)\n`;
        });
      } else {
        text += 'Нет записей\n';
      }
      text += '\n';
      if (symptoms.length) {
        text += `📋 СИМПТОМЫ\n\n`;
        symptoms.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(s => {
          const t = UI.formatDateTime(s.timestamp);
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
    return text;
  }

  function buildHtmlReport(patient, age, episodes, history, symptoms) {
    const now = new Date().toLocaleString('ru-RU');

    function fmt(iso) {
      return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function episodeHtml(ep) {
      const start = new Date(ep.startDate).toLocaleDateString('ru-RU');
      const end = ep.endDate ? new Date(ep.endDate).toLocaleDateString('ru-RU') : 'продолжается';
      const status = ep.endDate ? 'Завершён' : 'Активен';

      const epSymptoms = symptoms.filter(s => s.episode_id === ep.id)
        .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
      const epHistory = history.filter(h => h.episode_id === ep.id)
        .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

      let body = '';
      if (epSymptoms.length) {
        body += '<h4>Симптомы</h4><ul>';
        epSymptoms.forEach(s => {
          const t = fmt(s.timestamp);
          switch (s.type) {
            case 'temperature': body += `<li>🌡 <strong>${t}</strong> — ${s.value}°C (${s.method || '—'}) — ${UI.tempInterpretation(s.value)}</li>`; break;
            case 'vomit': body += `<li>🤮 <strong>${t}</strong> — Рвота</li>`; break;
            case 'stool': body += `<li>💩 <strong>${t}</strong> — Стул тип ${s.value} (${UI.bristolLabel(s.value)})</li>`; break;
            case 'symptom': body += `<li>🤒 <strong>${t}</strong> — ${s.notes || 'Симптом'} ${UI.severityLabel(s.severity) ? '(' + UI.severityLabel(s.severity) + ')' : ''}</li>`; break;
          }
        });
        body += '</ul>';
      }
      if (epHistory.length) {
        body += '<h4>Препараты</h4><ul>';
        epHistory.forEach(h => {
          body += `<li>💊 <strong>${fmt(h.timestamp)}</strong> — ${h.drug_name || 'Препарат'}: ${h.dose_ml || '—'} мл (${h.dose_mg || '—'} мг)</li>`;
        });
        body += '</ul>';
      }
      if (ep.notes) body += `<p class="ep-notes">📝 ${ep.notes}</p>`;

      return `<div class="episode">
        <div class="episode-head">
          <span class="episode-name">🤒 ${ep.name}</span>
          <span class="episode-status ${ep.endDate ? 'status-done' : 'status-active'}">${status}</span>
        </div>
        <div class="episode-dates">${start} — ${end}</div>
        ${body || '<p class="text-muted">Нет данных</p>'}
      </div>`;
    }

    let sectionsHtml = '';

    if (episodes.length) {
      sectionsHtml += `<h3>📋 Эпизоды болезни</h3>`;
      sectionsHtml += episodes.map(episodeHtml).join('');
    }

    if (!episodes.length) {
      sectionsHtml += `<h3>📋 История приёмов</h3>`;
      if (history.length) {
        sectionsHtml += '<ul>';
        history.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(h => {
          sectionsHtml += `<li>💊 <strong>${fmt(h.timestamp)}</strong> — ${h.drug_name || 'Препарат'}: ${h.dose_ml || '—'} мл (${h.dose_mg || '—'} мг)</li>`;
        });
        sectionsHtml += '</ul>';
      } else {
        sectionsHtml += '<p class="text-muted">Нет записей</p>';
      }

      if (symptoms.length) {
        sectionsHtml += `<h3 style="margin-top:20px">📋 Симптомы</h3><ul>`;
        symptoms.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)).forEach(s => {
          const t = fmt(s.timestamp);
          switch (s.type) {
            case 'temperature': sectionsHtml += `<li>🌡 <strong>${t}</strong> — ${s.value}°C</li>`; break;
            case 'vomit': sectionsHtml += `<li>🤮 <strong>${t}</strong> — Рвота</li>`; break;
            case 'stool': sectionsHtml += `<li>💩 <strong>${t}</strong> — Стул тип ${s.value}</li>`; break;
            case 'symptom': sectionsHtml += `<li>🤒 <strong>${t}</strong> — ${s.notes || 'Симптом'}</li>`; break;
          }
        });
        sectionsHtml += '</ul>';
      }
    }

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Доктор-репорт — ${patient.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #212121; padding: 24px; max-width: 700px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; color: #1976d2; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #1976d2; }
  h3 { font-size: 15px; color: #333; margin: 16px 0 8px; }
  h4 { font-size: 14px; color: #555; margin: 12px 0 6px; }
  .report-header { margin-bottom: 20px; }
  .report-date { color: #757575; font-size: 12px; }
  .patient-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; background: #f5f5f5; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; }
  .patient-grid .label { color: #757575; }
  .patient-grid .value { font-weight: 600; }
  .episode { background: #fafafa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
  .episode-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .episode-name { font-weight: 600; font-size: 15px; }
  .episode-dates { font-size: 12px; color: #757575; margin-bottom: 8px; }
  .episode-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
  .status-active { background: #e3f2fd; color: #1976d2; }
  .status-done { background: #e8f5e9; color: #2e7d32; }
  ul { margin: 6px 0 6px 20px; }
  li { margin-bottom: 4px; font-size: 13px; }
  .ep-notes { font-size: 13px; color: #555; background: #fff8e1; border-radius: 4px; padding: 8px; margin-top: 8px; }
  .text-muted { color: #9e9e9e; font-size: 13px; }
  .report-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #9e9e9e; line-height: 1.5; }
  .report-footer strong { color: #757575; }
  @page { size: A4; margin: 12mm; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="report-header">
    <h1>📋 Доктор-репорт</h1>
    <div class="report-date">Сформирован: ${now}</div>
  </div>

  <h2>👶 ${patient.name}</h2>
  <div class="patient-grid">
    <div><span class="label">Дата рождения</span><br><span class="value">${patient.birthDate || '—'}</span></div>
    <div><span class="label">Возраст</span><br><span class="value">${age}</span></div>
    <div><span class="label">Вес</span><br><span class="value">${patient.weight ? patient.weight + ' кг' : '—'}</span></div>
    <div><span class="label">Рост</span><br><span class="value">${patient.height ? patient.height + ' см' : '—'}</span></div>
    <div style="grid-column:1/3"><span class="label">Аллергии</span><br><span class="value">${patient.allergies || 'нет'}</span></div>
  </div>

  ${sectionsHtml}

  <div class="report-footer">
    <strong>⚠️ Дисклеймер</strong><br>
    Калькулятор предназначен для ознакомительных целей.<br>
    Перед применением любых лекарств проконсультируйтесь с врачом.
  </div>
</body>
</html>`;
  }

  function printReport(html) {
    const win = window.open('', '_blank', 'width=780,height=640,scrollbars=yes');
    if (!win) { alert('Разрешите всплывающие окна для печати, или используйте Копировать.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  window.generateReport = generateReport;
})();
