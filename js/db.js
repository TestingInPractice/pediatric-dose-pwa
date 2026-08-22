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
      console.warn('DB init error, retrying without delete:', e);
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

  // --- Backup / Restore (full) ---
  buildBackup(data) {
    const src = data || {};
    const pick = key => (Array.isArray(src[key]) ? src[key] : []);
    return {
      app: 'pediatric-dose-pwa',
      schema: 1,
      exportedAt: new Date().toISOString(),
      data: {
        patients: pick('patients'),
        history: pick('history'),
        symptoms: pick('symptoms'),
        episodes: pick('episodes')
      }
    };
  },

  parseBackup(text) {
    if (typeof text !== 'string') {
      throw new Error('Файл повреждён или это не резервная копия');
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Файл повреждён или это не резервная копия');
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      parsed.app !== 'pediatric-dose-pwa' ||
      typeof parsed.data !== 'object' ||
      parsed.data === null
    ) {
      throw new Error('Это не резервная копия калькулятора дозировок');
    }
    const data = {};
    for (const key of ['patients', 'history', 'symptoms', 'episodes']) {
      const value = parsed.data[key];
      if (value === undefined) {
        data[key] = [];
      } else if (!Array.isArray(value)) {
        throw new Error('Это не резервная копия калькулятора дозировок');
      } else {
        data[key] = value;
      }
    }
    return {
      exportedAt:
        typeof parsed.exportedAt === 'string' && parsed.exportedAt.length > 0 ? parsed.exportedAt : null,
      counts: {
        patients: data.patients.length,
        history: data.history.length,
        symptoms: data.symptoms.length,
        episodes: data.episodes.length
      },
      data
    };
  },

  buildBackupFilename(exportedAtIso) {
    const datePart =
      typeof exportedAtIso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(exportedAtIso)
        ? exportedAtIso.slice(0, 10)
        : new Date(exportedAtIso).toISOString().slice(0, 10);
    return `dose-backup-${datePart}.json`;
  },

  async exportFull() {
    const data = {
      patients: await this.db.patients.toArray(),
      history: await this.db.history.toArray(),
      symptoms: await this.db.symptoms.toArray(),
      episodes: await this.db.episodes.toArray()
    };
    return JSON.stringify(this.buildBackup(data), null, 2);
  },

  async importAll(parsed) {
    const src = parsed && typeof parsed.data === 'object' && parsed.data !== null ? parsed.data : {};
    const pick = key => (Array.isArray(src[key]) ? src[key] : []);
    const data = {
      patients: pick('patients'),
      history: pick('history'),
      symptoms: pick('symptoms'),
      episodes: pick('episodes')
    };
    return await this.db.transaction(
      'rw',
      this.db.patients,
      this.db.history,
      this.db.symptoms,
      this.db.episodes,
      async () => {
        await this.db.patients.clear();
        await this.db.patients.bulkAdd(data.patients);
        await this.db.history.clear();
        await this.db.history.bulkAdd(data.history);
        await this.db.symptoms.clear();
        await this.db.symptoms.bulkAdd(data.symptoms);
        await this.db.episodes.clear();
        await this.db.episodes.bulkAdd(data.episodes);
      }
    ).then(() => ({
      patients: data.patients.length,
      history: data.history.length,
      symptoms: data.symptoms.length,
      episodes: data.episodes.length
    }));
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

const buildBackup = DB.buildBackup;
const parseBackup = DB.parseBackup;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DB, buildBackup, parseBackup };
}
