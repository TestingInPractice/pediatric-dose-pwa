import { describe, it, expect } from 'vitest';

const { DB, buildBackup, parseBackup } = globalThis;

const ERR_CORRUPTED = 'Файл повреждён или это не резервная копия';
const ERR_NOT_BACKUP = 'Это не резервная копия калькулятора дозировок';

const sampleData = {
  patients: [{ id: 1, name: 'Маша', weight: 8 }],
  history: [
    { id: 1, patient_id: 1, drug_id: 3, confirmed: true },
    { id: 2, patient_id: 1, drug_id: 1, confirmed: false }
  ],
  symptoms: [],
  episodes: [{ id: 1, patient_id: 1, startDate: '2026-08-20' }]
};

describe('DB.buildBackup', () => {
  it('produces envelope with app marker, schema 1 and ISO exportedAt', () => {
    const b = buildBackup(sampleData);
    expect(b.app).toBe('pediatric-dose-pwa');
    expect(b.schema).toBe(1);
    expect(typeof b.exportedAt).toBe('string');
    expect(b.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps the four arrays as-is', () => {
    const b = buildBackup(sampleData);
    expect(b.data).toEqual(sampleData);
  });

  it('defaults missing keys to empty arrays', () => {
    const b = buildBackup({});
    expect(b.data).toEqual({ patients: [], history: [], symptoms: [], episodes: [] });
  });
});

describe('DB.parseBackup — round-trip', () => {
  it('buildBackup → stringify → parseBackup restores arrays and counts', () => {
    const json = JSON.stringify(buildBackup(sampleData));
    const parsed = parseBackup(json);
    expect(parsed.data).toEqual(sampleData);
    expect(parsed.counts).toEqual({ patients: 1, history: 2, symptoms: 0, episodes: 1 });
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('DB.parseBackup — validation', () => {
  it('corrupted JSON → «Файл повреждён или это не резервная копия»', () => {
    expect(() => parseBackup('{not valid json')).toThrow(ERR_CORRUPTED);
  });

  it('non-string input → «Файл повреждён или это не резервная копия»', () => {
    expect(() => parseBackup(null)).toThrow(ERR_CORRUPTED);
    expect(() => parseBackup(undefined)).toThrow(ERR_CORRUPTED);
    expect(() => parseBackup(42)).toThrow(ERR_CORRUPTED);
  });

  it('wrong app marker → «Это не резервная копия калькулятора дозировок»', () => {
    const text = JSON.stringify({ app: 'some-other-app', data: sampleData });
    expect(() => parseBackup(text)).toThrow(ERR_NOT_BACKUP);
  });

  it('missing data key → «Это не резервная копия калькулятора дозировок»', () => {
    const text = JSON.stringify({ app: 'pediatric-dose-pwa' });
    expect(() => parseBackup(text)).toThrow(ERR_NOT_BACKUP);
  });

  it('data:null → «Это не резервная копия калькулятора дозировок»', () => {
    const text = JSON.stringify({ app: 'pediatric-dose-pwa', data: null });
    expect(() => parseBackup(text)).toThrow(ERR_NOT_BACKUP);
  });

  it('non-array key (patients:"x") → «Это не резервная копия калькулятора дозировок»', () => {
    const text = JSON.stringify({
      app: 'pediatric-dose-pwa',
      data: { ...sampleData, patients: 'x' }
    });
    expect(() => parseBackup(text)).toThrow(ERR_NOT_BACKUP);
  });

  it('missing individual keys default to [] with counts 0', () => {
    const text = JSON.stringify({ app: 'pediatric-dose-pwa', data: {} });
    const parsed = parseBackup(text);
    expect(parsed.data).toEqual({ patients: [], history: [], symptoms: [], episodes: [] });
    expect(parsed.counts).toEqual({ patients: 0, history: 0, symptoms: 0, episodes: 0 });
  });

  it('extra unknown keys inside data are ignored', () => {
    const text = JSON.stringify({
      app: 'pediatric-dose-pwa',
      data: { ...sampleData, drugs: [{ id: 1 }], junk: true }
    });
    const parsed = parseBackup(text);
    expect(Object.keys(parsed.data).sort()).toEqual(['episodes', 'history', 'patients', 'symptoms']);
    expect(parsed.data.drugs).toBeUndefined();
    expect(parsed.data.junk).toBeUndefined();
  });

  it('exportedAt missing or empty → null', () => {
    const noDate = parseBackup(JSON.stringify({ app: 'pediatric-dose-pwa', data: {} }));
    expect(noDate.exportedAt).toBeNull();
    const emptyDate = parseBackup(
      JSON.stringify({ app: 'pediatric-dose-pwa', exportedAt: '', data: {} })
    );
    expect(emptyDate.exportedAt).toBeNull();
  });

  it('exportedAt non-empty string is kept verbatim', () => {
    const iso = '2026-01-15T09:30:00.000Z';
    const parsed = parseBackup(JSON.stringify({ app: 'pediatric-dose-pwa', exportedAt: iso, data: {} }));
    expect(parsed.exportedAt).toBe(iso);
  });
});

describe('DB.buildBackupFilename', () => {
  it('formats dose-backup-YYYY-MM-DD.json from ISO string', () => {
    expect(DB.buildBackupFilename('2026-08-22T10:00:00.000Z')).toBe('dose-backup-2026-08-22.json');
  });

  it('uses date part only (no timezone shift)', () => {
    expect(DB.buildBackupFilename('2026-12-31T23:59:59.999Z')).toBe('dose-backup-2026-12-31.json');
  });
});

describe('DB.exportFull / DB.importAll (mocked Dexie tables)', () => {
  const store = { patients: [], history: [], symptoms: [], episodes: [] };
  let ops;

  function makeTable(name) {
    return {
      toArray: async () => store[name].map(x => ({ ...x })),
      clear: async () => {
        ops.push(`${name}:clear`);
        store[name] = [];
      },
      bulkAdd: async items => {
        ops.push(`${name}:bulkAdd`);
        store[name] = [...items];
      }
    };
  }

  function installMockDb() {
    ops = [];
    DB.db = {
      patients: makeTable('patients'),
      history: makeTable('history'),
      symptoms: makeTable('symptoms'),
      episodes: makeTable('episodes'),
      transaction: async (...args) => {
        const fn = args[args.length - 1];
        ops.push('tx:start');
        await fn();
        ops.push('tx:end');
      }
    };
  }

  it('exportFull returns pretty-printed JSON of all four tables', async () => {
    installMockDb();
    store.patients = sampleData.patients;
    store.history = sampleData.history;
    store.symptoms = sampleData.symptoms;
    store.episodes = sampleData.episodes;
    const json = await DB.exportFull();
    const parsed = parseBackup(json);
    expect(JSON.parse(json).app).toBe('pediatric-dose-pwa');
    expect(parsed.counts).toEqual({ patients: 1, history: 2, symptoms: 0, episodes: 1 });
    expect(json).toContain('\n  "app"');
  });

  it('importAll clears+bulkAdds all 4 tables inside ONE transaction and returns counts', async () => {
    installMockDb();
    store.history = [{ id: 99, stale: true }];
    const counts = await DB.importAll(parseBackup(JSON.stringify(buildBackup(sampleData))));
    expect(counts).toEqual({ patients: 1, history: 2, symptoms: 0, episodes: 1 });
    expect(store.patients).toEqual(sampleData.patients);
    expect(store.history).toEqual(sampleData.history);
    expect(store.episodes).toEqual(sampleData.episodes);
    expect(ops[0]).toBe('tx:start');
    expect(ops[ops.length - 1]).toBe('tx:end');
    expect(ops.filter(op => op === 'tx:start').length).toBe(1);
    expect(ops.filter(op => op.endsWith(':clear')).length).toBe(4);
    expect(ops.filter(op => op.endsWith(':bulkAdd')).length).toBe(4);
    expect(ops.indexOf('tx:end') - ops.indexOf('tx:start')).toBe(9);
  });
});
