# Phase 5a — Blizzard ability sync (write-side only)

**Status:** Draft
**Parent plan:** `v2-rebuild.md` (Phase 5 — KB expansion + retrieval enrichment)
**Depends on:** Phase 4 (RAG wired into `/zz`)
**Goal:** stand up an offline pipeline that fetches every reachable
spell from the Blizzard Game Data API and writes:

- `kb/wow/_abilities/<spell-id>-<normalized-name>.md` — one file per
  unique spell ID, frontmatter + description body
- `data/blizz/spell-index.json` — `(class, normalized_name) →
  spell_id` lookup, used at /zz time by the future stage-2 retrieval

**Out of scope (deferred to follow-up plans):**

- Chunker tweak to bypass MIN_WORDS for `kind: ability` chunks
- Two-stage retrieval at /zz time (parsing bold names, deterministic
  lookup, ability_reference prompt block)
- Talent tree files / `kind: talent_summary`
- WCL meta sync
- Discord embed thumbnails using `icon_url`
- Override file for proc/aura spells outside the catalog walk

This phase produces files on disk and a JSON index. Phase 5b wires
them into the chunker + runtime; Phase 5c does talents/trees; Phase
5d does WCL.

---

## 1. Pre-flight

**Blizzard API credentials.** Free, ~5-minute signup.

1. Go to https://develop.battle.net/access/clients
2. Sign in with a Battle.net account, create a client
3. Note the Client ID and Client Secret — these are env vars
   `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET`

Application clients use OAuth2 client_credentials. Tokens are good
for 24h and the auth endpoint is rate-limited generously. Game Data
API allows 36k requests/hour per client — full sync is ~2-3k
requests so we're well under.

No region setup beyond hard-coding `us` for now. Friends server is
US-based; if anyone wants EU data later, we add a region flag.

## 2. Branch

```
git checkout master && git pull
git checkout -b feat/v2-blizz-abilities-sync
```

## 3. Tooling

**No new runtime deps.** Node 22 ships with `fetch` and
`Headers`, which is all we need for an OAuth2 + REST client.

If we later need a stricter HTTP client (retries, rate-limit-aware
backoff, circuit breaking) we can add `undici` or `ky`. Not yet.

Dev deps already cover what we need (vitest for tests).

## 4. Project structure (Phase 5a additions)

```
zugzugbot/
  src/
    apis/                                 # NEW directory (will host wcl.ts later)
      blizzard/                           # NEW
        auth.ts                           # NEW — OAuth2 token fetch + cache
        client.ts                         # NEW — typed fetch wrapper for endpoints
        types.ts                          # NEW — TS types for response shapes
        index.ts                          # NEW — public exports
        __tests__/
          auth.test.ts                    # NEW
          client.test.ts                  # NEW
    sync/                                 # NEW directory
      normalize.ts                        # NEW — spell name → normalized key
      walk-catalog.ts                     # NEW — enumerate (class, spec, spells)
      write-abilities.ts                  # NEW — fetch spell + media, render MD
      build-spell-index.ts                # NEW — write data/blizz/spell-index.json
      __tests__/
        normalize.test.ts                 # NEW
        write-abilities.test.ts           # NEW (uses fixture spell data)
    config/
      env.ts                              # MODIFIED — add BLIZZARD_CLIENT_ID/SECRET
  scripts/
    sync-blizz-abilities.ts               # NEW — CLI entry point
  kb/
    wow/
      _abilities/                         # NEW directory (committed)
        .gitkeep                          # NEW (committed; populated by sync)
  data/
    blizz/                                # NEW directory (committed)
      .gitkeep                            # NEW (committed)
      spell-index.json                    # generated; committed
  package.json                            # MODIFIED — add sync:blizz:abilities script
  .env.example                            # MODIFIED — add BLIZZARD_* keys
```

All committed: the synced files are deterministic build artifacts
that the runtime depends on. Same model as `data/vectra/` from
Phase 3.

## 5. Ability file format spec

One file per unique spell ID at `kb/wow/_abilities/<id>-<name>.md`.

**Filename:** `<spell-id>-<spell-name-normalized>.md`. ID prefix
guarantees uniqueness across class-shared names; normalized name
keeps the directory greppable. Example: `255937-wake-of-ashes.md`.

**Frontmatter:**

