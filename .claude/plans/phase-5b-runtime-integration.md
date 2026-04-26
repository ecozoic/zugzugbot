# Phase 5b — Runtime integration of synced ability data

**Status:** Draft (skeleton — flesh out when starting phase)
**Parent plan:** `v2-rebuild.md` (Phase 5)
**Depends on:** Phase 5a complete (`phase-5a-abilities-sync.md`)
**Goal:** wire the synced `kb/wow/_abilities/` files and `data/blizz/spell-index.json`
into the `/zz` runtime so guide chunks get their referenced abilities
auto-included as context.

Phase 5a generates the data on disk. Phase 5b consumes it at query time.

---

## What this phase delivers

1. Chunker tweak — `kind: ability` chunks bypass the `MIN_WORDS=35` filter
   (some spell descriptions are shorter than that, e.g. passive procs).
2. Two-stage retrieval in `/zz`:
   - Stage 1: embedding-search for guide chunks (`kind: 'guide'`)
   - Stage 2: parse stage-1 chunk text for `**bold names**`, resolve via
     `spell-index.json` → fetch ability chunks by `kind: 'ability' AND
     spell_id IN (...)` from vectra
3. System prompt extension: render `<ability_reference>` block alongside
   the existing `<sources>` block in `buildSystemPromptWithContext`.
4. **Spec-scoped spell-index** — fix the (class, name) collision problem
   surfaced during 5a's full sync. See §1 below.
5. Build-time validation in `build:kb` — scan guide content for
   `**bold names**`, fail loud if any name doesn't resolve in the
   spell-index. Turns runtime silence into developer-time errors.

## 1. Spec-scoped spell-index (collision fix)

Phase 5a's index keys on `(class, normalized_name) → spell_id` with
first-write-wins. Full sync surfaced ~40 same-name-different-ID
collisions, mostly spec-variant duplicates:

- Hunter "Kill Command" → 34026 (BM) vs 259489 (Survival)
- Shaman "Ascendance" → 114050/114051/114052 (Elem/Enh/Resto)
- Druid "Berserk" → 106951 (Feral) vs 50334 (Guardian)
- Paladin `divine-purpose` (223817 talent vs 408459 proc),
  `empyrean-legacy` (1241358 hotfix vs 387170), etc.

**Required redesign:**

```json
{
  "by_class": {
    "hunter": {
      "_class": {
        "kill-command": [34026, 259489]
      },
      "beast-mastery": {
        "kill-command": 34026
      },
      "survival": {
        "kill-command": 259489
      },
      "marksmanship": {
        ...
      }
    }
  }
}
```

- `_class` bucket holds class-wide spells (Lay on Hands, Hand of
  Reckoning, etc) — anything whose talent walk produced a `specs` array
  with multiple specs.
- Per-spec buckets hold spec-locked spells.
- Same name appearing in multiple specs but with different IDs lives
  ONLY in the per-spec buckets; the `_class` entry would be an array
  if any cross-spec same-name collision is real (rare but covers the
  edge case).

**Runtime lookup logic:**

```
1. Guide chunk frontmatter has class=hunter, spec=survival
2. Bold name "Kill Command" extracted
3. Try index.by_class.hunter["survival"]["kill-command"] → 259489 ✓
4. If miss: try index.by_class.hunter._class["kill-command"]
   - If single ID, use it
   - If array (collision), error — tell author to specify
5. Send 259489's ability chunk as context
```

**Generation logic (in `src/sync/build-spell-index.ts`):**

For each `SpellRef` in catalog:
- If `specs.length === 0` (class-wide) OR all of the class's specs
  appear in `specs`: write to `_class` bucket
- Otherwise: for each spec in `specs`, write to that spec's bucket
- Track collisions per bucket; warn if same name maps to different
  IDs within one bucket (these are genuine ambiguities the author
  must disambiguate via overrides)

Test: confirm the Hunter / Shaman / Paladin known collisions resolve
to the right ID under the right spec scope after the redesign.

## 2. Chunker tweak — bypass MIN_WORDS for synced kinds

Current chunker drops chunks with <35 words. Some spell descriptions
fall below this, especially passives. Add a per-kind override:

