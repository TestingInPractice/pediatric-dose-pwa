import { describe, it, expect, beforeEach } from 'vitest';

const { L3 } = globalThis;
const originalLoadStats = L3.loadStats;

const emptyStats = { by_generic: {} };

const paracetamolDrug = { id: 1, name: 'Парацетамол' };
const fenistilDrug = { id: 11, name: 'Фенистил', mgs_range: '0.03-0.05 мг/кг' };
const ambroxolDrug = { id: 13, name: 'Амброксол', mgs_range: '0.3-0.5 мг/кг' };
const maltoferDrug = { id: 16, name: 'Мальтофер', mgs_range: '3-6 мг/кг' };

beforeEach(() => {
  L3.loadStats = async () => emptyStats;
});

describe('L3 fallback — instruction range (mgs_range)', () => {
  it('id 11 Фенистил: dose 0.04 in range → level 0', async () => {
    const res = await L3.validate(11, 0, 10, 0.04, fenistilDrug);
    expect(res.level).toBe(0);
    expect(res.message).toContain('0.03-0.05');
  });

  it('id 11 Фенистил: dose 0.02 below range → level -1', async () => {
    const res = await L3.validate(11, 0, 10, 0.02, fenistilDrug);
    expect(res.level).toBe(-1);
    expect(res.message).toContain('ниже');
  });

  it('id 11 Фенистил: dose 0.06 above range → level 1', async () => {
    const res = await L3.validate(11, 0, 10, 0.06, fenistilDrug);
    expect(res.level).toBe(1);
    expect(res.message).toContain('выше');
  });

  it('id 13 Амброксол: dose 0.5 at upper bound → level 0', async () => {
    const res = await L3.validate(13, 0, 10, 0.5, ambroxolDrug);
    expect(res.level).toBe(0);
    expect(res.message).toContain('0.3-0.5');
  });

  it('id 16 Мальтофер: dose 4.5 in range → level 0', async () => {
    const res = await L3.validate(16, 0, 10, 4.5, maltoferDrug);
    expect(res.level).toBe(0);
    expect(res.message).toContain('3-6');
  });

  it('id 16 Мальтофер: dose 7 above range → level 1', async () => {
    const res = await L3.validate(16, 0, 10, 7, maltoferDrug);
    expect(res.level).toBe(1);
    expect(res.message).toContain('выше');
  });
});

describe('L3 fallback — regression (no mgs_range)', () => {
  it('unknown drug without mgs_range and empty stats → level -1 нет данных', async () => {
    const res = await L3.validate(99, 0, 10, 5, { id: 99, name: 'X' });
    expect(res.level).toBe(-1);
    expect(res.message).toContain('нет данных');
  });
});

describe('L3 FAERS path — percentile validation', () => {
  beforeEach(() => {
    L3.loadStats = async () => ({
      by_generic: {
        paracetamol: {
          count: 5,
          dose_mg_per_kg: {
            n: 5, mean: 11, p50: 10,
            p5: 5, p95: 20,
            _all: [5, 8, 10, 12, 20],
          },
        },
      },
    });
  });

  it('paracetamol id 1: dose 10 in p5-p95 → level 0 typical range', async () => {
    const res = await L3.validate(1, 0, 8, 10, paracetamolDrug);
    expect(res.level).toBe(0);
    expect(res.message).toContain('типичном');
  });
});