```yaml
---
game: wow
kind: ability
spell_id: 255937
spell_name: Wake of Ashes
spell_name_normalized: wake-of-ashes
class: paladin
specs: [retribution]
source_type: spec_baseline
hero_tree: ~
icon_url: https://render.worldofwarcraft.com/us/icons/56/spell_paladin_executionsentence.jpg
synced_from: blizzard-game-data-api
synced_at: '2026-04-26T18:00:00Z'
patch: '12.0.5'
---
```

Field meanings:

| field | purpose |
|---|---|
| `game` | always `wow`; required by chunker |
| `kind` | `ability`; discriminator for two-stage retrieval (Phase 5b) |
| `spell_id` | primary key; sync idempotency, runtime deterministic lookup |
| `spell_name` | author-friendly display |
| `spell_name_normalized` | runtime lookup key (lowercase, hyphenated) |
| `class` | always present; disambiguates shared names |
| `specs` | array of specs that can use this spell. `[]` ⇒ class-wide |
| `source_type` | `spec_baseline` \| `class_baseline` \| `class_talent` \| `spec_talent` \| `hero_talent` |
| `hero_tree` | filled when `source_type = hero_talent`, e.g. `herald-of-the-sun` |
| `icon_url` | from `/data/wow/media/spell/{id}`; consumed by future Discord embed thumbnails |
| `synced_from` | always `blizzard-game-data-api` for now; differentiates future sources |
| `synced_at` | ISO 8601 timestamp; useful for "is this stale" checks |
| `patch` | sourced from `data/state.md` or env var; single most important field |

**Body:**

```markdown
# Wake of Ashes (Paladin)

Strikes targets in front of you with a wave of ashen flame, dealing
X Holy damage to all targets within 8 yards and generating 5 Holy
Power. Has a 45 second cooldown.
```

H1 = `<Name> (<Class>)`. Body = description text from
`/data/wow/spell/{id}`. No further structure — the description
is whatever Blizzard returns.

**Idempotency:** the writer rewrites every file every run. There is
no merge-with-manual-edits behavior. The sync IS the source of
truth; if the author wants to add notes, they go in a separate
hand-authored guide file, not in `_abilities/`.

## 6. Algorithm — catalog walk

Goal: enumerate every spell ID we care about, and for each capture
`(spell_id, name, class, specs, source_type, hero_tree?)`.

**Discovery sources** (Blizzard endpoints):

| spells discovered | endpoint |
|---|---|
| spec baseline | `/data/wow/playable-specialization/{specId}` (the `spell_tooltip` refs) |
| class talents | `/data/wow/talent-tree/{treeId}/playable-specialization/{specId}` (`class_talent_nodes`) |
| spec talents | same endpoint (`spec_talent_nodes`) |
| hero talents | same endpoint (`hero_talent_trees[].hero_talent_nodes`) |

**Walk order:**

```
1. GET /data/wow/playable-class/index
   → list of (classId, className) for all 13 classes

2. For each class:
   GET /data/wow/playable-class/{classId}
   → array of specialization refs

   For each spec:
     GET /data/wow/playable-specialization/{specId}
     → spec metadata, talent_tree ref, hero_talent_trees refs,
       baseline spell refs (exact field name TBD during impl —
       check whether they're under spec_talent_tree.restriction_lines
       or a separate field)

     GET /data/wow/talent-tree/{treeId}/playable-specialization/{specId}
     → class_talent_nodes, spec_talent_nodes, hero_talent_trees
       (the per-spec talent_tree endpoint resolves which class
       talents this spec can take)

     For each spell ref discovered, register in the catalog:
       catalog.set(spellId, {
         spellName,
         className,
         specs: [...existingSpecs, currentSpec],     // accumulate
         sourceType: 'spec_baseline' | 'spec_talent' | ...,
         heroTree?
       })
       (if a spell shows up in multiple specs of same class,
        merge the specs[] array; keep the first-seen sourceType
        with priority class_baseline > spec_baseline > class_talent
        > spec_talent > hero_talent)
```

**Verification during implementation:**

- The exact JSON field names on each endpoint need to be confirmed
  against live responses. The implementation agent fetches a
  sample response per endpoint type and writes TS types from
  the actual shape. Don't trust this plan's field names blindly.
- Some baseline spells may live on `/data/wow/playable-class/{id}`
  rather than per-spec — keep an eye out and add that walk if
  needed.
- Hero talent trees: TWW added these as a separate concept.
  Confirm whether they're under `hero_talent_trees` on the
  spec endpoint, or whether they need a dedicated endpoint
  walk.

