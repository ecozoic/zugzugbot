import {
  discoverZones,
  writeZonesCache,
  type DiscoveredZones,
} from '../src/sync/wcl/zones.js';
import {
  fetchZoneEncounters,
  syncMplusTierList,
  syncRaidTierList,
} from '../src/sync/wcl/tier-list.js';
import { syncPerSpec } from '../src/sync/wcl/per-spec.js';
import { filterSpecs, SPECS } from '../src/sync/wcl/specs.js';
import { loadTalentIndex } from '../src/sync/wcl/talent-index.js';

type ContentScope = 'raid' | 'mplus';

interface Args {
  classFilter?: string;
  specFilter?: string;
  tierListOnly: boolean;
  perSpecOnly: boolean;
  contentScope?: ContentScope;
  dryRun: boolean;
  patch: string;
}

const DEFAULT_PATCH = '12.0.5';

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    tierListOnly: false,
    perSpecOnly: false,
    dryRun: false,
    patch: process.env.WOW_PATCH ?? DEFAULT_PATCH,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--class') {
      const next = argv[++i];
      if (!next) {
        console.error('--class requires a value');
        process.exit(1);
      }
      args.classFilter = next;
    } else if (a === '--spec') {
      const next = argv[++i];
      if (!next) {
        console.error('--spec requires a value');
        process.exit(1);
      }
      args.specFilter = next;
    } else if (a === '--tier-list-only') {
      args.tierListOnly = true;
    } else if (a === '--per-spec-only') {
      args.perSpecOnly = true;
    } else if (a === '--content') {
      const next = argv[++i];
      if (next !== 'raid' && next !== 'mplus') {
        console.error('--content requires "raid" or "mplus"');
        process.exit(1);
      }
      args.contentScope = next;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--patch') {
      const next = argv[++i];
      if (!next) {
        console.error('--patch requires a value');
        process.exit(1);
      }
      args.patch = next;
    } else {
      console.error(`Unknown arg: ${a}`);
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
  if (args.tierListOnly && args.perSpecOnly) {
    console.error(
      '--tier-list-only and --per-spec-only are mutually exclusive',
    );
    process.exit(1);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const syncedAt = new Date().toISOString();
  const filtered = Boolean(args.classFilter || args.specFilter);

  const filterDesc = [
    args.classFilter ? `class=${args.classFilter}` : null,
    args.specFilter ? `spec=${args.specFilter}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  if (filterDesc) console.log(`Running with filter: ${filterDesc}`);
  if (args.dryRun) console.log('DRY RUN — no files written.');

  const filterArg: { classSlug?: string; specSlug?: string } = {};
  if (args.classFilter !== undefined) filterArg.classSlug = args.classFilter;
  if (args.specFilter !== undefined) filterArg.specSlug = args.specFilter;
  const specs = filterSpecs(filterArg);
  if (specs.length === 0) {
    console.error(
      `No specs matched filter (class=${args.classFilter ?? ''}, spec=${args.specFilter ?? ''}).`,
    );
    process.exit(1);
  }

  console.log('Discovering current raid + m+ zones...');
  const zones: DiscoveredZones = await discoverZones();
  console.log(
    `Zones: raid=${zones.raid.id} (${zones.raid.name}), mplus=${zones.mplus.id} (${zones.mplus.name})`,
  );
  if (!args.dryRun && !filtered) {
    await writeZonesCache(zones, syncedAt);
    console.log(`Wrote data/blizz/wcl-zones.json.`);
  } else if (!args.dryRun && filtered) {
    console.log(
      '[skipped zones write — filtered run; rerun without filters to refresh wcl-zones.json]',
    );
  }

  console.log('Fetching encounter list for raid + m+ zones...');
  const raidEncounters = await fetchZoneEncounters(zones.raid.id);
  const mplusEncounters = await fetchZoneEncounters(zones.mplus.id);
  console.log(
    `Raid: ${raidEncounters.length} encounters; M+: ${mplusEncounters.length} dungeons.`,
  );

  const warnings: string[] = [];

  if (!args.perSpecOnly) {
    if (filtered && !args.tierListOnly) {
      console.log(
        '[skipped tier-list write — filtered run; rerun without filters or with --tier-list-only to refresh tier-list files]',
      );
    } else {
      if (args.contentScope !== 'mplus') {
        const raidResult = await syncRaidTierList({
          zoneId: zones.raid.id,
          zoneName: zones.raid.name,
          encounters: raidEncounters,
          patch: args.patch,
          syncedAt,
          specs: SPECS,
          dryRun: args.dryRun,
        });
        console.log(
          `${args.dryRun ? '[dry-run] ' : ''}Wrote ${raidResult.filename} (${raidResult.queriesIssued} queries).`,
        );
      }
      if (args.contentScope !== 'raid') {
        const mplusResult = await syncMplusTierList({
          zoneId: zones.mplus.id,
          zoneName: zones.mplus.name,
          dungeons: mplusEncounters,
          patch: args.patch,
          syncedAt,
          specs: SPECS,
          dryRun: args.dryRun,
        });
        console.log(
          `${args.dryRun ? '[dry-run] ' : ''}Wrote ${mplusResult.filename} (${mplusResult.queriesIssued} queries).`,
        );
      }
    }
  }

  if (args.tierListOnly) {
    if (warnings.length > 0) printWarnings(warnings);
    process.exit(0);
  }

  const talentIndex = await loadTalentIndex();
  console.log(
    `Loaded talent index (${Object.keys(talentIndex.file.by_id).length} entries; ${talentIndex.byNodeId.size} nodes indexed).`,
  );

  console.log(
    `Syncing per-spec build snapshots for ${specs.length} spec(s)...`,
  );
  let written = 0;
  let failed = 0;
  const contentTypes: readonly ContentScope[] = args.contentScope
    ? [args.contentScope]
    : ['raid', 'mplus'];
  for (const spec of specs) {
    for (const contentType of contentTypes) {
      try {
        const zoneId = contentType === 'raid' ? zones.raid.id : zones.mplus.id;
        const zoneName =
          contentType === 'raid' ? zones.raid.name : zones.mplus.name;
        const encs = contentType === 'raid' ? raidEncounters : mplusEncounters;
        const result = await syncPerSpec({
          spec,
          contentType,
          zoneId,
          zoneName,
          encounters: encs.map((e) => ({
            encounterId: e.id,
            encounterName: e.name,
          })),
          patch: args.patch,
          syncedAt,
          talentIndex,
          dryRun: args.dryRun,
        });
        written++;
        const status = result.warning ?? `${result.samplesFetched} samples`;
        console.log(
          `  ${args.dryRun ? '[dry-run] ' : ''}${result.filename} (${status})`,
        );
        if (result.warning) warnings.push(result.warning);
      } catch (err) {
        failed++;
        warnings.push(
          `[${spec.classSlug}-${spec.specSlug}-${contentType}] ${(err as Error).message}`,
        );
      }
    }
  }

  console.log(
    `\nWrote ${written} per-spec files (${failed} failed, ${warnings.length} warnings).`,
  );
  if (warnings.length > 0) printWarnings(warnings);
  if (args.dryRun) console.log('\n(dry-run: no files written)');
  process.exit(failed > 0 ? 1 : 0);
}

function printWarnings(warnings: string[]): void {
  console.log('\nWarnings:');
  warnings.slice(0, 50).forEach((w) => console.log(`  - ${w}`));
  if (warnings.length > 50) console.log(`  ... ${warnings.length - 50} more`);
}

main().catch((err) => {
  console.error('sync-wcl-meta failed:', err);
  process.exit(1);
});
