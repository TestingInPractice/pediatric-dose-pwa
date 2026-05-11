(function () {
  'use strict';

  window.$ = (id) => document.getElementById(id);
  window.qsa = (sel) => document.querySelectorAll(sel);

  const Store = {
    drugs: [],
    categories: [],
    patients: [],
    currentResult: null,
    currentPatientId: null,
    historyFilterDays: null,
    historySearchQuery: null,
    historyDateFilter: null,
    diaryPatientId: null,
    diaryActiveEpisode: null,

    async loadData() {
      try {
        const resp = await fetch('data/drugs.json?_=' + Date.now());
        const data = await resp.json();
        this.drugs = data.drugs || [];
        this.categories = data.categories || [];
        localStorage.setItem('dose_pwa_drugs', JSON.stringify({ drugs: this.drugs, categories: this.categories }));
        this.renderDrugSelect();
        this.updateVersion();
      } catch (e) {
        const stored = localStorage.getItem('dose_pwa_drugs');
        if (stored) {
          const parsed = JSON.parse(stored);
          this.drugs = parsed.drugs || [];
          this.categories = parsed.categories || [];
          this.renderDrugSelect();
          this.updateVersion();
        } else if (typeof UI !== 'undefined') {
          UI.showError('Ошибка загрузки данных: ' + e.message);
        }
      }
    },

    renderDrugSelect() {
      const select = $('drug-select');
      if (!select) return;
      select.innerHTML = '<option value="">— Выберите препарат —</option>';
      this.categories.forEach(cat => {
        const group = document.createElement('optgroup');
        group.label = cat.name;
        const catDrugs = this.drugs.filter(d => d.category_id === cat.id);
        catDrugs.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.name;
          group.appendChild(opt);
        });
        select.appendChild(group);
      });
    },

    updateVersion() {
      const badge = $('version-badge'), ver = $('data-version');
      if (ver) ver.textContent = '1.0.0';
      if (badge) badge.style.display = 'inline';
    },

    async loadPatients() {
      try { this.patients = await DB.getPatients(); } catch (e) { this.patients = []; }
    },

    renderPatientSelect() {
      const select = $('patient-select');
      if (!select) return;
      const currentVal = select.value;
      select.innerHTML = '';
      this.patients.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${UI.calcAge(p.birthDate)}, ${p.weight || '?'} кг)`;
        select.appendChild(opt);
      });
      if (this.patients.length) {
        if (currentVal && this.patients.find(p => p.id == currentVal)) {
          select.value = currentVal;
        } else {
          select.value = this.patients[0].id;
          select.dispatchEvent(new Event('change'));
        }
      }
    }
  };

  window.Store = Store;
})();