**Output:** an in-memory `Map<spellId, SpellRef>` ready for the
fetch + write phase.

## 7. Algorithm — per-spell fetch + write

For each (spellId, spellRef) in the catalog:

```
1. GET /data/wow/spell/{spellId}
   → { id, name, description }

2. GET /data/wow/media/spell/{spellId}
   → { assets: [{ key: 'icon', value: '<url>' }] }
   (catch 404s gracefully — some spells lack media assets;
    write the file with icon_url omitted from frontmatter)

3. Compose frontmatter from spellRef + spell + media + global
   patch/synced_at

4. Write kb/wow/_abilities/<id>-<normalize(name)>.md

5. Add entry to spellIndex[className][normalize(name)] = spellId
```

**Concurrency:** parallelize with a fixed worker pool of
8-12 to stay well under the 100 req/sec Blizzard rate limit.
Keep it simple — no exponential backoff initially. If we hit
429s, add it.

**Rate limit handling:** on 429, sleep 1s and retry once. On
second 429, fail loud — sync run aborts so the author knows
to wait and rerun.

**Description placeholder tokens:** if the description text
contains `$s1`, `$a1`, `${...}` etc, log a warning with the
spell ID + name. Write the file anyway — better degraded than
missing.

**Description empty:** write the file with body `(no description
returned by API)`. Don't error; some spells genuinely have empty
descriptions.

## 8. Spell index file

`data/blizz/spell-index.json`:

```json
{
  "synced_at": "2026-04-26T18:00:00Z",
  "patch": "12.0.5",
  "by_class": {
    "paladin": {
      "wake-of-ashes": 255937,
      "judgment": 20271,
      "crusader-strike": 35395,
      "..." : ...
    },
    "shaman": {
      "judgment": 51514,
      "..." : ...
    }
  }
}
```

Compact, sorted alphabetically per class for diff readability.
~30-50KB total at full coverage. Loaded once at bot startup
in the future runtime stage; this phase only writes it.

## 9. CLI command

`scripts/sync-blizz-abilities.ts`:

```
npm run sync:blizz:abilities                                          # full sync
npm run sync:blizz:abilities -- --class paladin                       # one class
npm run sync:blizz:abilities -- --class paladin --spec retribution    # one spec
npm run sync:blizz:abilities -- --dry-run                             # fetch but don't write
npm run sync:blizz:abilities -- --class paladin --spec retribution --dry-run
```

Flags:

- `--class <name>`: scope to one class. Useful for fast iteration.
  Writes only that class's ability files.
- `--spec <name>`: scope to one spec within a class. **Requires
  `--class`** — using `--spec` alone is rejected with a clear
  error. This avoids ambiguity (some spec names are shared:
  `frost` is both Mage and Death Knight; `holy` is Paladin and
  Priest) and forces the author to be explicit.
- `--dry-run`: log everything that would be fetched/written but
  don't actually write files. Prints summary + first 5 sample
  spell entries. Combinable with the filters above for cheap
  iteration.
- (future) `--region <us|eu>`, `--patch <override>`

**Index-write semantics under filters:** when any filter is active
(`--class` or `--spec`), the run is by definition partial. We do
NOT overwrite the full `data/blizz/spell-index.json` from a partial
run — that would silently drop entries for un-walked classes. The
script writes ability MD files normally but skips the index write
when filters are present, and prints a reminder: `[skipped index
write — filtered run; rerun without filters to refresh
spell-index.json]`. Full unfiltered run is the only way to update
the index.

Exit code 0 on full success, 1 on any spell that fails to fetch
or write after retries.

## 10. File contents (skeletons)

### 10.1 `src/config/env.ts`

Add to the zod schema:

```ts
BLIZZARD_CLIENT_ID: z.string().min(1).optional(),
BLIZZARD_CLIENT_SECRET: z.string().min(1).optional(),
```

Optional at the global level — only the sync script needs them.
The runtime bot doesn't. If a build environment doesn't have
them, the sync script throws its own clearer error at run time
when it tries to read them.

(Compare to how Phase 3 handled `VOYAGE_API_KEY` as required;
that was load-bearing for build-kb. These are different — sync
is manual not automatic, so we don't want bot startup to fail
when these are absent.)

### 10.2 `src/apis/blizzard/auth.ts`

