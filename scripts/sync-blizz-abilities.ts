import {
  registerSpell,
  walkCatalog,
  type SourceType,
  type SpellRef,
} from '../src/sync/walk-catalog.js';
import { writeAbilityFile } from '../src/sync/write-abilities.js';
import { writeSpellIndex } from '../src/sync/build-spell-index.js';
import { loadOverrides } from '../src/sync/load-overrides.js';
import { fetchStatic } from '../src/apis/blizzard/index.js';
import type { SpellResponse } from '../src/apis/blizzard/index.js';

interface Args {
  classFilter?: string;
  specFilter?: string;
  dryRun: boolean;
  overridesOnly: boolean;
  patch: string;
}

const DEFAULT_PATCH = '12.0.5';
const POOL_SIZE = 8;
const OVERRIDES_PATH = 'kb/wow/_overrides.json';

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    dryRun: false,
    overridesOnly: false,
    patch: process.env.WOW_PATCH ?? DEFAULT_PATCH,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--class') {
      const next = argv[++i];
      if (!next) {
        console.error('--class requires a value');
        process.exit(1);
      }
      args.classFilter = next;
    } else if (arg === '--spec') {
      const next = argv[++i];
      if (!next) {
        console.error('--spec requires a value');
        process.exit(1);
      }
      args.specFilter = next;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--overrides-only') {
      args.overridesOnly = true;
    } else if (arg === '--patch') {
      const next = argv[++i];
      if (!next) {
        console.error('--patch requires a value');
        process.exit(1);
      }
      args.patch = next;
    } else {
      console.error(`Unknown arg: ${arg}`);
      process.exit(1);
    }
  }
  if (args.specFilter && !args.classFilter) {
    console.error(
      '--spec requires --class (some spec names are shared across classes; ' +
        'e.g. "frost" is both Mage and Death Knight).',
    );
    process.exit(1);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const syncedAt = new Date().toISOString();
  const filtered = Boolean(
    args.classFilter || args.specFilter || args.overridesOnly,
  );

  const filterDesc = [
    args.classFilter ? `class=${args.classFilter}` : null,
    args.specFilter ? `spec=${args.specFilter}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  let catalog: Map<number, SpellRef>;
  let talentCount = 0;
  if (args.overridesOnly) {
    console.log(
      `--overrides-only: skipping talent walk${filterDesc ? ` (${filterDesc})` : ''}.`,
    );
    catalog = new Map();
  } else {
    console.log(
      `Walking Blizzard catalog${filterDesc ? ` (${filterDesc})` : ''}...`,
    );
    catalog = await walkCatalog({
      ...(args.classFilter !== undefined
        ? { classFilter: args.classFilter }
        : {}),
      ...(args.specFilter !== undefined ? { specFilter: args.specFilter } : {}),
    });
    talentCount = catalog.size;
    console.log(`Talent walk: ${talentCount} spells discovered.`);
  }

  // Pass 2: overrides — fetch each spell + media, register in catalog
  const overrides = await loadOverrides(OVERRIDES_PATH, {
    ...(args.classFilter !== undefined
      ? { classFilter: args.classFilter }
      : {}),
    ...(args.specFilter !== undefined ? { specFilter: args.specFilter } : {}),
  });
  const overrideAddedNames: string[] = [];
  let overrideFailed = 0;
  for (const entry of overrides) {
    try {
      const spell = await fetchStatic<SpellResponse>(
        `/data/wow/spell/${entry.spell_id}`,
      );
      const wasNew = !catalog.has(entry.spell_id);
      registerSpell(catalog, {
        spellId: spell.id,
        spellName: spell.name,
        className: entry.class.toLowerCase(),
        specs: entry.specs.map((s) => s.toLowerCase()),
        sourceType: entry.source_type as SourceType,
        ...(spell.description !== undefined
          ? { description: spell.description }
          : {}),
      });
      if (wasNew) overrideAddedNames.push(spell.name);
    } catch (err) {
      overrideFailed++;
      console.warn(
        `[overrides] failed to fetch spell ${entry.spell_id} (${entry.class}): ${(err as Error).message}`,
      );
    }
  }

  // Per-pass summary
  console.log('\nDiscovery summary:');
  console.log(`  talent walk:        ${talentCount} discovered`);
  const overridePreview = overrideAddedNames.slice(0, 3).join(', ');
  const overrideSuffix =
    overrideAddedNames.length > 0
      ? ` (${overridePreview}${overrideAddedNames.length > 3 ? ', ...' : ''})`
      : '';
  console.log(
    `  overrides:          +${overrideAddedNames.length}${overrideSuffix}${overrideFailed > 0 ? ` (${overrideFailed} failed)` : ''}`,
  );
  console.log(`  total:              ${catalog.size} ability files`);

  if (args.dryRun) {
    const sample = [...catalog.values()].slice(0, 5);
    console.log('\nSample of first 5 catalog entries:');
    for (const ref of sample) {
      console.log(
        `  - ${ref.spellId} ${ref.spellName} (${ref.sourceType}, specs=[${ref.specs.join(', ')}])`,
      );
    }
  }

  // Write phase
  const warnings: string[] = [];
  let written = 0;
  let failed = 0;

  const entries: Array<[number, SpellRef]> = [...catalog.entries()];
  const workers = Array.from({ length: POOL_SIZE }, async () => {
    while (entries.length > 0) {
      const next = entries.shift();
      if (!next) return;
      const [, ref] = next;
      try {
        const result = await writeAbilityFile({
          ref,
          patch: args.patch,
          syncedAt,
          dryRun: args.dryRun,
        });
        written++;
        if (result.warning) warnings.push(result.warning);
      } catch (err) {
        failed++;
        warnings.push(
          `[${ref.spellId}] ${ref.spellName}: ${(err as Error).message}`,
        );
      }
    }
  });
  await Promise.all(workers);

  if (!args.dryRun && !filtered) {
    await writeSpellIndex(catalog, { syncedAt, patch: args.patch });
  } else if (!args.dryRun && filtered) {
    console.log(
      '\n[skipped index write — filtered run; rerun without filters to refresh spell-index.json]',
    );
  }

  console.log(
    `\nWrote ${written} ability files (${failed} failed, ${warnings.length} warnings).`,
  );
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.slice(0, 50).forEach((w) => console.log(`  - ${w}`));
    if (warnings.length > 50) {
      console.log(`  ... ${warnings.length - 50} more`);
    }
  }
  if (args.dryRun) {
    console.log('\n(dry-run: no files written)');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('sync-blizz-abilities failed:', err);
  process.exit(1);
});
