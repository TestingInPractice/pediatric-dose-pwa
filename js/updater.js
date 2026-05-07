const Updater = {
  VERSION_KEY: 'dose_pwa_version',

  getLocalVersion() {
    try {
      return JSON.parse(localStorage.getItem(this.VERSION_KEY) || '{}');
    } catch { return {}; }
  },

  setLocalVersion(ver) {
    localStorage.setItem(this.VERSION_KEY, JSON.stringify(ver));
  },

  async checkForUpdates() {
    try {
      const resp = await fetch('data/manifest.json?_=' + Date.now());
      const remote = await resp.json();
      const local = this.getLocalVersion();

      const isNewer = !local.version || local.version !== remote.version;

      const result = {
        current: local.version || '—',
        latest: remote.version,
        updated: remote.updated,
        hasUpdate: isNewer,
        needsDownload: false,
        files: []
      };

      if (remote.files) {
        Object.entries(remote.files).forEach(([path, meta]) => {
          const cached = localStorage.getItem('file_hash_' + path);
          if (!cached || cached !== meta.hash) {
            result.needsDownload = true;
            result.files.push(path);
          }
        });
      }

      return result;
    } catch (e) {
      return { error: e.message };
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Updater };
}
