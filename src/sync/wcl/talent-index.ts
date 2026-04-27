import { readFile } from 'node:fs/promises';

export interface TalentIndexEntry {
  name: string;
  class: string;
  specs: string[];
  tree:
    | 'class_baseline'
    | 'spec_baseline'
    | 'class_talent'
    | 'spec_talent'
    | 'hero_talent';
  hero_tree: string | null;
  node_id: number;
  spell_id?: number;
}

export interface TalentIndexFile {
  synced_at: string;
  patch: string;
  by_id: Record<string, TalentIndexEntry>;
}

/**
 * Loaded talent index, with reverse lookups built once. WCL's
 * CombatantInfo `talentTree[].nodeID` matches Blizzard's talent
 * `node_id`, NOT the talent entry id (which is the `id` keying
 * `by_id`). We index by `node_id` so the lookup matches what WCL
 * hands us.
 */
export interface TalentIndex {
  file: TalentIndexFile;
  byNodeId: Map<number, TalentIndexEntry>;
}

const INDEX_PATH = 'data/blizz/talent-index.json';

let cached: TalentIndex | null = null;

export async function loadTalentIndex(
  pathOverride?: string,
): Promise<TalentIndex> {
  if (cached && !pathOverride) return cached;
  const target = pathOverride ?? INDEX_PATH;
  const raw = await readFile(target, 'utf-8');
  const file = JSON.parse(raw) as TalentIndexFile;
  const byNodeId = new Map<number, TalentIndexEntry>();
  for (const entry of Object.values(file.by_id)) {
    if (typeof entry.node_id === 'number') {
      byNodeId.set(entry.node_id, entry);
    }
  }
  const idx: TalentIndex = { file, byNodeId };
  if (!pathOverride) cached = idx;
  return idx;
}

export function buildTalentIndex(file: TalentIndexFile): TalentIndex {
  const byNodeId = new Map<number, TalentIndexEntry>();
  for (const entry of Object.values(file.by_id)) {
    if (typeof entry.node_id === 'number') {
      byNodeId.set(entry.node_id, entry);
    }
  }
  return { file, byNodeId };
}

export function _resetTalentIndexForTests(): void {
  cached = null;
}

/**
 * Look up by node ID — WCL's CombatantInfo `talentTree[].nodeID` is
 * the canonical key. Returns undefined if the node isn't in the
 * index.
 */
export function lookupTalentByNode(
  index: TalentIndex,
  nodeId: number,
): TalentIndexEntry | undefined {
  return index.byNodeId.get(nodeId);
}