```ts
import { env } from '../../config/env.js';

interface AccessToken {
  token: string;
  expiresAt: number; // ms epoch
}

let cached: AccessToken | null = null;

export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }
  const clientId = env.BLIZZARD_CLIENT_ID;
  const clientSecret = env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set to sync abilities',
    );
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`Blizzard OAuth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
}
```

### 10.3 `src/apis/blizzard/client.ts`

Thin wrapper that:

- Adds `Authorization: Bearer <token>` and `?namespace=static-us&locale=en_US`
- Retries once on 429 after 1s
- Returns parsed JSON typed as the caller's generic
- Logs each request URL at debug level for sync transparency

```ts
import { getAccessToken } from './auth.js';

const BASE = 'https://us.api.blizzard.com';
const NAMESPACE_STATIC = 'static-us';
const LOCALE = 'en_US';

export async function fetchStatic<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}namespace=${NAMESPACE_STATIC}&locale=${LOCALE}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Blizzard API ${res.status} on ${path}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
  throw new Error(`Blizzard API rate-limited after retry on ${path}`);
}
```

### 10.4 `src/apis/blizzard/types.ts`

TS types for the response shapes we consume. **The
implementation agent populates these from real responses** —
this plan defines the shape we'll need but the exact field
names should be verified against live API output. Stub:

```ts
export interface PlayableClassIndexResponse {
  classes: Array<{ id: number; name: string; key: { href: string } }>;
}

export interface PlayableClassResponse {
  id: number;
  name: string;
  specializations: Array<{ id: number; name: string; key: { href: string } }>;
}

export interface PlayableSpecializationResponse {
  id: number;
  name: string;
  role: { type: string; name: string };
  class: { id: number; name: string };
  spec_talent_tree: { id: number; key: { href: string } };
  hero_talent_trees?: Array<{ id: number; name: string; key: { href: string } }>;
  // baseline spells: TBD field name — verify during impl
}

export interface TalentTreeResponse {
  id: number;
  class_talent_nodes: TalentNode[];
  spec_talent_nodes: TalentNode[];
  hero_talent_trees: Array<HeroTalentTree>;
}

export interface TalentNode {
  id: number;
  display_row: number;
  display_col: number;
  unlocks: Array<{
    id: number;
    spell_tooltip: { spell: { id: number; name: string } };
  }>;
}

export interface HeroTalentTree {
  id: number;
  name: string;
  hero_talent_nodes: TalentNode[];
}

export interface SpellResponse {
  id: number;
  name: string;
  description: string;
}

export interface SpellMediaResponse {
  assets: Array<{ key: string; value: string }>;
}
```

### 10.5 `src/apis/blizzard/index.ts`

Public surface — re-export `fetchStatic` and types. Keep
`auth.ts` internal to this directory.

### 10.6 `src/sync/normalize.ts`

```ts
/**
 * Normalize a spell name for use as an index key and filename slug.
 *
 * Rules:
 * - Lowercase
 * - Apostrophes, colons, commas, periods → stripped
 * - Whitespace + remaining non-alphanumerics → single hyphen
 * - Collapse adjacent hyphens
 * - Trim leading/trailing hyphens
 *
 * Examples:
 *   "Wake of Ashes"          → "wake-of-ashes"
 *   "Word of Glory"          → "word-of-glory"
 *   "Avenger's Shield"       → "avengers-shield"
 *   "Power Word: Fortitude"  → "power-word-fortitude"
 *   "Hand of A'dal"          → "hand-of-adal"
 */
export function normalizeSpellName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['',.:]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

### 10.7 `src/sync/walk-catalog.ts`

