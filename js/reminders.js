(function () {
  'use strict';

  const STORAGE_KEY = 'dose_pwa_reminders';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }

  function save(reminders) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  }

  window.Reminder = {
    async requestPermission() {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const result = await Notification.requestPermission();
      return result === 'granted';
    },

    schedule(patientName, drugName, doseMl, doseMg, hoursFromNow) {
      const dueAt = Date.now() + hoursFromNow * 3600000;
      const reminder = {
        id: Date.now() + Math.random(),
        patientName,
        drugName,
        doseMl,
        doseMg,
        dueAt,
        notified: false,
        createdAt: Date.now()
      };
      const reminders = load();
      reminders.push(reminder);
      save(reminders);

      // Schedule notification via setTimeout
      const timeoutMs = hoursFromNow * 3600000;
      setTimeout(() => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const n = new Notification('💊 Пора принять лекарство', {
          body: `${patientName}: ${drugName} ${doseMl || '?'} мл (${doseMg || '?'} мг)`,
          icon: 'icons/icon-192x192.png',
          tag: 'dose-reminder'
        });
        n.onclick = () => { window.focus(); n.close(); };
        // Mark as notified
        const all = load();
        const updated = all.map(r => r.id === reminder.id ? { ...r, notified: true } : r);
        save(updated);
      }, timeoutMs);

      return reminder;
    },

    listPending() {
      return load().filter(r => !r.notified && r.dueAt > Date.now());
    },

    listOverdue() {
      return load().filter(r => !r.notified && r.dueAt <= Date.now());
    },

    checkOverdue() {
      const overdue = this.listOverdue();
      if (!overdue.length) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      overdue.forEach(r => {
        const n = new Notification('💊 Пропущен приём!', {
          body: `${r.patientName}: ${r.drugName} (просрочено)`,
          icon: 'icons/icon-192x192.png',
          tag: 'dose-reminder-overdue'
        });
        n.onclick = () => { window.focus(); n.close(); };
        const all = load();
        const updated = all.map(rem => rem.id === r.id ? { ...rem, notified: true } : rem);
        save(updated);
      });
    },

    cancel(id) {
      const reminders = load().filter(r => r.id !== id);
      save(reminders);
    },

    clearAll() {
      localStorage.removeItem(STORAGE_KEY);
    }
  };
})();
