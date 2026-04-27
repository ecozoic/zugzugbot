import { describe, expect, it, vi, beforeEach } from 'vitest';

const graphqlMock = vi.fn();
vi.mock('../../../apis/warcraftlogs/index.js', () => ({
  graphql: (q: string, v: Record<string, unknown>) => graphqlMock(q, v),
}));

import {
  fetchEncounterRankings,
  topReports,
  summarizeRankings,
  DIFFICULTY,
} from '../rankings.js';
import type { CharacterRankingsBlob } from '../../../apis/warcraftlogs/index.js';

function fakeBlob(
  overrides: Partial<CharacterRankingsBlob> = {},
): CharacterRankingsBlob {
  return {
    page: 1,
    hasMorePages: false,
    count: 100,
    rankings: [
      {
        name: 'A',
        class: 'Paladin',
        spec: 'Retribution',
        amount: 1000000,
        report: { code: 'aaa', fightID: 1, startTime: 1 },
      },
      {
        name: 'B',
        class: 'Paladin',
        spec: 'Retribution',
        amount: 900000,
        report: { code: 'bbb', fightID: 2, startTime: 2 },
      },
      {
        name: 'C',
        class: 'Paladin',
        spec: 'Retribution',
        amount: 800000,
        report: { code: 'ccc', fightID: 3, startTime: 3 },
      },
    ],
    ...overrides,
  };
}

describe('fetchEncounterRankings', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('passes through className/specName/difficulty/metric and returns the rankings blob', async () => {
    graphqlMock.mockResolvedValue({
      worldData: { encounter: { characterRankings: fakeBlob() } },
    });
    const out = await fetchEncounterRankings({
      encounterId: 999,
      className: 'Paladin',
      specName: 'Retribution',
      difficulty: DIFFICULTY.Mythic ?? 5,
      metric: 'dps',
    });
    expect(out?.rankings).toHaveLength(3);
    const [, vars] = graphqlMock.mock.calls[0]!;
    expect(vars).toMatchObject({
      encounterId: 999,
      className: 'Paladin',
      specName: 'Retribution',
      difficulty: 5,
      metric: 'dps',
      page: 1,
    });
  });

  it('returns null when the encounter or rankings is missing', async () => {
    graphqlMock.mockResolvedValue({ worldData: { encounter: null } });
    const out = await fetchEncounterRankings({
      encounterId: 1,
      className: 'X',
      specName: 'Y',
      difficulty: 5,
      metric: 'dps',
    });
    expect(out).toBeNull();
  });
});

describe('topReports', () => {
  it('takes the first N rankings', () => {
    const blob = fakeBlob();
    expect(topReports(blob, 2)).toHaveLength(2);
    expect(topReports(blob, 2)[0]?.name).toBe('A');
  });

  it('filters out malformed entries (missing report.code)', () => {
    const blob = fakeBlob({
      rankings: [
        {
          name: 'A',
          class: 'P',
          spec: 'R',
          amount: 1,
          report: { code: 'a', fightID: 1, startTime: 1 },
        },
        { name: 'B', class: 'P', spec: 'R', amount: 1 } as unknown as never,
      ],
    });
    expect(topReports(blob, 5)).toHaveLength(1);
  });

  it('returns [] when blob is null', () => {
    expect(topReports(null, 5)).toEqual([]);
  });
});

describe('summarizeRankings', () => {
  it('returns top, median, count and lowSample flag', () => {
    const blob = fakeBlob({ count: 30 });
    const out = summarizeRankings(blob);
    expect(out).toEqual({
      top: 1000000,
      median: 900000,
      count: 30,
      lowSample: true,
    });
  });

  it('flags lowSample=false when count >= 50', () => {
    const blob = fakeBlob({ count: 1000 });
    const out = summarizeRankings(blob);
    expect(out?.lowSample).toBe(false);
  });

  it('returns null on empty blob', () => {
    expect(summarizeRankings(null)).toBeNull();
    const blob = fakeBlob({ rankings: [] });
    expect(summarizeRankings(blob)).toBeNull();
  });
});