```ts
import { fetchStatic } from '../apis/blizzard/index.js';
import type {
  PlayableClassIndexResponse,
  PlayableClassResponse,
  PlayableSpecializationResponse,
  TalentTreeResponse,
} from '../apis/blizzard/types.js';

export type SourceType =
  | 'class_baseline'
  | 'spec_baseline'
  | 'class_talent'
  | 'spec_talent'
  | 'hero_talent';

export interface SpellRef {
  spellId: number;
  spellName: string;
  className: string;
  specs: string[];
  sourceType: SourceType;
  heroTree?: string;
}

/** Returns map keyed by spell_id with merged refs across the walk. */
export async function walkCatalog(opts: {
  classFilter?: string;
  specFilter?: string;
}): Promise<Map<number, SpellRef>> {
  const catalog = new Map<number, SpellRef>();
  const classIndex = await fetchStatic<PlayableClassIndexResponse>(
    '/data/wow/playable-class/index',
  );

  const classFilterLower = opts.classFilter?.toLowerCase();
  const specFilterLower = opts.specFilter?.toLowerCase();

  for (const cls of classIndex.classes) {
    if (classFilterLower && cls.name.toLowerCase() !== classFilterLower) {
      continue;
    }
    const classData = await fetchStatic<PlayableClassResponse>(
      `/data/wow/playable-class/${cls.id}`,
    );

    for (const specRef of classData.specializations) {
      if (specFilterLower && specRef.name.toLowerCase() !== specFilterLower) {
        continue;
      }
      const spec = await fetchStatic<PlayableSpecializationResponse>(
        `/data/wow/playable-specialization/${specRef.id}`,
      );

      // Spec baseline spells: TBD — extract from whatever field the
      // playable-specialization endpoint actually exposes. Register each
      // with sourceType: 'spec_baseline'.

      // Talent tree
      const tree = await fetchStatic<TalentTreeResponse>(
        `/data/wow/talent-tree/${spec.spec_talent_tree.id}/playable-specialization/${spec.id}`,
      );

      for (const node of tree.class_talent_nodes ?? []) {
        for (const unlock of node.unlocks) {
          register(catalog, {
            spellId: unlock.spell_tooltip.spell.id,
            spellName: unlock.spell_tooltip.spell.name,
            className: cls.name.toLowerCase(),
            specs: [spec.name.toLowerCase()],
            sourceType: 'class_talent',
          });
        }
      }
      for (const node of tree.spec_talent_nodes ?? []) {
        for (const unlock of node.unlocks) {
          register(catalog, {
            spellId: unlock.spell_tooltip.spell.id,
            spellName: unlock.spell_tooltip.spell.name,
            className: cls.name.toLowerCase(),
            specs: [spec.name.toLowerCase()],
            sourceType: 'spec_talent',
          });
        }
      }
      for (const hero of tree.hero_talent_trees ?? []) {
        const heroTreeKey = hero.name.toLowerCase().replace(/\s+/g, '-');
        for (const node of hero.hero_talent_nodes ?? []) {
          for (const unlock of node.unlocks) {
            register(catalog, {
              spellId: unlock.spell_tooltip.spell.id,
              spellName: unlock.spell_tooltip.spell.name,
              className: cls.name.toLowerCase(),
              specs: [spec.name.toLowerCase()],
              sourceType: 'hero_talent',
              heroTree: heroTreeKey,
            });
          }
        }
      }
    }
  }
  return catalog;
}

const SOURCE_TYPE_PRIORITY: Record<SourceType, number> = {
  class_baseline: 0,
  spec_baseline: 1,
  class_talent: 2,
  spec_talent: 3,
  hero_talent: 4,
};

function register(catalog: Map<number, SpellRef>, ref: SpellRef): void {
  const existing = catalog.get(ref.spellId);
  if (!existing) {
    catalog.set(ref.spellId, ref);
    return;
  }
  // Merge specs array
  const mergedSpecs = Array.from(new Set([...existing.specs, ...ref.specs]));
  // Keep lower-priority sourceType (class_baseline > spec_baseline > ...)
  const sourceType =
    SOURCE_TYPE_PRIORITY[existing.sourceType] <= SOURCE_TYPE_PRIORITY[ref.sourceType]
      ? existing.sourceType
      : ref.sourceType;
  catalog.set(ref.spellId, { ...existing, specs: mergedSpecs, sourceType });
}
```

### 10.8 `src/sync/write-abilities.ts`

