import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { graphql } from '../../apis/warcraftlogs/index.js';
import type {
  WorldDataZonesResponse,
  ZoneRef,
} from '../../apis/warcraftlogs/index.js';

export const ZONES_INDEX_PATH = 'data/blizz/wcl-zones.json';

/** Hard-coded fallback for the case where heuristic discovery fails. */
export const FALLBACK_RAID_ZONE_ID = 46;
export const FALLBACK_MPLUS_ZONE_ID = 47;

export interface DiscoveredZone {
  id: number;
  name: string;
}

export interface DiscoveredZones {
  raid: DiscoveredZone;
  mplus: DiscoveredZone;
}

const ZONES_QUERY = `
  query Zones {
    worldData {
      zones {
        id
        name
        frozen
        expansion { id name }
        encounters { id name }
      }
    }
  }
`;

/**
 * Pick the current raid + m+ zone IDs from the WCL `worldData.zones`
 * list. Heuristic:
 *   - mplus: zone whose name matches `Mythic+` (case-insensitive)
 *   - raid: latest non-frozen zone with >= 6 encounters that isn't
 *           a mythic+ partition
 * Falls back to hardcoded IDs if either heuristic returns nothing.
 */
export function pickZones(zones: ZoneRef[]): DiscoveredZones {
  const nonFrozen = zones.filter((z) => !z.frozen);

  const mplusCandidates = nonFrozen.filter((z) => /mythic\+/i.test(z.name));
  const mplus = pickLatest(mplusCandidates);

  const raidCandidates = nonFrozen.filter(
    (z) => !/mythic\+/i.test(z.name) && (z.encounters?.length ?? 0) >= 6,
  );
  const raid = pickLatest(raidCandidates);

  return {
    raid: raid
      ? { id: raid.id, name: raid.name }
      : { id: FALLBACK_RAID_ZONE_ID, name: 'unknown raid (fallback)' },
    mplus: mplus
      ? { id: mplus.id, name: mplus.name }
      : { id: FALLBACK_MPLUS_ZONE_ID, name: 'unknown m+ (fallback)' },
  };
}

function pickLatest(zones: ZoneRef[]): ZoneRef | undefined {
  if (zones.length === 0) return undefined;
  return zones.reduce((acc, z) => (z.id > acc.id ? z : acc));
}

export async function discoverZones(): Promise<DiscoveredZones> {
  const data = await graphql<WorldDataZonesResponse>(ZONES_QUERY);
  return pickZones(data.worldData.zones);
}

export async function writeZonesCache(
  zones: DiscoveredZones,
  syncedAt: string,
): Promise<void> {
  await mkdir(path.dirname(ZONES_INDEX_PATH), { recursive: true });
  const out = {
    synced_at: syncedAt,
    raid: zones.raid,
    mplus: zones.mplus,
  };
  await writeFile(
    ZONES_INDEX_PATH,
    JSON.stringify(out, null, 2) + '\n',
    'utf-8',
  );
}
