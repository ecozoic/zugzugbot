import { describe, expect, it } from 'vitest';
import {
  pickZones,
  FALLBACK_RAID_ZONE_ID,
  FALLBACK_MPLUS_ZONE_ID,
} from '../zones.js';
import type { ZoneRef } from '../../../apis/warcraftlogs/index.js';

function fakeZone(z: Partial<ZoneRef> & { id: number; name: string }): ZoneRef {
  return {
    frozen: false,
    expansion: { id: 11, name: 'The War Within' },
    encounters: [],
    ...z,
  };
}

describe('pickZones', () => {
  it('picks the latest non-frozen raid (>=6 encounters) and the m+ zone', () => {
    const zones: ZoneRef[] = [
      fakeZone({
        id: 46,
        name: 'VS / DR / MQD',
        encounters: Array.from({ length: 9 }, (_, i) => ({
          id: i + 1,
          name: `Boss ${i}`,
        })),
      }),
      fakeZone({ id: 47, name: 'Mythic+ Season 1' }),
      fakeZone({
        id: 35,
        name: 'Old Tier (Frozen)',
        frozen: true,
        encounters: Array.from({ length: 8 }, (_, i) => ({
          id: i + 100,
          name: `Old ${i}`,
        })),
      }),
    ];
    const out = pickZones(zones);
    expect(out.raid).toEqual({ id: 46, name: 'VS / DR / MQD' });
    expect(out.mplus).toEqual({ id: 47, name: 'Mythic+ Season 1' });
  });

  it('falls back when no candidates match', () => {
    const out = pickZones([]);
    expect(out.raid.id).toBe(FALLBACK_RAID_ZONE_ID);
    expect(out.mplus.id).toBe(FALLBACK_MPLUS_ZONE_ID);
    expect(out.raid.name).toContain('fallback');
    expect(out.mplus.name).toContain('fallback');
  });

  it('skips frozen zones for raid pick', () => {
    const zones: ZoneRef[] = [
      fakeZone({
        id: 50,
        name: 'Newer Raid',
        frozen: true,
        encounters: Array.from({ length: 8 }, (_, i) => ({
          id: i,
          name: `B${i}`,
        })),
      }),
      fakeZone({
        id: 46,
        name: 'Current Raid',
        encounters: Array.from({ length: 9 }, (_, i) => ({
          id: i,
          name: `C${i}`,
        })),
      }),
    ];
    const out = pickZones(zones);
    expect(out.raid.id).toBe(46);
  });

  it('does not classify mythic+ zone as raid even with encounters', () => {
    const zones: ZoneRef[] = [
      fakeZone({
        id: 47,
        name: 'Mythic+ Season 1',
        encounters: Array.from({ length: 8 }, (_, i) => ({
          id: i,
          name: `Dungeon ${i}`,
        })),
      }),
    ];
    const out = pickZones(zones);
    expect(out.raid.id).toBe(FALLBACK_RAID_ZONE_ID);
    expect(out.mplus.id).toBe(47);
  });

  it('picks the latest (highest id) raid when multiple qualify', () => {
    const zones: ZoneRef[] = [
      fakeZone({
        id: 30,
        name: 'Older Raid',
        encounters: Array.from({ length: 8 }, (_, i) => ({
          id: i,
          name: `O${i}`,
        })),
      }),
      fakeZone({
        id: 46,
        name: 'Newer Raid',
        encounters: Array.from({ length: 9 }, (_, i) => ({
          id: i,
          name: `N${i}`,
        })),
      }),
    ];
    const out = pickZones(zones);
    expect(out.raid.id).toBe(46);
  });
});