```ts
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchStatic } from '../apis/blizzard/index.js';
import type { SpellResponse, SpellMediaResponse } from '../apis/blizzard/types.js';
import type { SpellRef } from './walk-catalog.js';
import { normalizeSpellName } from './normalize.js';

const ABILITIES_DIR = 'kb/wow/_abilities';

export async function writeAbilityFile(opts: {
  ref: SpellRef;
  patch: string;
  syncedAt: string;
  dryRun: boolean;
}): Promise<{ ok: boolean; warning?: string }> {
  const { ref, patch, syncedAt, dryRun } = opts;
  const spell = await fetchStatic<SpellResponse>(`/data/wow/spell/${ref.spellId}`);
  let iconUrl: string | undefined;
  try {
    const media = await fetchStatic<SpellMediaResponse>(
      `/data/wow/media/spell/${ref.spellId}`,
    );
    iconUrl = media.assets.find((a) => a.key === 'icon')?.value;
  } catch {
    // 404 on media — many spells lack icons. Continue without.
  }

  const normalized = normalizeSpellName(spell.name);
  const filename = `${ref.spellId}-${normalized}.md`;
  const fullPath = path.join(ABILITIES_DIR, filename);

  const description = spell.description?.trim() || '(no description returned by API)';
  const hasPlaceholders = /\$[a-z0-9]/i.test(description);

  const frontmatter = renderFrontmatter({
    game: 'wow',
    kind: 'ability',
    spell_id: ref.spellId,
    spell_name: spell.name,
    spell_name_normalized: normalized,
    class: ref.className,
    specs: ref.specs,
    source_type: ref.sourceType,
    hero_tree: ref.heroTree,
    icon_url: iconUrl,
    synced_from: 'blizzard-game-data-api',
    synced_at: syncedAt,
    patch,
  });

  const className = capitalize(ref.className);
  const body = `# ${spell.name} (${className})\n\n${description}\n`;

  if (!dryRun) {
    await mkdir(ABILITIES_DIR, { recursive: true });
    await writeFile(fullPath, `${frontmatter}\n\n${body}`, 'utf-8');
  }

  return {
    ok: true,
    warning: hasPlaceholders
      ? `[${ref.spellId}] ${spell.name}: description contains unresolved placeholder tokens`
      : undefined,
  };
}

