import { describe, expect, it } from 'vitest';
import { renderPerSpecMd } from '../per-spec.js';
import { SPECS } from '../specs.js';
import type { BuildSnapshot } from '../aggregate.js';

const RET = SPECS.find(
  (s) => s.classSlug === 'paladin' && s.specSlug === 'retribution',
)!;

function fakeSnapshot(overrides: Partial<BuildSnapshot> = {}): BuildSnapshot {
  return {
    sampleSize: 5,
    canonicalLoadout: [{ id: 100, rank: 1 }],
    loadoutConsensus: true,
    resolvedTalents: [
      {
        talentId: 100,
        rank: 1,
        name: 'Crusade',
        tree: 'spec_talent',
        heroTree: null,
      },
      {
        talentId: 300,
        rank: 1,
        name: 'Wrathful Sanction',
        tree: 'hero_talent',
        heroTree: 'templar',
      },
      {
        talentId: 50,
        rank: 1,
        name: 'Lay on Hands',
        tree: 'class_talent',
        heroTree: null,
      },
    ],
    heroTree: {
      dominant: 'templar',
      splits: { templar: 4, 'herald-of-the-sun': 1 },
      totalSamples: 5,
    },
    trinkets: [
      { itemId: 249961, count: 4 },
      { itemId: 249962, count: 3 },
    ],
    tierSets: [{ setId: 1700, twoPiecePlayers: 5, fourPiecePlayers: 4 }],
    statPriority: {
      ordering: [
        { stat: 'crit', total: 50000 },
        { stat: 'mastery', total: 30000 },
        { stat: 'haste', total: 20000 },
        { stat: 'versatility', total: 10000 },
      ],
    },
    ...overrides,
  };
}

describe('renderPerSpecMd', () => {
  it('renders raid frontmatter + body for a populated snapshot', () => {
    const md = renderPerSpecMd({
      spec: RET,
      contentType: 'raid',
      zoneId: 46,
      zoneName: 'VS / DR / MQD',
      patch: '12.0.5',
      syncedAt: '2026-04-26T22:00:00Z',
      snapshot: fakeSnapshot(),
    });
    expect(md).toContain('game: wow');
    expect(md).toContain('kind: meta');
    expect(md).toContain('class: paladin');
    expect(md).toContain('spec: retribution');
    expect(md).toContain('content_type: raid');
    expect(md).toContain('percentile: p99');
    expect(md).toContain('sample_size: 5');
    expect(md).toContain('zone_id: 46');
    expect(md).toContain('# Retribution Paladin — Mythic Raid Meta (12.0.5)');
    expect(md).toContain('## Hero Tree');
    expect(md).toContain('**Templar** dominant.');
    expect(md).toContain('## Talent Build');
    expect(md).toContain('**Class tree:** Lay on Hands');
    expect(md).toContain('**Spec tree:** Crusade');
    expect(md).toContain('**Hero tree (Templar):** Wrathful Sanction');
    expect(md).toContain('## Gear / Trinkets');
    expect(md).toContain('https://wowhead.com/item=249961');
    expect(md).toContain('Set ID 1700');
    expect(md).toContain('## Stat Priority Hint');
    expect(md).toContain('Crit > Mastery > Haste > Versatility');
  });

  it('renders mplus content_type and header label', () => {
    const md = renderPerSpecMd({
      spec: RET,
      contentType: 'mplus',
      zoneId: 47,
      zoneName: 'Mythic+ Season 1',
      patch: '12.0.5',
      syncedAt: '2026-04-26T22:00:00Z',
      snapshot: fakeSnapshot(),
    });
    expect(md).toContain('content_type: mplus');
    expect(md).toContain('zone_id: 47');
    expect(md).toContain('Mythic+ Meta (12.0.5)');
  });

  it('handles empty snapshot gracefully', () => {
    const md = renderPerSpecMd({
      spec: RET,
      contentType: 'raid',
      zoneId: 46,
      zoneName: 'VS / DR / MQD',
      patch: '12.0.5',
      syncedAt: '2026-04-26T22:00:00Z',
      snapshot: {
        sampleSize: 0,
        canonicalLoadout: [],
        loadoutConsensus: false,
        resolvedTalents: [],
        heroTree: { dominant: null, splits: {}, totalSamples: 0 },
        trinkets: [],
        tierSets: [],
        statPriority: { ordering: [] },
      },
    });
    expect(md).toContain('No hero tree data available');
    expect(md).toContain('No talent data available');
    expect(md).toContain('No trinket data available');
    expect(md).toContain('No stat data available');
  });

  it('marks lack of consensus when loadoutConsensus=false', () => {
    const md = renderPerSpecMd({
      spec: RET,
      contentType: 'raid',
      zoneId: 46,
      zoneName: 'VS / DR / MQD',
      patch: '12.0.5',
      syncedAt: '2026-04-26T22:00:00Z',
      snapshot: fakeSnapshot({ loadoutConsensus: false }),
    });
    expect(md).toContain('No majority loadout');
  });
});
