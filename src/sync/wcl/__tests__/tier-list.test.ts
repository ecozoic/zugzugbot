import { describe, expect, it } from 'vitest';
import { renderRaidTierListMd, renderMplusTierListMd } from '../tier-list.js';
import { SPECS } from '../specs.js';

const RET = SPECS.find(
  (s) => s.classSlug === 'paladin' && s.specSlug === 'retribution',
)!;
const HOLY = SPECS.find(
  (s) => s.classSlug === 'paladin' && s.specSlug === 'holy',
)!;
const PROT = SPECS.find(
  (s) => s.classSlug === 'paladin' && s.specSlug === 'protection',
)!;

describe('renderRaidTierListMd', () => {
  it('renders frontmatter, overall section and per-boss sections', () => {
    const md = renderRaidTierListMd({
      zoneId: 46,
      zoneName: 'VS / DR / MQD',
      patch: '12.0.5',
      syncedAt: '2026-04-26T22:00:00Z',
      perEncounter: [
        {
          encounter: { id: 1, name: 'Imperator Averzian' },
          difficulty: 'Mythic',
          rankings: [
            { spec: RET, median: 1000000, count: 100, lowSample: false },
            { spec: HOLY, median: 800000, count: 60, lowSample: false },
            { spec: PROT, median: 700000, count: 40, lowSample: true },
          ],
        },
      ],
    });
    expect(md).toContain('---');
    expect(md).toContain('game: wow');
    expect(md).toContain('kind: meta');
    expect(md).toContain('content_type: raid');
    expect(md).toContain('zone_id: 46');
    expect(md).toContain('# Mythic Raid Tier List (12.0.5)');
    expect(md).toContain('## Overall');
    expect(md).toContain('## Per-Boss');
    expect(md).toContain('### Imperator Averzian (Mythic)');
    expect(md).toContain('Retribution Paladin');
    expect(md).toContain('Holy Paladin');
    expect(md).toContain('low sample');
  });

  it('handles empty rankings list per encounter', () => {
    const md = renderRaidTierListMd({
      zoneId: 46,
      zoneName: 'X',
      patch: '12.0.5',
      syncedAt: '2026-04-26T22:00:00Z',
      perEncounter: [
        {
          encounter: { id: 1, name: 'Boss' },
          difficulty: 'Mythic',
          rankings: [],
        },
      ],
    });
    expect(md).toContain('### Boss (Mythic)');
    expect(md).toContain('No ranking data available.');
  });
});

describe('renderMplusTierListMd', () => {
  it('renders frontmatter and per-dungeon sections', () => {
    const md = renderMplusTierListMd({
      zoneId: 47,
      zoneName: 'Mythic+ Season 1',
      patch: '12.0.5',
      syncedAt: '2026-04-26T22:00:00Z',
      perDungeon: [
        {
          encounter: { id: 999, name: "Magisters' Terrace" },
          rankings: [
            { spec: RET, median: 500000, count: 200, lowSample: false },
          ],
        },
      ],
    });
    expect(md).toContain('content_type: mplus');
    expect(md).toContain('zone_id: 47');
    expect(md).toContain('# Mythic+ Tier List');
    expect(md).toContain("### Magisters' Terrace");
    expect(md).toContain('Retribution Paladin');
    expect(md).toContain('DPS:');
  });
});