function renderFrontmatter(data: Record<string, unknown>): string {
  // Hand-render YAML for stable formatting; using js-yaml's default
  // output would be fine but adds a dep. The shape is small and
  // controlled — manual rendering avoids surprises.
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) {
      lines.push(`${k}: ~`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
    } else if (typeof v === 'string') {
      // Quote if string contains special YAML chars
      const needsQuote = /[:#@!&*]/.test(v) || /^\d/.test(v);
      lines.push(`${k}: ${needsQuote ? JSON.stringify(v) : v}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

### 10.9 `src/sync/build-spell-index.ts`

```ts
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { SpellRef } from './walk-catalog.js';
import { normalizeSpellName } from './normalize.js';

const INDEX_PATH = 'data/blizz/spell-index.json';

export async function writeSpellIndex(
  catalog: Map<number, SpellRef>,
  meta: { syncedAt: string; patch: string },
): Promise<void> {
  const byClass: Record<string, Record<string, number>> = {};
  for (const ref of catalog.values()) {
    const cls = ref.className;
    byClass[cls] ??= {};
    const key = normalizeSpellName(ref.spellName);
    // First-write-wins for collisions within a class — log if we hit one
    if (key in byClass[cls] && byClass[cls][key] !== ref.spellId) {
      console.warn(
        `[spell-index] collision in ${cls}: "${key}" maps to both ${byClass[cls][key]} and ${ref.spellId}; keeping first`,
      );
      continue;
    }
    byClass[cls][key] = ref.spellId;
  }

  // Sort keys alphabetically per class for diff stability
  for (const cls of Object.keys(byClass)) {
    byClass[cls] = Object.fromEntries(
      Object.entries(byClass[cls]).sort(([a], [b]) => a.localeCompare(b)),
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
```

### 10.10 `scripts/sync-blizz-abilities.ts`

```ts
import { walkCatalog } from '../src/sync/walk-catalog.js';
import { writeAbilityFile } from '../src/sync/write-abilities.js';
import { writeSpellIndex } from '../src/sync/build-spell-index.js';

interface Args {
  classFilter?: string;
  specFilter?: string;
  dryRun: boolean;
  patch: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { dryRun: false, patch: process.env.WOW_PATCH ?? '12.0.5' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--class') {
      args.classFilter = argv[++i];
    } else if (argv[i] === '--spec') {
      args.specFilter = argv[++i];
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    } else if (argv[i] === '--patch') {
      args.patch = argv[++i] ?? args.patch;
    } else {
      console.error(`Unknown arg: ${argv[i]}`);
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
  const filtered = Boolean(args.classFilter || args.specFilter);

  const filterDesc = [
    args.classFilter ? `class=${args.classFilter}` : null,
    args.specFilter ? `spec=${args.specFilter}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`Walking Blizzard catalog${filterDesc ? ` (${filterDesc})` : ''}...`);
  const catalog = await walkCatalog({
    classFilter: args.classFilter,
    specFilter: args.specFilter,
  });
  console.log(`Discovered ${catalog.size} unique spells.`);

  const warnings: string[] = [];
  let written = 0;
  let failed = 0;

  // Simple worker pool: 8 concurrent fetches
  const entries = [...catalog.entries()];
  const POOL = 8;
  const workers = Array.from({ length: POOL }, async () => {
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
        warnings.push(`[${ref.spellId}] ${ref.spellName}: ${(err as Error).message}`);
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

  console.log(`\nWrote ${written} ability files (${failed} failed, ${warnings.length} warnings).`);
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.slice(0, 50).forEach((w) => console.log(`  - ${w}`));
    if (warnings.length > 50) console.log(`  ... ${warnings.length - 50} more`);
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
```

### 10.11 `package.json`

Add to `scripts`:

```json
"sync:blizz:abilities": "tsx scripts/sync-blizz-abilities.ts"
```

### 10.12 `.env.example`

Append:

```
# Blizzard Battle.net OAuth2 client credentials. Get them at
# https://develop.battle.net/access/clients. Only needed for
# `npm run sync:blizz:abilities`; runtime bot doesn't use these.
BLIZZARD_CLIENT_ID=
BLIZZARD_CLIENT_SECRET=
```

### 10.13 `kb/wow/_abilities/.gitkeep` and `data/blizz/.gitkeep`

Empty committed placeholders so the directories exist before the
first sync.

## 11. Tests

### 11.1 `src/sync/__tests__/normalize.test.ts`

Covers the normalizer comprehensively — pure function, tight unit
tests:

- `Wake of Ashes` → `wake-of-ashes`
- `Word of Glory` → `word-of-glory`
- `Avenger's Shield` → `avengers-shield`
- `Power Word: Fortitude` → `power-word-fortitude`
- `Hand of A'dal` → `hand-of-adal`
- `Lay on Hands!` → `lay-on-hands`
- `   Spaced   ` → `spaced`
- empty string → empty string
- `Hammer of Wrath (Avenging Wrath)` → `hammer-of-wrath-avenging-wrath`

### 11.2 `src/sync/__tests__/write-abilities.test.ts`

Mock the `fetchStatic` function (vitest's `vi.mock`) to return
canned responses. Verify:

- Frontmatter contains all expected fields
- `specs: []` for class-wide refs vs `[retribution]` for spec-locked
- `hero_tree: ~` when sourceType ≠ hero_talent
- Body H1 = `<Name> (<Class>)`
- Filename = `<id>-<normalized-name>.md`
- 404 on media → file written without `icon_url` field
- Description with `$s1` → warning returned, file still written
- Empty description → body shows fallback string

### 11.3 `src/apis/blizzard/__tests__/auth.test.ts`

Mock `fetch` to return canned OAuth responses. Verify:

- Token is cached and reused before expiry
- Token is re-fetched after expiry
- Missing env throws clear error
- 4xx OAuth response throws with status + body

### 11.4 `src/apis/blizzard/__tests__/client.test.ts`

Mock `fetch`. Verify:

- Adds correct namespace + locale query params
- Adds Bearer authorization
- Retries once on 429 after delay
- Throws on second 429
- Throws on non-2xx with descriptive error

### 11.5 Manual verification

Tightest iteration loop first — scope to one spec, dry-run:

```
npm run sync:blizz:abilities -- --class paladin --spec retribution --dry-run
```

Expected: walks just retribution paladin, prints the discovered spell
count (~30-50 spells), prints sample frontmatter for the first 5.
No files written. Sub-10s round trip.

Same scope, real write:

```
npm run sync:blizz:abilities -- --class paladin --spec retribution
```

Expected: ~30-50 files under `kb/wow/_abilities/`. Spot check 5
of them — frontmatter sane, body has real description text,
`icon_url` present for most, normalized filename matches spell
name. Prints the `[skipped index write — filtered run]`
reminder, since this is partial.

Class scope:

```
npm run sync:blizz:abilities -- --class paladin
```

Expected: ~80-150 files now under `_abilities/` (covers all 4
paladin specs deduplicated). Same `[skipped index write]`
reminder.

Then:

```
cat data/blizz/spell-index.json | head -40
```

Expected: alphabetically-sorted paladin entries with stable spell
IDs. Cross-check 2-3 known IDs against
https://www.wowhead.com/spell=<id> to confirm correctness.

Then:

```
npm run sync:blizz:abilities
```

Full run. Expect ~1500-2500 files across all 13 classes. Run time
~3-5 minutes (rate-limited by Blizzard's 100/sec).

## 12. Local validation gates

Before committing:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm test -- --run` passes (all new unit tests green)
- [ ] `npm run build` produces compiled `dist/` output for the
      new `src/apis/` and `src/sync/` directories
- [ ] Manual scoped sync (`--class paladin`) produces sane files
- [ ] Manual full sync produces ~1500-2500 files across 13 classes
- [ ] `data/blizz/spell-index.json` contains all 13 classes with
      sorted entries
- [ ] Existing `npm run dev` + `/zz` still works — runtime
      unaffected (this phase doesn't touch the bot)

## 13. Commit + push

```
git add src/apis/blizzard/ src/sync/ src/config/env.ts
git add scripts/sync-blizz-abilities.ts
git add kb/wow/_abilities/ data/blizz/
git add package.json package-lock.json .env.example
git commit -F tmp/commit-msg.md
rm tmp/commit-msg.md
git push -u origin feat/v2-blizz-abilities-sync
```

Suggested commit message:

```
feat: Blizzard ability sync (catalog walk + per-spell file generation)

Walks playable-class → playable-specialization → talent-tree to
discover all reachable spell IDs, then fetches /data/wow/spell/{id}
+ media for each. Writes kb/wow/_abilities/<id>-<name>.md per
unique spell and data/blizz/spell-index.json for future runtime
stage-2 lookup. ~1500-2500 files at full coverage. Runtime
integration deferred to phase 5b.
```

## 14. Exit criteria (gate to Phase 5b)

- [ ] All Phase 5a items in §12 checked
- [ ] `kb/wow/_abilities/` populated and committed
- [ ] `data/blizz/spell-index.json` populated and committed
- [ ] CLI command works in all three modes (full / `--class X` /
      `--dry-run`)
- [ ] At least 10 spot-checked spell files have correct
      frontmatter + body matching Wowhead's tooltip text
- [ ] Sync warnings (placeholder tokens, missing icons) surface
      cleanly in stdout; none of them block the run

Phase 5b's job: chunker tweak (`kind: ability` bypasses
MIN_WORDS), wire the `_abilities/` chunks into vectra at
build:kb time, implement the two-stage retrieval at /zz time,
extend the system prompt to render an `<ability_reference>`
block.

## 15. Open questions / risks

- **Baseline spell discovery.** The exact field on
  `/data/wow/playable-specialization/{specId}` that lists
  baseline spells is unverified. May require a fallback walk
  through `/data/wow/playable-class/{classId}` for class-baseline
  spells. Implementation agent verifies against live response
  and updates the walk if needed.
- **Talent tree node shape.** `unlocks[].spell_tooltip.spell` is
  the inferred path for talent-unlocked spell IDs. Confirm
  against live response — may be `unlocks[].spell.{id,name}` or
  `unlocks[].talent.{spell:{id,name}}` instead.
- **Hero talent trees.** Confirm whether they appear under
  `hero_talent_trees` on the talent-tree-per-spec endpoint, or
  whether they need a separate `/data/wow/hero-talent-tree/{id}`
  fetch. TWW added these post-Dragonflight; API field naming
  may have shifted.
- **Description placeholders.** `$s1`, `$a1`, etc are scaling
  formula tokens the game client substitutes at runtime. The
  API doesn't resolve them. We log warnings and move on. If
  too many spells are affected, consider a follow-up to scrape
  resolved tooltips from `/data/wow/spell/<id>/preview` (if it
  exists) or fall back to community sources like Wago.tools.
- **Spec → display name mapping.** Spec names from the API
  ("Retribution") get lowercased to "retribution" for the
  `specs` array. Hero tree names ("Herald of the Sun") get
  lowercased and hyphenated to "herald-of-the-sun". Verify
  these match what we expect to see in hand-authored guide
  frontmatter.
- **Rate limit backoff.** Single 1s retry on 429 is naive. If
  full sync hits multiple 429s, switch to exponential backoff
  with jitter. Defer until we see it.
- **Concurrency tuning.** POOL=8 is a guess. If sync is too slow
  bump to 16; if we see 429 storms drop to 4. Tune empirically.
- **Patch field provenance.** Currently the patch tag is read
  from `WOW_PATCH` env var or defaults to `'12.0.5'`. The
  future `kb/wow/_state.md` anchor file (per the design
  conversation) should be the canonical source — wire that up
  in Phase 5b alongside the chunker work.
- **Localization.** `locale=en_US` is hard-coded. Friends server
  is English so this is fine. If we ever need other locales,
  the sync would need to write per-locale files and the runtime
  would need locale routing.

---
