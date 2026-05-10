(function () {
  'use strict';

  window.UI = {
    openModal(title, bodyHtml) {
      $('diary-modal-title').textContent = title;
      $('diary-modal-body').innerHTML = bodyHtml;
      $('diary-modal').classList.remove('hidden');
    },

    closeModal() {
      $('diary-modal').classList.add('hidden');
    },

    showError(msg) {
      $('error-section').textContent = msg;
      $('error-section').classList.remove('hidden');
      $('result-section').classList.add('hidden');
    },

    doseItem(label, value, danger) {
      return `<div class="dose-item"><span class="dose-label">${label}</span><span class="dose-value ${danger ? 'danger' : ''}">${value}</span></div>`;
    },

    formatDate(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    },

    formatTime(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    },

    formatDateTime(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    },

    formatDayLabel(isoDay) {
      const today = new Date(), todayStr = today.toISOString().slice(0, 10);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      if (isoDay === todayStr) return 'Сегодня';
      if (isoDay === yesterdayStr) return 'Вчера';
      return new Date(isoDay + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    },

    calcAge(birthDate) {
      if (!birthDate) return '?';
      const now = new Date(), birth = new Date(birthDate);
      const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
      if (months < 1) return '0 мес';
      if (months < 12) return months + ' мес';
      const years = Math.floor(months / 12), rem = months % 12;
      return rem ? `${years}г ${rem}мес` : `${years} г`;
    },

    tempInterpretation(val) {
      if (val < 37.2) return 'Норма';
      if (val < 38) return 'Субфебрильная';
      if (val < 39) return 'Фебрильная';
      if (val < 40) return 'Высокая';
      return 'Очень высокая — нужен врач';
    },

    bristolLabel(type) {
      const labels = ['', 'Запор (тип 1)', 'Запор (тип 2)', 'Норма (тип 3)', 'Норма (тип 4)', 'Норма (тип 5)', 'Диарея (тип 6)', 'Диарея (тип 7)'];
      return labels[type] || '';
    },

    severityLabel(s) {
      const map = { mild: '🌱 Слабо', moderate: '🌿 Средне', severe: '🔥 Сильно' };
      return map[s] || '';
    },

    formatDose(h) {
      if (!h) return '—';
      if (h.dose_form === 'суппозитории' && h.dose_qty != null) {
        return `${h.dose_qty} шт (${h.dose_mg || '?'} мг)`;
      }
      const ml = h.dose_ml != null ? h.dose_ml + ' мл' : null;
      const mg = h.dose_mg != null ? h.dose_mg + ' мг' : null;
      if (ml && mg) return `${ml} · ${mg}`;
      return ml || mg || '—';
    }
  };

  // --- THEME ---

  window.Theme = {
    current: 'auto',

    init() {
      const saved = localStorage.getItem('dose_pwa_theme') || 'auto';
      this.current = saved;
      this.apply(saved);

      const chips = document.querySelectorAll('#theme-switcher .filter-chip');
      chips.forEach(c => c.classList.toggle('active', c.dataset.theme === saved));
      chips.forEach(c => {
        c.addEventListener('click', () => {
          chips.forEach(ch => ch.classList.remove('active'));
          c.classList.add('active');
          this.current = c.dataset.theme;
          localStorage.setItem('dose_pwa_theme', this.current);
          this.apply(this.current);
        });
      });

      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => {
        if (this.current === 'auto') this.apply('auto');
      });
    },

    apply(mode) {
      const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = isDark ? '#121212' : '#1976d2';
    }
  };
})();
