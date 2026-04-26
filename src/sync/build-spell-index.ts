import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { SpellRef } from './walk-catalog.js';
import { normalizeSpellName } from './normalize.js';

const INDEX_PATH = 'data/blizz/spell-index.json';

export interface SpellIndexMeta {
  syncedAt: string;
  patch: string;
}

export async function writeSpellIndex(
  catalog: Map<number, SpellRef>,
  meta: SpellIndexMeta,
): Promise<void> {
  const byClass: Record<string, Record<string, number>> = {};
  for (const ref of catalog.values()) {
    const cls = ref.className;
    let bucket = byClass[cls];
    if (!bucket) {
      bucket = {};
      byClass[cls] = bucket;
    }
    const key = normalizeSpellName(ref.spellName);
    const existing = bucket[key];
    if (existing !== undefined && existing !== ref.spellId) {
      console.warn(
        `[spell-index] collision in ${cls}: "${key}" maps to both ${existing} and ${ref.spellId}; keeping first`,
      );
      continue;
    }
    bucket[key] = ref.spellId;
  }

  for (const cls of Object.keys(byClass)) {
    const bucket = byClass[cls];
    if (!bucket) continue;
    byClass[cls] = Object.fromEntries(
      Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  const sortedClasses = Object.keys(byClass).sort();
  const out = {
    synced_at: meta.syncedAt,
    patch: meta.patch,
    by_class: Object.fromEntries(sortedClasses.map((c) => [c, byClass[c]])),
  };

  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
}
