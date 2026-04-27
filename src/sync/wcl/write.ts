/**
 * Shared frontmatter + markdown helpers for WCL meta files.
 *
 * Mirrors the rendering style of `src/sync/write-abilities.ts` so the
 * chunker (which is YAML-tolerant rather than YAML-strict) sees the
 * same shapes everywhere.
 */

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[];

export function renderFrontmatter(
  entries: Array<[string, FrontmatterValue]>,
): string {
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

export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Title-case a slug like "death-knight" → "Death Knight" or
 * "beast-mastery" → "Beast Mastery".
 */
export function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => capitalize(part))
    .join(' ');
}

export function wowheadItemLink(itemId: number): string {
  return `[Item ${itemId}](https://wowhead.com/item=${itemId})`;
}

export function wowheadSpellLink(spellId: number): string {
  return `[Spell ${spellId}](https://wowhead.com/spell=${spellId})`;
}

/**
 * Format a percentage with one decimal place, e.g. 0.8 → "80.0%".
 * Used in tier-list and per-spec output.
 */
export function pct(n: number, total: number): string {
  if (total === 0) return '0.0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}
