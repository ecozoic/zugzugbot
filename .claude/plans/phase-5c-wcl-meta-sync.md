# Phase 5c — Warcraft Logs meta sync (build-side)

**Status:** Draft
**Parent plan:** `v2-rebuild.md` (Phase 5)
**Depends on:** Phase 5a complete (`phase-5a-abilities-sync.md`)
**Related:** Phase 5b (`phase-5b-runtime-integration.md`) — runtime
consumes WCL meta files alongside ability data
**Goal:** offline pipeline that fetches current-meta data from
Warcraft Logs and produces:

- `kb/wow/_meta/<class>-<spec>-raid.md` — top mythic raid loadout per spec
- `kb/wow/_meta/<class>-<spec>-mplus.md` — top m+ loadout per spec
- `kb/wow/_meta/raid-tier-list.md` — class-agnostic spec rankings, all
  difficulties + per-boss
- `kb/wow/_meta/mplus-tier-list.md` — class-agnostic spec rankings,
  per-dungeon

These markdown files get chunked + embedded by `build:kb` exactly like
hand-authored guides. They're the "what's currently being played"
counterpart to Phase 5a's "what every ability is."

**Out of scope (deferred):**

- Per-boss raid build snapshots (Tier 2 — expansion path documented
  in §11)
- Per-dungeon m+ build snapshots (Tier 3+)
- Per-percentile splits within Mythic (p50/p75/p99) — defer until we
  see whether p99-default snapshots cover our /zz queries
