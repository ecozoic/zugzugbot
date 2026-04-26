import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchStatic } from '../apis/blizzard/index.js';
import type { SpellMediaResponse } from '../apis/blizzard/index.js';
import type { SpellRef } from './walk-catalog.js';
import { normalizeSpellName } from './normalize.js';

const ABILITIES_DIR = 'kb/wow/_abilities';

export interface WriteAbilityOptions {
  ref: SpellRef;
  patch: string;
  syncedAt: string;
  dryRun: boolean;
}

export interface WriteAbilityResult {
  ok: boolean;
  filename: string;
  warning?: string;
}

export async function writeAbilityFile(
  opts: WriteAbilityOptions,
): Promise<WriteAbilityResult> {
  const { ref, patch, syncedAt, dryRun } = opts;

  let iconUrl: string | undefined;
  try {
    const media = await fetchStatic<SpellMediaResponse>(
      `/data/wow/media/spell/${ref.spellId}`,
    );
    iconUrl = media.assets.find((a) => a.key === 'icon')?.value;
  } catch {
    // 404 on media — many spells lack icons. Continue without.
  }

  const normalized = normalizeSpellName(ref.spellName);
  const filename = `${ref.spellId}-${normalized}.md`;
  const fullPath = path.join(ABILITIES_DIR, filename);

  const description =
    ref.description?.trim() || '(no description returned by API)';
  const hasPlaceholders = /\$[a-z0-9]/i.test(description);

  const frontmatter = renderFrontmatter([
    ['game', 'wow'],
    ['kind', 'ability'],
    ['spell_id', ref.spellId],
    ['spell_name', ref.spellName],
    ['spell_name_normalized', normalized],
    ['class', ref.className],
    ['specs', ref.specs],
    ['source_type', ref.sourceType],
    ['hero_tree', ref.heroTree ?? null],
    ['cast_time', ref.castTime ?? null],
    ['range', ref.range ?? null],
    ['cooldown', ref.cooldown ?? null],
    ['power_cost', ref.powerCost ?? null],
    ['icon_url', iconUrl ?? null],
    ['synced_from', 'blizzard-game-data-api'],
    ['synced_at', syncedAt],
    ['patch', patch],
  ]);

  const className = capitalize(ref.className);
  const body = `# ${ref.spellName} (${className})\n\n${description}\n`;

  if (!dryRun) {
    await mkdir(ABILITIES_DIR, { recursive: true });
    await writeFile(fullPath, `${frontmatter}\n\n${body}`, 'utf-8');
  }

  const result: WriteAbilityResult = { ok: true, filename };
  if (hasPlaceholders) {
    result.warning = `[${ref.spellId}] ${ref.spellName}: description contains unresolved placeholder tokens`;
  }
  return result;
}

type FrontmatterValue = string | number | boolean | null | string[];

function renderFrontmatter(entries: Array<[string, FrontmatterValue]>): string {
  const lines: string[] = ['---'];
  for (const [k, v] of entries) {
    if (v === null) {
      lines.push(`${k}: ~`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
    } else if (typeof v === 'string') {
      const needsQuote = /[:#@!&*]/.test(v) || /^\d/.test(v);
      lines.push(`${k}: ${needsQuote ? JSON.stringify(v) : v}`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
