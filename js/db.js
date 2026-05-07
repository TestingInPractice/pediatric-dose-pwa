const DB = {
  db: null,

  async init() {
    this.db = new Dexie('PediatricDoseDB');
    this.db.version(1).stores({
      drugs: 'id, category_id, name',
      categories: 'id',
      history: '++id, drug_id, timestamp'
    });
    await this.db.open();
    return this;
  },

  async loadDrugs() {
    const drugs = await this.db.drugs.toArray();
    const categories = await this.db.categories.toArray();
    return { drugs, categories };
  },

  async saveDrugs(drugs, categories) {
    await this.db.transaction('rw', this.db.drugs, this.db.categories, async () => {
      await this.db.drugs.clear();
      await this.db.categories.clear();
      await this.db.drugs.bulkAdd(drugs);
      await this.db.categories.bulkAdd(categories);
    });
  },

  async saveCalculation(calc) {
    calc.timestamp = new Date().toISOString();
    return await this.db.history.add(calc);
  },

  async getHistory(limit = 50) {
    return await this.db.history
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  },

  async clearHistory() {
    return await this.db.history.clear();
  },

  async exportHistory() {
    const data = await this.db.history.toArray();
    return JSON.stringify(data, null, 2);
  },

  async getDataVersion() {
    const val = await this.db.getDataVersion();
    return val || '0.0.0';
  }
};
