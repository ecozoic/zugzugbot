import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/**
 * Manual override entries for the abilities sync — captures spells
 * we know matter (Crusader Strike, Avenging Wrath, etc.) but that
 * the talent walk doesn't surface (because they're auto-granted
 * baselines, procs, summons, etc.).
 *
 * File shape: an object keyed by class name, each value an array of
 * entries. Class lives in the key, not on every entry, to keep the
 * file scannable per-class.
 *
 * Each entry must specify a numeric `spell_id` — name-based resolution
 * (which would route through the indeterministic spell-search endpoint)
 * is intentionally not supported. Author finds the ID once on Wowhead
 * and pins it. Deterministic by design.
 *
 * Optional fields:
 *   `specs`: defaults to [] (class-wide). When set, restricts the
 *            registered SpellRef to those specs.
 *   `source_type`: defaults to 'class_baseline'.
 */
export type OverrideSourceType =
  | 'class_baseline'
  | 'spec_baseline'
  | 'class_talent'
  | 'spec_talent'
  | 'hero_talent';

const OVERRIDE_SOURCE_TYPES: readonly OverrideSourceType[] = [
  'class_baseline',
  'spec_baseline',
  'class_talent',
  'spec_talent',
  'hero_talent',
];

const OverrideEntryInputSchema = z.object({
  spell_id: z.number().int().positive(),
  specs: z.array(z.string().min(1)).default([]),
  source_type: z
    .enum(OVERRIDE_SOURCE_TYPES as unknown as [string, ...string[]])
    .default('class_baseline'),
});

const OverridesFileSchema = z.record(z.array(OverrideEntryInputSchema));

type OverrideEntryInput = z.infer<typeof OverrideEntryInputSchema>;

/** Output shape after flattening — class is injected from the file's key. */
export interface OverrideEntry extends OverrideEntryInput {
  class: string;
}

export interface LoadOverridesOptions {
  classFilter?: string;
  specFilter?: string;
}

/**
 * Read and validate `kb/wow/_overrides.json`. Throws with a clear
 * error on JSON parse failure or schema mismatch.
 *
 * Empty file (or just `{}`) returns []. Missing file throws — that's
 * a deployment-config problem, not a runtime fallback.
 */
export async function loadOverrides(
  path: string,
  opts: LoadOverridesOptions = {},
): Promise<OverrideEntry[]> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `overrides file not found at ${path} — create it with {} (and optional class entries) before running sync`,
      );
    }
    throw err;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `overrides file ${path} is not valid JSON: ${(err as Error).message}`,
    );
  }
  const result = OverridesFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `overrides file ${path} failed schema validation: ${result.error.message}`,
    );
  }
  const flat: OverrideEntry[] = [];
  for (const [className, entries] of Object.entries(result.data)) {
    for (const entry of entries) {
      flat.push({ ...entry, class: className });
    }
  }
  return applyFilter(flat, opts);
}

function applyFilter(
  entries: OverrideEntry[],
  opts: LoadOverridesOptions,
): OverrideEntry[] {
  const classFilter = opts.classFilter?.toLowerCase();
  const specFilter = opts.specFilter?.toLowerCase();
  return entries.filter((e) => {
    if (classFilter && e.class.toLowerCase() !== classFilter) return false;
    if (specFilter) {
      // class-wide override (specs=[]) matches any --spec filter
      if (e.specs.length === 0) return true;
      return e.specs.some((s) => s.toLowerCase() === specFilter);
    }
    return true;
  });
}
