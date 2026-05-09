(function () {
  'use strict';

  window.DiaryScreen = {
    async render() {
      const container = $('diary-patient-selector');
      container.innerHTML = `<select id="diary-patient-select" class="form-select"><option value="">— Выберите ребёнка —</option>
        ${Store.patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>`;

      const select = $('diary-patient-select');
      if (Store.diaryPatientId && Store.patients.find(p => p.id === Store.diaryPatientId)) {
        select.value = Store.diaryPatientId;
      }

      select.addEventListener('change', async () => {
        Store.diaryPatientId = select.value ? parseInt(select.value) : null;
        await this.load();
      });

      if (Store.diaryPatientId) this.load();
      else {
        $('diary-episode-header').innerHTML = '';
        $('diary-quick-actions').classList.add('hidden');
        $('diary-timeline').innerHTML = '<p class="text-muted">Выберите ребёнка</p>';
      }
    },

    async load() {
      if (!Store.diaryPatientId) return;
      Store.diaryActiveEpisode = await DB.getActiveEpisode(Store.diaryPatientId);

      await this.renderEpisodeHeader();
      this.renderTimeline();

      const actions = $('diary-quick-actions');
      if (Store.diaryActiveEpisode) {
        actions.classList.remove('hidden');
        actions.querySelectorAll('.quick-btn').forEach(btn => {
          btn.onclick = () => {
            const action = btn.dataset.action;
            if (action === 'temperature') this.showTempModal();
            else if (action === 'vomit') this.addVomit();
            else if (action === 'stool') this.showStoolModal();
            else if (action === 'symptom') this.showSymptomModal();
          };
        });
      } else {
        actions.classList.add('hidden');
      }
    },

    async renderEpisodeHeader() {
      const container = $('diary-episode-header');
      if (Store.diaryActiveEpisode) {
        const ep = Store.diaryActiveEpisode;
        const startDate = new Date(ep.startDate).toLocaleDateString('ru-RU');
        container.innerHTML = `<div class="episode-active-card">
          <div><div class="episode-active-name">🤒 ${ep.name}</div>
          <div class="episode-active-date">с ${startDate}</div></div>
          <div class="episode-active-actions">
            <button class="btn btn-sm btn-secondary" id="episode-edit-btn">✏️</button>
            <button class="btn btn-sm btn-success" id="episode-close-btn">✅</button>
          </div></div>
          <div id="episode-stats" style="margin-top:8px;font-size:13px"></div>`;

        $('episode-edit-btn').onclick = () => this.showEditEpisodeModal();
        $('episode-close-btn').onclick = async () => {
          if (confirm(`Завершить эпизод «${ep.name}»?`)) {
            await DB.closeEpisode(ep.id);
            Store.diaryActiveEpisode = null;
            await this.load();
          }
        };

        const symptoms = await DB.getSymptoms(Store.diaryPatientId, ep.id, 500);
        const temps = symptoms.filter(s => s.type === 'temperature' && s.value);
        const avgTemp = temps.length ? round(temps.reduce((sum, s) => sum + s.value, 0) / temps.length, 1) : null;
        const vomits = symptoms.filter(s => s.type === 'vomit').length;
        const stools = symptoms.filter(s => s.type === 'stool').length;
        const others = symptoms.filter(s => s.type === 'symptom').length;
        const duration = ep.endDate ? Math.round((new Date(ep.endDate) - new Date(ep.startDate)) / 86400000) : Math.round((Date.now() - new Date(ep.startDate)) / 86400000);

        let statsHtml = '';
        if (avgTemp) statsHtml += `<span style="margin-right:12px">🌡 ${avgTemp}°C</span>`;
        if (vomits) statsHtml += `<span style="margin-right:12px">🤮 ${vomits}</span>`;
        if (stools) statsHtml += `<span style="margin-right:12px">💩 ${stools}</span>`;
        if (others) statsHtml += `<span style="margin-right:12px">🤒 ${others}</span>`;
        statsHtml += `<span style="color:var(--color-text-secondary)">⏱ ${duration} дн</span>`;
        $('episode-stats').innerHTML = statsHtml || '<span style="color:var(--color-text-secondary)">Нет симптомов</span>';
      } else {
        container.innerHTML = `<button class="btn btn-primary btn-block" id="episode-start-btn">➕ Заболел(а) — начать эпизод</button>`;
        $('episode-start-btn').onclick = () => this.showStartEpisodeModal();
      }
    },

    showStartEpisodeModal() {
      UI.openModal('Новый эпизод', `<div class="form-group">
        <label class="form-label">Название</label>
        <input type="text" class="form-input" id="episode-name-input" placeholder="Например: ОРВИ, Отит..." autofocus>
        <div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px">Можно вписать позже</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="episode-start-cancel">Отмена</button>
        <button class="btn btn-primary" id="episode-start-save">Начать</button>
      </div>`);

      $('episode-start-cancel').onclick = UI.closeModal;
      $('episode-start-save').onclick = async () => {
        const name = ($('episode-name-input').value || '').trim() || 'Болезнь';
        await DB.addEpisode({ patient_id: Store.diaryPatientId, name, startDate: new Date().toISOString() });
        UI.closeModal();
        await this.load();
      };
      $('episode-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('episode-start-save').click(); });
      setTimeout(() => $('episode-name-input').focus(), 100);
    },

    showEditEpisodeModal() {
      const ep = Store.diaryActiveEpisode;
      if (!ep) return;
      UI.openModal('Редактировать эпизод', `<div class="form-group">
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

      $('episode-edit-cancel').onclick = UI.closeModal;
      $('episode-edit-save').onclick = async () => {
        const name = ($('episode-edit-name').value || '').trim();
        if (!name) { alert('Введите название'); return; }
        await DB.updateEpisode(ep.id, { name, notes: ($('episode-edit-notes').value || '').trim() });
        UI.closeModal();
        await this.load();
      };
    },

    // --- Quick Actions ---

    showTempModal() {
      UI.openModal('🌡 Температура', `<div class="form-group">
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

      $('temp-cancel').onclick = UI.closeModal;
      $('temp-save').onclick = async () => {
        const val = parseFloat($('temp-input').value);
        if (isNaN(val) || val < 34 || val > 42) { alert('Введите корректную температуру (34-42°C)'); return; }
        await DB.addSymptom({
          patient_id: Store.diaryPatientId, episode_id: Store.diaryActiveEpisode.id,
          type: 'temperature', value: val,
          method: $('temp-method').value,
          timestamp: new Date().toISOString()
        });
        UI.closeModal();
        this.renderTimeline();
      };
      $('temp-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('temp-save').click(); });
      setTimeout(() => $('temp-input').focus(), 100);
    },

    async addVomit() {
      await DB.addSymptom({
        patient_id: Store.diaryPatientId, episode_id: Store.diaryActiveEpisode.id,
        type: 'vomit', value: null,
        timestamp: new Date().toISOString()
      });
      this.renderTimeline();
    },

    showStoolModal() {
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

      UI.openModal('💩 Стул (Бристольская шкала)', `<div class="bristol-grid">${grid}</div>
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

      $('stool-cancel').onclick = UI.closeModal;
      $('stool-save').onclick = async () => {
        if (!selected) return;
        await DB.addSymptom({
          patient_id: Store.diaryPatientId, episode_id: Store.diaryActiveEpisode.id,
          type: 'stool', value: selected,
          timestamp: new Date().toISOString()
        });
        UI.closeModal();
        this.renderTimeline();
      };
    },

    showSymptomModal() {
      UI.openModal('🤒 Симптом', `<div class="form-group">
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

      $('symptom-cancel').onclick = UI.closeModal;
      $('symptom-save').onclick = async () => {
        const name = ($('symptom-name-input').value || '').trim();
        if (!name) { alert('Опишите симптом'); return; }
        await DB.addSymptom({
          patient_id: Store.diaryPatientId, episode_id: Store.diaryActiveEpisode.id,
          type: 'symptom', notes: name, severity,
          timestamp: new Date().toISOString()
        });
        UI.closeModal();
        this.renderTimeline();
      };
      $('symptom-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('symptom-save').click(); });
      setTimeout(() => $('symptom-name-input').focus(), 100);
    },

    // --- Timeline ---

    async renderTimeline() {
      const container = $('diary-timeline');
      if (!Store.diaryPatientId) { container.innerHTML = '<p class="text-muted">Выберите ребёнка</p>'; return; }

      const episodeId = Store.diaryActiveEpisode ? Store.diaryActiveEpisode.id : null;

      const [symptoms, historyItems] = await Promise.all([
        DB.getSymptoms(Store.diaryPatientId, episodeId, 200),
        DB.getHistory(200, Store.diaryPatientId)
      ]);

      const events = [];

      symptoms.forEach(s => {
        events.push({
          type: s.type, timestamp: s.timestamp, data: s, sortKey: s.timestamp
        });
      });

      const histFiltered = episodeId
        ? historyItems.filter(h =>
            h.episode_id === episodeId ||
            (h.timestamp && Store.diaryActiveEpisode && h.timestamp >= Store.diaryActiveEpisode.startDate)
          )
        : historyItems;

      histFiltered.forEach(h => {
        events.push({
          type: 'drug', timestamp: h.timestamp, data: h, sortKey: h.timestamp
        });
      });

      events.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));

      if (!events.length) {
        container.innerHTML = `<div class="timeline-empty">${episodeId ? 'Нет событий в этом эпизоде' : 'Нет записей'}</div>`;
        return;
      }

      const temps = events.filter(e => e.type === 'temperature').slice(0, 48);

      let html = '';

      if (temps.length >= 2) {
        html += `<div class="temp-chart-container"><canvas id="temp-chart-canvas" height="120"></canvas>
          <div class="temp-chart-labels"><span>-24ч</span><span>Сейчас</span></div></div>`;
      }

      const grouped = {};
      events.forEach(e => {
        const day = e.timestamp ? e.timestamp.slice(0, 10) : 'unknown';
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(e);
      });

      Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(day => {
        html += `<div class="timeline-day-header">${UI.formatDayLabel(day)}</div>`;
        grouped[day].forEach(e => {
          const d = e.data;
          let emoji = '', title = '', desc = '';

          switch (e.type) {
            case 'temperature':
              emoji = '🌡'; title = `${d.value}°C`;
              if (d.method) title += ` (${d.method})`;
              desc = UI.tempInterpretation(d.value);
              break;
            case 'vomit':
              emoji = '🤮'; title = 'Рвота'; desc = '';
              break;
            case 'stool':
              emoji = '💩'; title = `Стул — тип ${d.value}`;
              desc = UI.bristolLabel(d.value);
              break;
            case 'symptom':
              emoji = '🤒'; title = d.notes || 'Симптом';
              desc = UI.severityLabel(d.severity);
              break;
            case 'drug':
              emoji = '💊'; title = d.drug_name || 'Препарат';
              desc = d.dose_ml ? `${d.dose_ml} мл (${d.dose_mg} мг)` : `${d.dose_mg} мг`;
              break;
          }

          const cssType = e.type === 'drug' ? 'drug' : e.type;
          const time = UI.formatTime(e.timestamp);
          const isSymptom = e.type !== 'drug';
          const deleteBtn = isSymptom
            ? `<button class="timeline-del-btn" data-symptom-id="${d.id || ''}" data-history-id="">✕</button>`
            : `<button class="timeline-del-btn" data-history-id="${d.id || ''}" data-symptom-id="">✕</button>`;
          html += `<div class="timeline-event type-${cssType}">
            <div class="timeline-event-emoji">${emoji}</div>
            <div class="timeline-event-body">
              <div class="timeline-event-title">${title}</div>
              ${desc ? `<div class="timeline-event-desc">${desc}</div>` : ''}
              <div class="timeline-event-time">${time}</div>
            </div>
            ${deleteBtn}
          </div>`;
        });
      });

      container.innerHTML = html;

      container.querySelectorAll('.timeline-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const symptomId = btn.dataset.symptomId;
          const historyId = btn.dataset.historyId;
          if (symptomId) {
            await DB.deleteSymptom(parseInt(symptomId));
            this.renderTimeline();
          } else if (historyId) {
            if (!confirm('Удалить запись о приёме из истории?')) return;
            if (!confirm('Вы уверены? Вся ответственность за удаление лежит на вас.')) return;
            await DB.deleteHistoryItem(parseInt(historyId));
            this.renderTimeline();
          }
        });
      });

      if (temps.length >= 2) {
        this.renderTempChart(temps);
      }
    },

    renderTempChart(temps) {
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
      const minTemp = 35, maxTemp = 41, range = maxTemp - minTemp;
      const chartW = w - padding.left - padding.right;
      const chartH = h - padding.top - padding.bottom;

      function yPos(val) { return padding.top + chartH - ((val - minTemp) / range) * chartH; }
      function xPos(i) { return padding.left + (i / Math.max(values.length - 1, 1)) * chartW; }

      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = document.documentElement.classList.contains('dark') ? '#333' : '#eee';
      ctx.lineWidth = 0.5;
      for (let t = 36; t <= 40; t += 1) {
        const y = yPos(t);
        ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
        ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#9e9e9e' : '#757575';
        ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(t + '°', padding.left - 4, y + 3);
      }

      ctx.fillStyle = 'rgba(229, 57, 53, 0.08)';
      ctx.fillRect(padding.left, yPos(39), chartW, yPos(37.5) - yPos(39));
      ctx.fillStyle = 'rgba(245, 124, 0, 0.06)';
      ctx.fillRect(padding.left, yPos(37.5), chartW, padding.top + chartH - yPos(37.5));

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#e53935'; ctx.lineWidth = 1;
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

      ctx.strokeStyle = '#1976d2'; ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = xPos(i), y = yPos(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      values.forEach((v, i) => {
        const x = xPos(i), y = yPos(v);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = v >= 39 ? '#e53935' : v >= 37.5 ? '#f57c00' : '#1976d2';
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  };

  function round(n, d) { const m = Math.pow(10, d || 1); return Math.round(n * m) / m; }
})();
