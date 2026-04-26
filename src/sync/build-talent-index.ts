import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { TalentRef } from './walk-catalog.js';

const INDEX_PATH = 'data/blizz/talent-index.json';

/**
 * Talent ID → metadata lookup. Phase 5c reads this to resolve WCL
 * CombatantInfo's talent IDs into human-readable names + tree
 * positions for build-snapshot rendering.
 *
 * Output shape (id-keyed map, flat — talent IDs are globally unique
 * across classes so no class indirection needed at the top level):
 *
 *   {
 *     "synced_at": "...",
 *     "patch": "...",
 *     "by_id": {
 *       "<talent_id>": {
 *         "name": "Lay on Hands",
 *         "class": "paladin",
 *         "specs": ["retribution", "protection", "holy"],
 *         "tree": "class_talent",
 *         "hero_tree": null,
 *         "node_id": 81597,
 *         "spell_id": 633
 *       },
 *       ...
 *     }
 *   }
 *
 * Sorted numerically by talent ID for diff stability.
 */
export async function writeTalentIndex(
  talents: Map<number, TalentRef>,
  meta: { syncedAt: string; patch: string },
): Promise<void> {
  const sortedIds = [...talents.keys()].sort((a, b) => a - b);
  const byId: Record<string, unknown> = {};
  for (const id of sortedIds) {
    const ref = talents.get(id);
    if (!ref) continue;
    byId[String(id)] = {
      name: ref.talentName,
      class: ref.className,
      specs: ref.specs,
      tree: ref.tree,
      hero_tree: ref.heroTree ?? null,
      node_id: ref.nodeId,
      ...(ref.spellId !== undefined ? { spell_id: ref.spellId } : {}),
    };
  }

  const out = {
    synced_at: meta.syncedAt,
    patch: meta.patch,
    by_id: byId,
  };

  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
}
