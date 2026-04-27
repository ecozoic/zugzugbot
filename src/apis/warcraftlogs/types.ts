/**
 * GraphQL response shapes for the Warcraft Logs v2 client API.
 *
 * Captured from real responses via `npm run debug:wcl`. Only the
 * fields we actually consume are typed; WCL returns much more on
 * each shape.
 */

export interface ZoneRef {
  id: number;
  name: string;
  frozen: boolean;
  expansion: { id: number; name: string };
  encounters?: Array<{ id: number; name: string }>;
  difficulties?: Array<{ id: number; name: string; sizes: number[] }>;
  partitions?: Array<{ id: number; name: string; default: boolean }>;
}

export interface WorldDataZonesResponse {
  worldData: {
    zones: ZoneRef[];
  };
}

export interface CharacterRanking {
  name: string;
  class: string;
  spec: string;
  amount: number;
  duration?: number;
  hardModeLevel?: number;
  guild?: { name: string; faction?: number } | null;
  server?: { name: string; region: string };
  faction?: number;
  report: { code: string; fightID: number; startTime: number };
  bracketData?: number;
}

export interface CharacterRankingsBlob {
  page: number;
  hasMorePages: boolean;
  count: number;
  rankings?: CharacterRanking[];
}

export interface EncounterRankingsResponse {
  worldData: {
    encounter: {
      characterRankings: CharacterRankingsBlob | null;
    } | null;
  };
}

/**
 * Shape of a single CombatantInfo event payload (the `data` array
 * inside `events.data`). WCL returns this as a JSON blob — we type
 * only what we consume. `talents[]` and `customPowerSet[]` are
 * always-empty legacy fields and are intentionally omitted.
 */
export interface CombatantInfoGearItem {
  id: number;
  quality?: number;
  icon?: string;
  itemLevel?: number;
  permanentEnchant?: number;
  bonusIDs?: number[];
  gems?: Array<{ id: number; itemLevel?: number; icon?: string }>;
  setID?: number;
}

export interface CombatantInfoTalent {
  id: number;
  rank: number;
  nodeID?: number;
}

export interface CombatantInfoData {
  /** Set by WCL on each event when not filtering by sourceID. */
  sourceID?: number;
  /** Fight ID when bundled in a multi-fight events response. */
  fight?: number;
  specID?: number;
  strength?: number;
  agility?: number;
  stamina?: number;
  intellect?: number;
  armor?: number;
  critMelee?: number;
  critRanged?: number;
  critSpell?: number;
  hasteMelee?: number;
  hasteRanged?: number;
  hasteSpell?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  versatilityHealingDone?: number;
  versatilityDamageReduction?: number;
  gear?: CombatantInfoGearItem[];
  talentTree?: CombatantInfoTalent[];
}