- Guild log analysis ("upload my log, suggest improvements") — Phase 5d
- WCL talent-tree-aware diffing (e.g. "this build differs from baseline
  in node X") — heuristic, defer

---

## 1. Pre-flight

**WCL API credentials** — already obtained per the session. Stored
as `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET` in `.env`. Schema in
`src/config/env.ts` accepts both as `.optional()`.

**Auth + GraphQL client** — already built in `src/apis/warcraftlogs/`:
- `auth.ts` — OAuth2 client_credentials, in-memory token cache
- `client.ts` — `graphql<T>(query, variables)` wrapper, single 429
  retry, GraphQL `errors[]` propagation

**Debug script** — `scripts/debug-wcl-fetch.ts` (npm: `debug:wcl`)
already in place for ad-hoc query exploration.

**Rate limit headroom:** 3,600 points/hour. Tier 1 full sync uses
~2,200 points (tier list + per-spec snapshots) and completes in
~30 minutes wall time — well within budget. Tier 2 (per-boss raid)
fits in ~1.5 hours = a single rate-limit window.

## 2. Branch

```
git checkout master && git pull
git checkout -b feat/v2-wcl-meta-sync
```

## 3. Tooling

No new dependencies. Built-in `fetch`, the existing `graphql<T>`
wrapper, `gray-matter`, and `zod` cover everything.

## 4. Project structure (Phase 5c additions)

```
zugzugbot/
  src/
    apis/
      warcraftlogs/                       # already created in this session
        auth.ts
        client.ts
        index.ts
        types.ts                          # NEW — GraphQL response shapes
        __tests__/
          client.test.ts                  # NEW
    sync/
      wcl/                                # NEW directory
        zones.ts                          # NEW — discover current raid/m+ zones
        rankings.ts                       # NEW — characterRankings queries
        loadouts.ts                       # NEW — extract talents/gear from a report
        aggregate.ts                      # NEW — fold N samples into a snapshot
        tier-list.ts                      # NEW — produce tier-list MD files
        per-spec.ts                       # NEW — produce per-spec build snapshots
        write.ts                          # NEW — render snapshot → MD file
        __tests__/
          *.test.ts                       # NEW (per-module)
  scripts/
    sync-wcl-meta.ts                      # NEW — CLI entry point
    debug-wcl-fetch.ts                    # already in place
  kb/
    wow/
      _meta/                              # NEW directory (committed)
        .gitkeep                          # NEW (until first sync)
  data/
    blizz/
      wcl-zones.json                      # NEW — discovered zone IDs cached per sync
                                          #       (raid_zone_id, mplus_zone_id, syncedAt)
  package.json                            # MODIFIED — add sync:wcl:meta script
```

## 5. File format specs

### 5.1 Per-spec build snapshot

Path: `kb/wow/_meta/<class>-<spec>-<content_type>.md`
(e.g. `paladin-retribution-raid.md`)

```markdown
---
game: wow
kind: meta
class: paladin
spec: retribution
content_type: raid                    # raid | mplus
percentile: p99                       # default — we only sync top 1%
sample_size: 5                        # # of top reports aggregated
synced_from: warcraft-logs-v2
synced_at: '2026-04-26T22:00:00Z'
patch: '12.0.5'
zone_id: 46                           # WCL raid zone, or m+ zone (47)
zone_name: 'VS / DR / MQD'            # human-friendly
---

# Retribution Paladin — Mythic Raid Meta (12.0.5)

## Hero Tree

**Templar** — used by 4/5 of top parsers (Templar/Herald split:
80%/20%). Templar dominates current tier.

## Talent Build

[Wowhead import string here, taken from the most-common loadout]

`B+JCAFAB+CAA...`

**Notable picks (top loadout):**
- Class tree: ...
- Spec tree: ...
- Hero tree (Templar): ...

**Variance from #1:** the second-most-common loadout differs by N
talents, primarily around X/Y/Z (likely accommodating different cleave
profiles).

## Gear / Trinkets

**Most-equipped trinkets (top 5 sample):**
1. **Sigil of Templar's Conviction** (4/5)
2. **Empyrean Hourglass** (3/5)
3. ...

**Common embellishments:** ...

## Stat Priority Hint

Inferred from gear: Crit > Mastery > Versatility (median across
samples). NOT authoritative; use as signal only.
```

### 5.2 Tier list (raid)

Path: `kb/wow/_meta/raid-tier-list.md`

```markdown
---
game: wow
kind: meta
content_type: raid
synced_from: warcraft-logs-v2
synced_at: '2026-04-26T22:00:00Z'
patch: '12.0.5'
zone_id: 46
---

# Mythic Raid Tier List (12.0.5)

## Overall (current tier, all bosses)

DPS:
1. Retribution Paladin — 105% (p75 normalized to median)
2. Affliction Warlock — 103%
3. ...

Healers:
1. Discipline Priest — ...
...

Tanks:
...

## Per-Boss

### Imperator Averzian (Mythic)

DPS top 5:
1. Retribution Paladin
...

### Imperator Averzian (Heroic)

DPS top 5:
...

### Vorasius (Mythic)
...

(repeated for all 9 bosses × 3 difficulties — Mythic, Heroic, Normal)
```

The body length is substantial but the chunker splits at H2/H3 boundaries so retrieval scopes naturally to "Imperator Averzian Mythic DPS" etc.

### 5.3 Tier list (m+)

Path: `kb/wow/_meta/mplus-tier-list.md`

```markdown
---
game: wow
kind: meta
content_type: mplus
synced_from: warcraft-logs-v2
synced_at: ...
patch: '12.0.5'
zone_id: 47
---

# Mythic+ Tier List (Season 1)

## Overall (current season)

DPS:
1. ...

## Per-Dungeon

### Algeth'ar Academy
DPS top 5:
1. ...

### Magisters' Terrace
...
```

(8 dungeons × 1 difficulty — m+ has no Normal/Heroic/Mythic axis)

## 6. Algorithm — zone discovery

Run once per sync, cached to `data/blizz/wcl-zones.json` for
audit/debug:

```graphql
{ worldData { zones { id name frozen expansion { id name } } } }
```

Filter to `frozen: false`, find:
- The zone with `name` matching `Mythic+` pattern → mplus_zone_id
- The zone with encounters length >= 6 (raid heuristic) and not delves → raid_zone_id

Hard-coded fallback if heuristic fails: `raid_zone_id=46`,
`mplus_zone_id=47` (current as of 2026-04-26). Update fallback when
new tier ships.

Output cached to `data/blizz/wcl-zones.json`:
```json
{
  "synced_at": "...",
  "raid": { "id": 46, "name": "VS / DR / MQD" },
  "mplus": { "id": 47, "name": "Mythic+ Season 1" }
}
```

## 7. Algorithm — tier list pass (cheap, runs first)

For each (zone, difficulty):
- For each encounter:
  - For each playable spec:
    - Query: `worldData.encounter(id).characterRankings(className, specName, difficulty, metric, page: 1)`
    - Extract: `count`, top-N spec ranking percentile/median dps
    - Skip if count < threshold (e.g. <50 parses) — too sparse to rank

Aggregate into the tier-list MD files.

**Cost estimate:**
- raid: 9 bosses × 3 diffs (M+H+N, drop LFR) × 39 specs = 1,053 queries × ~1 point = ~1,053 points
- m+: 8 dungeons × 1 diff × 39 specs = 312 queries × ~1 point = ~312 points
- **Total: ~1,365 points** for full tier list refresh — ~25 minutes wall time

## 8. Algorithm — per-spec build snapshots (Tier 1: aggregated)

For each playable spec × {raid, mplus}:

```
1. Query characterRankings for the spec across the FULL ZONE
   (no encounter filter — gives top across all bosses/dungeons).
   Filter: difficulty=Mythic for raid, dungeon difficulty for m+.
   Filter: percentile bracket "100" (p99 only) for build extraction.
   Take top 5 rankings.

2. For each top-5 ranking:
   a. Fetch: report.events(fightIDs, dataType: CombatantInfo,
      sourceID: <player guid>, limit: 1)
      [SHAPE TBD — see §10 open questions]
   b. Extract from the CombatantInfo event:
      - talents array → talent IDs picked
      - gear array → equipped item IDs + slots
      - hero tree → derived from talent IDs that fall in hero tree

3. Aggregate across the 5 samples:
   - Most-common talent loadout (full match wins; otherwise per-talent
     vote → best loadout reconstructed from top-vote-per-position)
   - Most-equipped trinkets (top 3-5)
   - Hero tree split (Templar 80% / Herald 20% etc)
   - Stat priority median (from item secondaries)

4. Render snapshot → kb/wow/_meta/<class>-<spec>-<content_type>.md
```

**Cost estimate (revised after §10.1 verification):**
- per snapshot: 1 rankings (1 pt) + 5 events (2 pts each) = 11 pts
- raid: 39 specs × 11 = ~430 points
- m+: 39 specs × 11 = ~430 points
- **Total per-spec build snapshots: ~860 points** — ~15 minutes

## 9. CLI command

`scripts/sync-wcl-meta.ts`:

```
npm run sync:wcl:meta                                # full sync
npm run sync:wcl:meta -- --class paladin             # one class
npm run sync:wcl:meta -- --class paladin --spec ret  # one spec
npm run sync:wcl:meta -- --tier-list-only            # only tier-list files
npm run sync:wcl:meta -- --per-spec-only             # only per-spec snapshots
npm run sync:wcl:meta -- --dry-run                   # log queries, no writes
```

Filter rules same as Phase 5a's `sync:blizz:abilities`:
- `--spec` requires `--class` (avoid ambiguity)
- Filtered runs produce partial files; tier-list files are not written
  unless an unfiltered run is requested OR `--tier-list-only` is set
- `--per-spec-only` skips zone discovery + tier-list, jumps to build
  snapshots only (saves ~25 min when you just want to refresh builds)

## 10. Open questions / shape verification

### 10.1 CombatantInfo extraction shape (RESOLVED 2026-04-26)

Verified working via debug:wcl exploration. Use:

```graphql
query R($code: String!) {
  reportData {
    report(code: $code) {
      events(
        dataType: CombatantInfo
        fightIDs: [<fightID>]
        sourceID: <playerID>
        limit: 1
      ) {
        data
        nextPageTimestamp
      }
    }
  }
}
```

Returns one event per player per fight start (limit: 1 covers it).
The `data` field has the full structured loadout:

- **`gear[]`** — array of equipped items with `id`, `quality`,
  `icon` (filename), `itemLevel`, `permanentEnchant`, `bonusIDs[]`,
  `gems[]` (each with id/itemLevel/icon), `setID` (for tier set
  detection)
- **`talentTree[]`** — array of `{id, rank, nodeID}`. The `nodeID`
  matches Blizzard's talent tree node IDs (already known via
  Phase 5a's talent tree walk → we can resolve nodeID → talent
  name + which tree it's in). `id` is the talent ID itself.
- **`specID`** — the player's spec confirmation
- **stat snapshot** — `strength`, `agility`, `stamina`, `intellect`,
  `armor`, `critMelee/Ranged/Spell`, `hasteMelee/Ranged/Spell`,
  `mastery`, `versatilityDamageDone/Healing/DamageReduction`, etc.
  Useful for inferring stat priority from gear distribution.

`talents[]` and `customPowerSet[]` exist on the event but are empty
(legacy pre-Dragonflight talent fields and Azerite gear from BfA).
Ignore both.

**Cost:** ~2 points per call (verified). Combined with rankings query
this means per-snapshot cost is ~11 points (1 rankings + 5 × 2
events), NOT the ~28 estimated earlier.

### 10.2 Healer/tank metric

`metric: dps` is wrong for healers (use `hps`) and probably wrong for
tanks (use `dps` or `dtps`). Per-spec snapshot needs role-aware
metric selection. Tier list pass needs this too — healers ranked by
hps, tanks by... something appropriate.

Source of truth for spec roles: WCL's spec metadata, or hard-code per
the 39-spec list (we know these). Probably easier to hard-code.

### 10.3 Talent ID → talent name resolution

The CombatantInfo's talents are likely IDs only. To produce a
human-readable build description AND a wowhead import string, we
need talent ID → name mapping. Phase 5a's
`data/blizz/spell-index.json` has spell name lookups but talent IDs
are different from spell IDs.

Options:
- Walk Blizzard's `/data/wow/talent/{id}` per talent — adds Blizzard
  API calls during WCL sync
- Skip talent enumeration; just produce the wowhead import string
  (which the player can paste into-game without us understanding it)
- Use WCL's own talent-name resolution if it's exposed

Decision deferred to implementation time after CombatantInfo shape
is verified.

### 10.4 Wowhead import string generation

Wowhead import strings are a specific binary-encoded format. We
might:
- Extract from the report directly if WCL exposes it
- Reconstruct from the talent IDs (requires knowing the encoding —
  doable, format is documented in addon community)
- Fall back to listing talent names + ranks textually if the import
  string is too brittle

### 10.5 Sample size — 5 vs more vs adaptive

Tier 1 hardcodes sample size to 5 top parsers. If samples disagree
significantly (highly variant builds), 5 may be too few for
confidence. Stretch: adaptive sample size (start at 5, expand to 10
if no clear winner). Defer until we see real data.

## 11. Tier 2 expansion path (per-boss raid builds)

When ready to scale up:

**Code-side changes:**
1. Add a `--per-boss-raid` flag to `sync-wcl-meta.ts`
2. In `per-spec.ts`, when `per-boss-raid` is on:
   - Instead of one rankings query per spec for "raid mythic", do one
     per (spec, encounter, mythic): 39 × 9 = 351 rankings queries
   - Each → top 5 reports → CombatantInfo extraction
   - Render to `kb/wow/_meta/<class>-<spec>-raid-<encounter-slug>.md`
3. Update tier list pass — already covers per-boss data, no change

**Cost (revised after §10.1):**
- Tier 2 build snapshots: 351 × 11 = ~3,900 points → ~1 hr full sync
  (instead of Tier 1's ~7 min for build snapshots alone)
- Tier list unchanged: ~1,365 points
- **Total: ~5,300 points → ~1.5 hr full sync — fits in a single hour
  with the rate-limit reset.**

**Scheduling:** Tier 2 now fits in one sync run, but if a single hour
is too aggressive (or to leave headroom for ad-hoc queries during a
sync window), split:
- Day 1: refresh class set A (DK, DH, Druid, Evoker, Hunter)
- Day 2: refresh class set B (Mage, Monk, Paladin, Priest)
- Day 3: refresh class set C (Rogue, Shaman, Warlock, Warrior)
- Tier list daily

This is a config knob in Phase 5c's CLI from the start (`--class X`
already supports this).

**File-naming convention for Tier 2:**
`<class>-<spec>-raid-<encounter-slug>.md` (e.g.
`paladin-retribution-raid-imperator-averzian.md`).

Tier 1's flat file (`paladin-retribution-raid.md`) becomes the
"overall" snapshot, still useful as the spec-wide answer when no
specific boss is mentioned in a query.

**Migration concern:** if we go Tier 1 → Tier 2 mid-way through the
project, the existing flat files stay valid; we just add per-boss
files alongside. The chunker treats them all as `kind: meta` so
retrieval works either way.

## 12. Tests

### Unit tests

- `src/sync/wcl/__tests__/zones.test.ts` — zone discovery filter
  logic; mock `graphql` returning canned worldData
- `src/sync/wcl/__tests__/rankings.test.ts` — rankings query builder,
  result aggregation
- `src/sync/wcl/__tests__/loadouts.test.ts` — combatantInfo →
  structured talents/gear extraction (mock fixtures captured from
  real responses)
- `src/sync/wcl/__tests__/aggregate.test.ts` — N samples → snapshot
  (most-common talent vote, gear frequency, hero tree split)
- `src/sync/wcl/__tests__/tier-list.test.ts` — tier-list MD rendering
- `src/sync/wcl/__tests__/per-spec.test.ts` — per-spec MD rendering
- `src/apis/warcraftlogs/__tests__/client.test.ts` — graphql wrapper,
  retry on 429, error propagation

### Integration verification (manual)

- Pre-implementation: run debug:wcl with the candidate
  CombatantInfo queries, capture real response shapes, write tests
  off those fixtures
- Post-implementation: `npm run sync:wcl:meta -- --class paladin
  --spec ret --dry-run` — confirms one-spec walk works end-to-end
- Then `--class paladin --spec ret` real run, spot-check the produced
  MD file for sanity (talent build looks plausible, gear list is
  current-tier items, etc)

## 13. Local validation gates

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run format:check` clean
- [ ] `npm test -- --run` all pass
- [ ] `npm run build` produces dist/ for new modules
- [ ] Manual scoped sync (`--class paladin --spec ret`) produces a
      sane `kb/wow/_meta/paladin-retribution-raid.md` that matches
      what wowhead/wcl shows for top current parsers
- [ ] Full tier-list sync produces `raid-tier-list.md` and
      `mplus-tier-list.md`, spec rankings within the same order of
      magnitude as wcl.com's public stat pages
- [ ] Existing /zz behavior unchanged (this phase doesn't touch the
      runtime path)

## 14. Commit + push

Single atomic commit for the full Tier 1 implementation. Suggested
message:

```
feat: Warcraft Logs meta sync — Phase 5c Tier 1 (build-side)

Build-time pipeline that pulls current-meta data from WCL's v2
GraphQL API and writes:
- kb/wow/_meta/<class>-<spec>-{raid,mplus}.md per spec
- kb/wow/_meta/{raid,mplus}-tier-list.md for class-agnostic rankings

Aggregated at (spec, content-type) level — one mythic-raid snapshot
per spec, one m+ snapshot per spec — to keep full sync within ~35
min of API time. Tier 2 path (per-boss raid snapshots, ~3 hr sync)
documented in plans/ for future scale-up.

Foundation for /zz queries about current meta: "what should i play
for raid?", "is X spec good right now?", "what trinkets are top
parsers using?" — Phase 5b's two-stage retrieval will surface these
files alongside ability data.
```

## 15. Exit criteria

- [ ] All §13 gates green
- [ ] `kb/wow/_meta/` populated with ~80 files (39 raid + 39 mplus
      + 2 tier-lists)
- [ ] `data/blizz/wcl-zones.json` cached + committed
- [ ] CLI works in all modes (full / `--class` / `--spec` /
      `--tier-list-only` / `--per-spec-only` / `--dry-run`)
- [ ] At least 5 spot-checked per-spec MD files have sane build
      content (cross-check vs wcl.com or wowhead)
- [ ] All four open questions in §10 resolved or explicitly deferred
      to a follow-up
- [ ] CombatantInfo extraction shape verified against real responses
      (NOT assumed — this is the riskiest unknown going in)

## 16. Notes / risks

- **API budget is a hard constraint.** 3,600 points/hour. Tier 1 fits
  comfortably; Tier 2 nearly fills the hour; anything richer needs
  multi-day spreading.
- **Meta drift.** WCL data updates as people parse; the meta can shift
  significantly week-to-week early in a tier and stabilize later.
  Recommended cadence: weekly cron during "active" weeks (first 2
  months of a tier), monthly thereafter. The script is idempotent;
  re-runs always wipe + rewrite the relevant `_meta/` files.
- **Patch boundaries.** When 12.0.6 ships, the tier-list zone may
  change (new partition); WCL's `partitions[].default` flag tells us
  which is current. Handle in zone discovery.
- **Region scoping.** WCL data is global by default but we can filter
  to US-only via the region parameter. Friends server is US, so
  US-only is more representative. Default to US, optional flag to
  expand.
- **No /zz runtime changes in this phase.** All work is build-time.
  Phase 5b consumes these files via the existing chunker/vectra path.