```ts
const MIN_WORDS_BY_KIND: Record<string, number> = {
  ability: 0,
  talent_summary: 0,  // future
  meta: 0,             // future (WCL snapshots)
  guide: 35,           // existing default
};
```

Apply during the chunk filter step.

Test: confirm a synthetic ability chunk with 20 words isn't dropped.

## 3. Two-stage retrieval in `/zz`

In `src/rag/query.ts` (or a new function alongside `retrieve`):

```ts
export async function retrieveTwoStage(
  prompt: string,
  opts: { game: Game; class?: string; spec?: string },
): Promise<{ guides: SearchResult[]; abilities: SearchResult[] }> {
  // Stage 1: semantic search filtered to guide chunks
  const queryEmbedding = await embedQuery(prompt);
  const index = await getRuntimeIndex();
  const guides = await search(index, queryEmbedding, 5, {
    game: opts.game,
    kind: 'guide',
  });

  // Stage 2: parse + lookup
  const boldNames = extractBoldNamesFromChunks(guides);
  const spellIds = resolveBoldNames(boldNames, {
    class: opts.class,
    spec: opts.spec,
  });
  const abilities = await listItemsByMetadata(index, {
    kind: 'ability',
    spell_id: { $in: spellIds },
  });

  return { guides, abilities };
}
```

`opts.class` / `opts.spec` come from the guide chunks' shared
metadata. If guides span multiple specs (rare), use a fallback
strategy (per-guide lookup or default to class-wide).

`resolveBoldNames` reads `spell-index.json` (loaded once at startup
into memory).

Edge: `kind=guide` filter assumes guide chunks have `kind: 'guide'`
metadata. Phase 5a's hand-authored chunker doesn't set `kind` — we
need to update `chunk.ts` to default `kind: 'guide'` for any
non-synced chunk (and have the sync write `kind: 'ability'` into the
ability frontmatter explicitly so the chunker's `kind` passes through).

## 4. System prompt extension

`src/llm/prompts.ts` — extend `buildSystemPromptWithContext` to
accept `abilities` separately and render:

```
<sources>
[existing guide chunks]
</sources>

<ability_reference>
[Wake of Ashes (Paladin)]
45s CD, 8yd radius, generates 5 Holy Power...

[Final Verdict (Paladin)]
...
</ability_reference>
```

Update the system instruction: "When you mention a spell in your
answer, use the mechanics described in <ability_reference>. Treat
those as authoritative for the current patch."

## 5. Build-time validation (in `build:kb`)

After chunking guide files, scan their text for `**bold names**`.
For each, attempt resolution against the loaded spell-index using
the chunk's `class` and `spec` frontmatter.

- Resolved → no action
- Unresolved → log warning at ERROR level + add to a build-time
  `unresolved` list
- If any unresolved at end of build → exit non-zero so the author
  fixes via `_overrides.json` before deploy

Implementation lives in `scripts/build-kb.ts` or a new
`src/rag/validate-references.ts`.

## 6. Open questions

- **Spec-multi-class spells (rare):** if a spell legitimately appears
  in multiple classes (cross-faction utility?), the index handles it
  via per-class entries (already correct).
- **PvP talents:** Phase 5a's walker doesn't include them. Do they
  matter for /zz scope? Probably no for the friends server. Defer.
- **WCL meta integration:** still deferred to Phase 5c.
- **Talent tree summary files (per class/spec/hero-tree):** discussed
  in 5a as "useful for queries about whole-tree structure" but
  deferred. Reconsider here.

## 7. Exit criteria

- [ ] Chunker bypasses MIN_WORDS for `kind: ability` chunks
- [ ] Spell-index regenerated with spec-scoped shape; all known
      collisions resolve to the correct ID under their spec context
- [ ] Two-stage retrieval implemented; `/zz` answers grounded in
      both guide chunks AND referenced ability chunks
- [ ] System prompt renders `<ability_reference>` block; Sonnet uses
      it for spell mechanics in answers
- [ ] Build-time validation catches unresolved bold names; fails
      build with actionable error
- [ ] Existing tests pass; new tests cover two-stage retrieval +
      validation + spec-scoped index resolution
