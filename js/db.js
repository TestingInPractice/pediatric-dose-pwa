const DB = {
  db: null,

  async init() {
    try {
      this.db = new Dexie('PediatricDoseDB_v2');
      this.db.version(1).stores({
        drugs: 'id, category_id, name',
        categories: 'id',
        patients: '++id, name',
        history: '++id, patient_id, drug_id, timestamp'
      });
      this.db.version(2).stores({
        drugs: 'id, category_id, name',
        categories: 'id',
        patients: '++id, name',
        history: '++id, patient_id, drug_id, timestamp',
        symptoms: '++id, patient_id, episode_id, type, timestamp',
        episodes: '++id, patient_id, startDate'
      });
      await this.db.open();
      if (this.db.tables.length === 0) throw new Error('Tables not created');
    } catch (e) {
      console.warn('DB init error, recreating:', e);
      try { await this.db.delete(); } catch (_) {}
      this.db = new Dexie('PediatricDoseDB_v2');
      this.db.version(1).stores({
        drugs: 'id, category_id, name',
        categories: 'id',
        patients: '++id, name',
        history: '++id, patient_id, drug_id, timestamp'
      });
      this.db.version(2).stores({
        drugs: 'id, category_id, name',
        categories: 'id',
        patients: '++id, name',
        history: '++id, patient_id, drug_id, timestamp',
        symptoms: '++id, patient_id, episode_id, type, timestamp',
        episodes: '++id, patient_id, startDate'
      });
      await this.db.open();
    }
    return this;
  },

  // --- Patients ---
  async addPatient(patient) {
    patient.createdAt = new Date().toISOString();
    return await this.db.patients.add(patient);
  },

  async updatePatient(id, data) {
    return await this.db.patients.update(id, data);
  },

  async deletePatient(id) {
    await this.db.transaction('rw', this.db.patients, this.db.history, this.db.symptoms, this.db.episodes, async () => {
      await this.db.patients.delete(id);
      await this.db.history.where('patient_id').equals(id).delete();
      await this.db.symptoms.where('patient_id').equals(id).delete();
      await this.db.episodes.where('patient_id').equals(id).delete();
    });
  },

  async getPatients() {
    return await this.db.patients.toArray();
  },

  async getPatient(id) {
    return await this.db.patients.get(id);
  },

  // --- Drugs ---
  async loadDrugs() {
    return await this.db.drugs.toArray();
  },

  async loadCategories() {
    return await this.db.categories.toArray();
  },

  async saveDrugs(drugs, categories) {
    await this.db.transaction('rw', this.db.drugs, this.db.categories, async () => {
      await this.db.drugs.clear();
      await this.db.categories.clear();
      await this.db.drugs.bulkAdd(drugs);
      await this.db.categories.bulkAdd(categories);
    });
  },

  // --- History ---
  async saveCalculation(calc) {
    calc.timestamp = new Date().toISOString();
    return await this.db.history.add(calc);
  },

  async confirmAdministration(id) {
    return await this.db.history.update(id, { confirmed: true, confirmedAt: new Date().toISOString() });
  },

  async deleteHistoryItem(id) {
    return await this.db.history.delete(id);
  },

  async getHistory(limit = 50, patientId = null) {
    let items;
    if (patientId != null) {
      items = await this.db.history
        .where('patient_id').equals(patientId)
        .filter(h => h.confirmed)
        .toArray();
    } else {
      items = await this.db.history
        .filter(h => h.confirmed)
        .toArray();
    }
    items.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    return items.slice(0, limit);
  },

  async getPending(limit = 50) {
    const items = await this.db.history
      .filter(h => !h.confirmed)
      .toArray();
    items.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    return items.slice(0, limit);
  },

  async getRecentConfirmed(patientId, hoursBack = 12) {
    const cutoff = new Date(Date.now() - hoursBack * 3600000).toISOString();
    const all = await this.db.history
      .where('patient_id').equals(patientId)
      .filter(h => h.confirmed && h.timestamp >= cutoff)
      .toArray();
    all.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    return all;
  },

  async getLastAdministration(patientId, drugId) {
    const all = await this.db.history
      .where({ patient_id: patientId, drug_id: drugId })
      .filter(h => h.confirmed)
      .toArray();
    all.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    return all[0] || null;
  },

  async clearHistory() {
    return await this.db.history.clear();
  },

  async exportHistory() {
    const data = await this.db.history.toArray();
    return JSON.stringify(data, null, 2);
  },

  // --- Episodes ---
  async addEpisode(episode) {
    episode.createdAt = new Date().toISOString();
    return await this.db.episodes.add(episode);
  },

  async updateEpisode(id, data) {
    return await this.db.episodes.update(id, data);
  },

  async deleteEpisode(id) {
    return await this.db.transaction('rw', this.db.episodes, this.db.symptoms, this.db.history, async () => {
      await this.db.episodes.delete(id);
      await this.db.symptoms.where('episode_id').equals(id).modify({ episode_id: null });
      await this.db.history.where('episode_id').equals(id).modify({ episode_id: null });
    });
  },

  async getActiveEpisode(patientId) {
    const episodes = await this.db.episodes
      .where({ patient_id: patientId })
      .filter(e => !e.endDate)
      .toArray();
    episodes.sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
    return episodes[0] || null;
  },

  async getEpisodes(patientId) {
    const items = await this.db.episodes
      .where('patient_id').equals(patientId)
      .toArray();
    items.sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
    return items;
  },

  async closeEpisode(id) {
    return await this.db.episodes.update(id, { endDate: new Date().toISOString() });
  },

  // --- Symptoms ---
  async addSymptom(symptom) {
    symptom.timestamp = symptom.timestamp || new Date().toISOString();
    return await this.db.symptoms.add(symptom);
  },

  async getSymptoms(patientId, episodeId = null, limit = 100) {
    let items;
    if (episodeId != null) {
      items = await this.db.symptoms
        .where({ patient_id: patientId, episode_id: episodeId })
        .toArray();
    } else {
      items = await this.db.symptoms
        .where('patient_id').equals(patientId)
        .toArray();
    }
    items.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    return items.slice(0, limit);
  },

  async deleteSymptom(id) {
    return await this.db.symptoms.delete(id);
  }
};
