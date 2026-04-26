# Phase 3 — KB build pipeline (chunker + embedder + vector store + build script)

**Status:** Draft
**Parent plan:** `v2-rebuild.md`
**Depends on:** Phase 2 (LLM-wired `/zz` deployed)
**Goal:** offline pipeline that turns hand-authored markdown
under `kb/<game>/` into a vectra index at `data/vectra/`.
The bot's runtime is unchanged — `/zz` still answers from
Sonnet's training data via the Phase 2 wiring. Phase 4 wires
the index into `/zz` so retrieval grounds the answers; Phase 3
just gets the pipeline standing and the seed content embedded.

---

## 1. Pre-flight

Two real prereqs:

**1. Voyage AI API key.**
- Get one at https://www.voyageai.com/ → sign up → API Keys
  → Create Key. Voyage gives 50M free tokens to new accounts,
  which comfortably covers all v2 KB rebuilds for the
  foreseeable future.
- Key starts with `pa-`.

**2. Decide if you want to author in Obsidian.**
- The `kb/` directory IS a valid Obsidian vault as soon as it
  exists — no separate setup required. Open Obsidian → "Open
  folder as vault" → point at `~/Code/zugzugbot/kb`.
- Optional: install the **Obsidian Git** community plugin so
  you can commit + push from inside the editor. Settings →
  Community plugins → Browse → search "Git" → install.
- Recommend the Templater plugin for the frontmatter scaffold:
  every new file in `kb/<game>/` gets the right `game:` field
  pre-populated based on the parent folder.
- Or just edit MD files in VS Code. The bot doesn't care.

## 2. Branch

```
cd ~/Code/zugzugbot
git checkout master
git pull
git checkout -b feat/v2-kb-pipeline
```

## 3. Tooling

Three new dependencies:

```
npm install voyageai vectra gray-matter glob
```

Notes:

- **`voyageai`** is the official Voyage AI SDK.
- **`vectra`** — in-memory + JSON-on-disk vector store. Per
  parent plan §4.3, this is the right size for our scale.
- **`gray-matter`** — the standard Node markdown frontmatter
  parser. ~10KB unpacked. No transitive dependency hell.
- **`glob`** — directory-walking. Node 22 has a built-in `fs.glob`
  but Phase 1 specced Node 20, so we use the package.

No dev-dependency changes.

## 4. Project structure (Phase 3 additions)

```
zugzugbot/
  src/
    rag/                                  # NEW directory
      chunk.ts                            # NEW — pure markdown → Chunk[] function
      embed.ts                            # NEW — Voyage SDK wrapper
      store.ts                            # NEW — vectra wrapper
      __tests__/
        chunk.test.ts                     # NEW — vitest
    config/
      env.ts                              # MODIFIED — add VOYAGE_API_KEY
  scripts/
    build-kb.ts                           # NEW — walks kb/, chunks, embeds, writes data/vectra/
  kb/                                     # NEW — also doubles as an Obsidian vault
    wow/
      paladin-retribution.md              # NEW (seed content)
      paladin-protection.md               # NEW (seed content)
    diablo/
      barbarian-whirlwind.md              # NEW (seed content)
    ff14/
      paladin-rotation.md                 # NEW (seed content)
  data/                                   # NEW directory; vectra populates it
    .gitkeep                              # NEW (committed) — keeps the directory tracked even when empty
  package.json                            # MODIFIED — add "build:kb" script + new deps
  .env.example                            # MODIFIED — add VOYAGE_API_KEY
```

## 5. KB file format spec

Every `.md` file under `kb/` MUST start with YAML frontmatter
that includes at minimum a `game` field. The build pipeline
fails-fast on any file missing `game` (or with an unknown
value) so typos surface at index time, not at query time.

Required field:
- `game: wow | diablo | ff14`

Optional fields (passed through as chunk metadata; Phase 4 may
filter on these):
- `class` — string, e.g., `paladin`, `barbarian`, `dragoon`
- `spec` — string, e.g., `retribution`, `whirlwind`
- `topic` — string, e.g., `rotation`, `bis`, `leveling`,
  `mythic-plus`, `pvp`
- `source` — short string identifying where the human pulled
  the content from. e.g., `wowhead-manual`, `maxroll-manual`,
  `the-balance-discord`. NOT a URL — just a tag.
- `patch` — string, e.g., `'11.1'` (quote it so YAML doesn't
  cast to float and lose the trailing zero), `'season-32'`

Example:

```markdown
---
game: wow
class: paladin
spec: retribution
topic: rotation
source: wowhead-manual
patch: '11.1'
---

# Retribution Paladin — 11.1 Single-Target Rotation

## Opener

1. Pre-pot Tempered Potion of Power 2s before pull.
2. ...

## Steady-State Priority

- Wake of Ashes on cooldown
- ...
```

Body conventions:
- Use `## H2` and `### H3` for sections — these are the
  chunker's split boundaries
- Use `# H1` once for the file title (the chunker treats
  pre-H2 content as the "(intro)" chunk)
- Wikilinks (`[[some page]]` or `[[some page|display]]`) are
  fine — the chunker strips them since they're not portable
- Image embeds (`![[image.png]]` or `![alt](url)`) get dropped
  — embeddings can't see images and they pollute the chunk text

## 6. File contents

### 6.1 `src/config/env.ts` — add `VOYAGE_API_KEY`

Modify the existing zod schema:

```ts
const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  CHANNEL_GAME_MAP: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
  VOYAGE_API_KEY: z.string().min(1).startsWith('pa-'), // NEW
});
```

The `startsWith('pa-')` check catches paste-the-wrong-key
typos at boot. The runtime bot doesn't actually need the
Voyage key (only the build script does), but validating it
in the global env schema means a bot that "shouldn't need"
Voyage will still fail-fast at boot if the key is missing —
preferable to a Phase 4 surprise where retrieval silently
no-ops because the embed call has no key.

### 6.2 `src/rag/chunk.ts`

```ts
import matter from 'gray-matter';
import { GAMES, type Game } from '../types.js';

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  game: Game;
  source_file: string;
  heading_path: string;
  class?: string;
  spec?: string;
  topic?: string;
  source?: string;
  patch?: string;
}

const TARGET_WORDS = 350; // ~500 tokens for English (1 token ≈ 0.7 words)
const MIN_WORDS = 35; // ~50 tokens; below this drop the chunk
const SLACK_FACTOR = 1.3; // don't split a section that's only modestly oversized

/**
 * Pure function: markdown string + filename → array of embeddable chunks.
 *
 * - Parses frontmatter (gray-matter); throws if `game` is missing/invalid
 * - If the file lives under a known game folder (e.g. `kb/wow/...`),
 *   the frontmatter `game` MUST match the folder name — catches
 *   path/frontmatter mismatches at build time
 * - Strips Obsidian wikilinks `[[x]]` / `[[x|y]]`
 * - Drops image embeds (markdown + Obsidian syntax)
 * - Splits body on H2/H3 boundaries; further splits oversized sections
 *   on paragraph boundaries
 * - Drops chunks below MIN_WORDS
 * - Each chunk inherits frontmatter as metadata + a derived heading_path
 */
export function chunk(rawMd: string, sourceFile: string): Chunk[] {
  const { data: frontmatter, content } = matter(rawMd);

  const game = frontmatter.game;
  if (!isGame(game)) {
    throw new Error(
      `${sourceFile}: missing or invalid 'game' frontmatter (got ${JSON.stringify(game)}; must be wow | diablo | ff14)`,
    );
  }

  // sourceFile is the relative path from kb/ — glob always returns
  // forward-slash paths regardless of OS. If the first segment is a
  // known game, require it to match the frontmatter; if it isn't (e.g.
  // a top-level kb/foo.md), trust the frontmatter alone.
  const pathGame = sourceFile.split('/')[0];
  if (
    pathGame &&
    (GAMES as readonly string[]).includes(pathGame) &&
    pathGame !== game
  ) {
    throw new Error(
      `${sourceFile}: frontmatter says game: '${game}' but path implies '${pathGame}'. Either fix the frontmatter or move the file.`,
    );
  }

  const cleaned = stripObsidianSyntax(content);
  const sections = splitOnHeadings(cleaned);

  return sections
    .flatMap((section) => splitToTargetSize(section))
    .filter((s) => wordCount(s.text) >= MIN_WORDS)
    .map((s) => ({
      text: s.text,
      metadata: buildMetadata(frontmatter, sourceFile, s.headingPath),
    }));
}

function isGame(v: unknown): v is Game {
  return typeof v === 'string' && (GAMES as readonly string[]).includes(v);
}

function buildMetadata(
  frontmatter: Record<string, unknown>,
  sourceFile: string,
  headingPath: string,
): ChunkMetadata {
  const meta: ChunkMetadata = {
    game: frontmatter.game as Game,
    source_file: sourceFile,
    heading_path: headingPath,
  };
  // Pass through known optional string fields
  for (const key of ['class', 'spec', 'topic', 'source', 'patch'] as const) {
    const v = frontmatter[key];
    if (typeof v === 'string') meta[key] = v;
    else if (v !== undefined) meta[key] = String(v); // coerce e.g. patch numbers
  }
  return meta;
}

function stripObsidianSyntax(md: string): string {
  let s = md;
  // Image embeds first (before wikilinks, since ![[...]] would partially match)
  s = s.replace(/!\[\[[^\]]+\]\]/g, ''); // ![[image.png]]
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, ''); // ![alt](url)
  // Wikilinks with display text: [[page|display]] → display
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  // Bare wikilinks: [[page]] → page
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1');
  return s;
}

interface Section {
  text: string;
  headingPath: string;
}

function splitOnHeadings(md: string): Section[] {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let h2: string | null = null;
  let h3: string | null = null;
  let currentText: string[] = [];

  function flush() {
    const text = currentText.join('\n').trim();
    currentText = [];
    if (text.length === 0) return;
    const path = [h2, h3].filter(Boolean).join(' > ') || '(intro)';
    sections.push({ text, headingPath: path });
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      h2 = line.slice(3).trim();
      h3 = null;
    } else if (line.startsWith('### ')) {
      flush();
      h3 = line.slice(4).trim();
    } else if (line.startsWith('# ')) {
      // H1 = file title; treat content before first H2 as intro
      flush();
    } else {
      currentText.push(line);
    }
  }
  flush();
  return sections;
}

function splitToTargetSize(section: Section): Section[] {
  if (wordCount(section.text) <= TARGET_WORDS * SLACK_FACTOR) {
    return [section];
  }
  // Paragraph-aware split
  const paragraphs = section.text.split(/\n\n+/);
  const out: Section[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  for (const p of paragraphs) {
    const pw = wordCount(p);
    if (bufferWords + pw > TARGET_WORDS && buffer.length > 0) {
      out.push({ text: buffer.join('\n\n'), headingPath: section.headingPath });
      buffer = [p];
      bufferWords = pw;
    } else {
      buffer.push(p);
      bufferWords += pw;
    }
  }
  if (buffer.length > 0) {
    out.push({ text: buffer.join('\n\n'), headingPath: section.headingPath });
  }
  return out;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
```

Notes:

- **Word-count budget, not real tokenization.** Building a real
  tokenizer (or pulling in `tiktoken`) is overkill at our scale.
  English averages ~1.3 tokens per word, so ~350 words ≈ ~455
  tokens. Voyage's input limit per item is 32k tokens — we're
  not anywhere close to that ceiling.
- **30% slack** — if a section is just slightly oversized (say
  450 words for a 350 budget), don't split. Splitting mid-thought
  is worse than slightly long chunks for retrieval quality.
- **Heading path uses ` > ` separator.** Renders nicely in Phase
  4's source citations: `Opener > Phase 1`.

### 6.3 `src/rag/__tests__/chunk.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { chunk } from '../chunk.js';

describe('chunk', () => {
  describe('frontmatter', () => {
    it('throws on missing game', () => {
      const md = '---\nclass: paladin\n---\n\n## Body\n\nstuff';
      expect(() => chunk(md, 'test.md')).toThrow(/missing or invalid 'game'/);
    });

    it('throws on invalid game', () => {
      const md = '---\ngame: starcraft\n---\n\n## Body\n\nstuff';
      expect(() => chunk(md, 'test.md')).toThrow(/must be wow \| diablo \| ff14/);
    });

    it('passes through optional string fields as metadata', () => {
      const md = `---
game: wow
class: paladin
spec: retribution
topic: rotation
source: wowhead-manual
patch: '11.1'
---

## Opener

${'word '.repeat(50)}`;
      const chunks = chunk(md, 'wow/paladin-retribution.md');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.metadata).toMatchObject({
        game: 'wow',
        class: 'paladin',
        spec: 'retribution',
        topic: 'rotation',
        source: 'wowhead-manual',
        patch: '11.1',
        source_file: 'wow/paladin-retribution.md',
      });
    });
  });

  describe('path/frontmatter game match', () => {
    it('throws when path implies a different game than frontmatter', () => {
      const md = `---\ngame: diablo\n---\n\n## Body\n\n${'word '.repeat(40)}`;
      expect(() => chunk(md, 'wow/misfiled.md')).toThrow(
        /frontmatter says game: 'diablo' but path implies 'wow'/,
      );
    });

    it('accepts a file at top-level kb/ (no game folder)', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'general-tips.md');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.metadata.game).toBe('wow');
    });

    it('accepts a file under an unknown intermediate folder', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'archived/old-rotation.md');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.metadata.game).toBe('wow');
    });
  });

  describe('Obsidian syntax stripping', () => {
    it('strips bare wikilinks', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\nSee [[Wake of Ashes]] for details. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).toContain('See Wake of Ashes for details.');
      expect(chunks[0]!.text).not.toContain('[[');
    });

    it('strips wikilinks with display text', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\nUse [[Wake_of_Ashes|WoA]] early. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).toContain('Use WoA early.');
      expect(chunks[0]!.text).not.toContain('Wake_of_Ashes');
    });

    it('drops image embeds', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\n![[talents.png]]\n\nText after. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).not.toContain('talents.png');
      expect(chunks[0]!.text).toContain('Text after.');
    });

    it('drops standard markdown images', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\n![chart](https://example.com/chart.png)\n\nText. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).not.toContain('chart');
      expect(chunks[0]!.text).not.toContain('example.com');
      expect(chunks[0]!.text).toContain('Text.');
    });
  });

  describe('heading splits', () => {
    it('splits on H2 boundaries', () => {
      const md = `---\ngame: wow\n---\n\n## Opener\n\n${'word '.repeat(40)}\n\n## Steady State\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.metadata.heading_path).toBe('Opener');
      expect(chunks[1]!.metadata.heading_path).toBe('Steady State');
    });

    it('joins H2 + H3 into heading_path', () => {
      const md = `---\ngame: wow\n---\n\n## Opener\n\n### Phase 1\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.metadata.heading_path).toBe('Opener > Phase 1');
    });

    it('labels pre-H2 content as (intro)', () => {
      const md = `---\ngame: wow\n---\n\n# Title\n\nIntro paragraph. ${'word '.repeat(40)}\n\n## Section\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.metadata.heading_path).toBe('(intro)');
      expect(chunks[1]!.metadata.heading_path).toBe('Section');
    });
  });

  describe('size limits', () => {
    it('drops chunks below MIN_WORDS', () => {
      const md = `---\ngame: wow\n---\n\n## Tiny\n\nfew words here\n\n## Big\n\n${'word '.repeat(50)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.metadata.heading_path).toBe('Big');
    });

    it('splits oversized sections on paragraph boundaries', () => {
      const para = `${'word '.repeat(200)}`;
      const md = `---\ngame: wow\n---\n\n## Long\n\n${para}\n\n${para}\n\n${para}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks.length).toBeGreaterThan(1);
      // All chunks should share the heading_path
      for (const c of chunks) {
        expect(c.metadata.heading_path).toBe('Long');
      }
    });
  });
});
```

**Why the `!` non-null assertions on `chunks[N]`:** the project's
`tsconfig.json` has `noUncheckedIndexedAccess: true`, which makes
`chunks[0]` resolve to `Chunk | undefined` even after a length
assertion. Test files are compiled by `npm run build` (since
`tsconfig.build.json` includes `src/**/*` without excluding
`__tests__/`), so the strict-mode rule applies to them too. The
`!` tells TS "I just asserted length, this is defined." Cleaner
alternative would be to exclude `__tests__/` from
`tsconfig.build.json` — defer until we have a reason to touch
the Phase 1 config.

### 6.4 `src/rag/embed.ts`

```ts
import { VoyageAIClient } from 'voyageai';
import { env } from '../config/env.js';

const client = new VoyageAIClient({ apiKey: env.VOYAGE_API_KEY });
const MODEL = 'voyage-3-lite';
const MAX_BATCH_SIZE = 128; // Voyage's per-request input limit

/**
 * Embed an array of document texts. Used by the build pipeline.
 * Batches transparently to stay under Voyage's per-request limit.
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await client.embed({
      input: batch,
      model: MODEL,
      inputType: 'document',
    });
    for (const item of response.data ?? []) {
      if (!item.embedding) {
        throw new Error('Voyage returned an item without an embedding');
      }
      all.push(item.embedding);
    }
  }
  return all;
}

/**
 * Embed a single query. Used at /zz invocation time in Phase 4.
 * `inputType: 'query'` produces embeddings asymmetrically optimized
 * for retrieval against `inputType: 'document'` vectors above.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const response = await client.embed({
    input: [text],
    model: MODEL,
    inputType: 'query',
  });
  const first = response.data?.[0];
  if (!first?.embedding) {
    throw new Error('Voyage returned no embedding for query');
  }
  return first.embedding;
}
```

### 6.5 `src/rag/store.ts`

```ts
import { LocalIndex } from 'vectra';
import type { Chunk, ChunkMetadata } from './chunk.js';

export interface IndexedChunk extends Chunk {
  embedding: number[];
}

export interface SearchResult {
  text: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * Open the index at `indexPath`, creating it if missing.
 * `indexPath` is a directory; vectra creates `index.json` + items inside.
 */
export async function createOrLoadIndex(indexPath: string): Promise<LocalIndex> {
  const index = new LocalIndex(indexPath);
  if (!(await index.isIndexCreated())) {
    await index.createIndex();
  }
  return index;
}

/**
 * Insert chunks. Each chunk's text is stored alongside its metadata
 * so search results can reconstruct the chunk without a separate lookup.
 */
export async function addChunks(
  index: LocalIndex,
  chunks: IndexedChunk[],
): Promise<void> {
  for (const c of chunks) {
    await index.insertItem({
      vector: c.embedding,
      metadata: { ...c.metadata, text: c.text },
    });
  }
}

/**
 * Search by query embedding. Optional `filter` is a partial metadata
 * match — Phase 4 uses this with `{ game }` to scope retrieval to
 * the channel's configured game.
 */
export async function search(
  index: LocalIndex,
  queryEmbedding: number[],
  k: number,
  filter?: Partial<ChunkMetadata>,
): Promise<SearchResult[]> {
  const results = await index.queryItems(queryEmbedding, '', k, filter);
  return results.map((r) => {
    // `as unknown as` two-step cast: vectra types `metadata` as
    // Record<string, MetadataTypes>, which doesn't structurally
    // overlap with our ChunkMetadata enough for a direct cast
    // (TS2352). The runtime shape is correct because addChunks
    // only ever inserts ChunkMetadata-shaped objects.
    const meta = r.item.metadata as unknown as ChunkMetadata & { text: string };
    const { text, ...metadata } = meta;
    return { text, metadata, score: r.score };
  });
}
```

### 6.6 `scripts/build-kb.ts`

```ts
import { glob } from 'glob';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { chunk, type Chunk } from '../src/rag/chunk.js';
import { embedDocuments } from '../src/rag/embed.js';
import { addChunks, createOrLoadIndex } from '../src/rag/store.js';

const KB_ROOT = 'kb';
const INDEX_DIR = 'data/vectra';

async function main(): Promise<void> {
  // Wipe the existing index before rebuilding. Vectra's insertItem
  // appends — without this, every re-run would duplicate every chunk
  // into the index, over-weighting them at retrieval time. We rebuild
  // from scratch each time; idempotent in chunks-on-disk, not in
  // Voyage cost (free tier covers ~16k full rebuilds before paying).
  await rm(INDEX_DIR, { recursive: true, force: true });

  console.log(`Scanning ${KB_ROOT}/ for markdown files...`);
  const files = await glob('**/*.md', { cwd: KB_ROOT });
  if (files.length === 0) {
    console.error(`No markdown files found under ${KB_ROOT}/. Add some content first.`);
    process.exit(1);
  }
  console.log(`Found ${files.length} files.`);

  const allChunks: Chunk[] = [];
  for (const file of files) {
    const fullPath = path.join(KB_ROOT, file);
    const raw = await readFile(fullPath, 'utf-8');
    const chunks = chunk(raw, file);
    console.log(`  ${file}: ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    console.error('All files produced 0 chunks. Check that they have non-empty bodies.');
    process.exit(1);
  }
  console.log(`Total: ${allChunks.length} chunks across ${files.length} files`);

  console.log(`Embedding via Voyage (${allChunks.length} documents)...`);
  const embeddings = await embedDocuments(allChunks.map((c) => c.text));
  if (embeddings.length !== allChunks.length) {
    throw new Error(
      `Embedding count mismatch: ${embeddings.length} vectors for ${allChunks.length} chunks`,
    );
  }

  console.log(`Writing fresh index to ${INDEX_DIR}/...`);
  const index = await createOrLoadIndex(INDEX_DIR);
  await addChunks(
    index,
    allChunks.map((c, i) => ({ ...c, embedding: embeddings[i]! })),
  );

  // Per-game summary
  const byGame = new Map<string, number>();
  for (const c of allChunks) {
    byGame.set(c.metadata.game, (byGame.get(c.metadata.game) ?? 0) + 1);
  }
  console.log('Done. Chunk counts by game:');
  for (const [g, n] of byGame) {
    console.log(`  ${g}: ${n}`);
  }

  // Approximate cost: ~0.7 tokens per word, $0.02 per 1M tokens
  const totalWords = allChunks.reduce(
    (sum, c) => sum + c.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const approxTokens = Math.round(totalWords * 1.3);
  const approxCostUSD = (approxTokens / 1_000_000) * 0.02;
  console.log(
    `Approx ${approxTokens.toLocaleString()} tokens embedded (~$${approxCostUSD.toFixed(4)}).`,
  );
}

main().catch((err) => {
  console.error('build-kb failed:', err);
  process.exit(1);
});
```

### 6.7 `package.json` — add `build:kb` script

Add to the `scripts` block:

```json
"build:kb": "tsx scripts/build-kb.ts"
```

(`tsx` was added in Phase 1 and works for the existing
`register` script too.)

### 6.8 `.env.example` — add `VOYAGE_API_KEY`

Append:

```
# Voyage AI API key, starts with pa-. Get one at
# https://www.voyageai.com/. Free tier: 50M tokens — covers
# every KB rebuild we'd realistically do.
VOYAGE_API_KEY=
```

### 6.9 `data/.gitkeep`

Create an empty file at `data/.gitkeep` so the directory is
tracked even before the first `build:kb` run. The actual
vectra files (`data/vectra/index.json` + sub-files) get
committed alongside content commits — see §9 below.

### 6.10 Seed content

Before the first `build:kb` run can produce anything useful,
populate at least one file per game so the pipeline has
something to chunk + embed. The plan ships 4 stubs to verify
the pipeline; the user (or friends) expand from there as
ongoing maintenance.

Suggested initial files (full content authored manually —
see §10 for the per-game starter topic list):

- `kb/wow/paladin-retribution.md` — opener + steady-state
  rotation + 2-3 cooldown notes
- `kb/wow/paladin-protection.md` — opener + active mitigation
  priority + group utility
- `kb/diablo/barbarian-whirlwind.md` — paragon priority +
  skill loadout + key uniques
- `kb/ff14/paladin-rotation.md` — opener + 60s cycle + key
  oGCD priorities

Each ~200-400 words of real content with full frontmatter.
The agent that executes this phase scaffolds the files with
placeholder content marked `<!-- TODO: real content -->` so
the pipeline can verify end-to-end; the user replaces with
actual content as the first task after Phase 3 lands.

## 7. Local validation

1. **Build:** `npm run build && npm run typecheck && npm run lint && npm run format:check`
   — all green.
2. **Tests:** `npm test -- --run` — chunker tests pass.
3. **Run the build script:**
   - Populate `.env` with `VOYAGE_API_KEY`.
   - `npm run build:kb`
   - Expected output: per-file chunk counts, per-game summary,
     "Done." with approximate token/cost line.
   - Inspect `data/vectra/` — should contain `index.json` and
     vectra's internal storage. Total size should be small
     (~10s of KB for the seed content).
4. **Sanity-check the index** (optional):
   - Open `data/vectra/index.json` in an editor → confirm it
     has entries, each with a `vector` array (~512 floats) and
     `metadata` with `game`, `text`, `heading_path`.
5. **Confirm bot still works:**
   - `npm run dev` (with prod offline)
   - `/zz prompt: anything` should still return a Sonnet
     response — Phase 3 doesn't change runtime behavior, just
     adds offline tooling.

## 8. Commit + push (no Fly deploy needed)

Phase 3 is offline. The new `data/vectra/` index isn't read
at runtime until Phase 4 wires it into `/zz`. So no Fly deploy
yet — Phase 4's deploy will pick up everything Phase 3 added.

```
git add src/rag/ src/config/env.ts scripts/build-kb.ts
git add src/config/__tests__/channels.test.ts  # adds VOYAGE_API_KEY to existing test env setup
git add kb/ data/
git add package.json package-lock.json .env.example
git commit -F tmp/commit-msg.md
rm tmp/commit-msg.md
git push -u origin feat/v2-kb-pipeline
```

Note on `src/config/__tests__/channels.test.ts`: env.ts now
requires `VOYAGE_API_KEY`. The Phase 2 channels test sets
`process.env.ANTHROPIC_API_KEY = 'sk-ant-test'` in each test
before its dynamic `import('../channels.js')` to satisfy the
env-schema parse — Phase 3 mirrors that pattern by adding
`process.env.VOYAGE_API_KEY = 'pa-test'` alongside it.

Commit message:
```
feat: KB build pipeline (chunker + Voyage embed + vectra store + seed content)
```

## 9. Committing `data/vectra/` (the index files)

For Phase 3's seed content, the vectra index is small (well
under 1MB). **Commit it directly** — no LFS, no exclusion.
This means a fresh checkout has a working index without
needing to run `build:kb` first.

If/when the index outgrows ~10MB:
- First option: keep committing it but use Git LFS for the
  index files (one-time `.gitattributes` change to track
  `data/vectra/*.json` with LFS).
- Second option: gitignore `data/vectra/` and have the
  Dockerfile run `npm run build:kb` during the image build.
  Adds Voyage API cost per deploy (~$0.01 per build at
  current scale) and requires `VOYAGE_API_KEY` as a Fly
  secret. Defer until index growth actually demands it.

For Phase 3, just commit it and move on.

## 10. Per-game seed-content topic suggestions

Not part of the executable plan — these are starting points
for the user to author MD files against. Each item below is
a rough scope for one `.md` file.

**WoW (current TWW season):**
- `paladin-retribution` — single-target rotation, AoE rotation
- `paladin-protection` — active mitigation priority, M+ utility
- `paladin-holy` — healing rotation, mana management
- `warlock-affliction` — Malefic Rapture rhythm, soul shard usage
- `warlock-destruction` — Chaos Bolt windows
- `druid-feral` — bleed maintenance + Berserk windows
- `priest-discipline` — atonement rotation, Penance usage
- `general-keystones` — current season affixes + general M+ tips

**Diablo 4 (current season):**
- `barbarian-whirlwind` — paragon priority + uniques
- `barbarian-bash` — leveling alternative + endgame transition
- `sorceress-firewall` — current S-tier sorc build
- `necromancer-bone-spirit` — paragon + glyph priority
- `druid-pulverize` — paragon + aspects
- `general-paragon` — generic paragon-board guidance for any class

**FF14 (current expansion):**
- `paladin-rotation` — 60s cycle + key oGCDs
- `dragoon-rotation` — Geirskogul windows + positionals
- `dark-knight-rotation` — Delirium combo + party damage cycle
- `white-mage-rotation` — Lily windows + Lucid Dreaming
- `general-roulette-tips` — generic raid/duty tips for any role

User picks ~3-5 per game to author by hand for the initial seed.
Phase 4 testing will reveal which gaps to fill next. Phase 5
is the open-ended "expand the KB" phase.

## 11. Exit criteria (gate to Phase 4)

- [ ] `npm run typecheck && npm run lint && npm run format:check && npm test -- --run`
      all pass
- [ ] `npm run build` produces `dist/rag/chunk.js`,
      `dist/rag/embed.js`, `dist/rag/store.js`
- [ ] Seed `.md` files exist under `kb/<game>/` for at least
      WoW, Diablo, and FF14 (≥1 file per game)
- [ ] `npm run build:kb` runs end-to-end and prints per-game
      chunk counts
- [ ] `data/vectra/` exists and contains a populated index
- [ ] `data/vectra/` (or its files) committed to git
- [ ] Bot still serves `/zz` with the Phase 2 LLM behavior
      (no regression from the dependency additions)

## 12. Open questions (deferred to later phases)

- **Token-based chunking.** Word-count is a heuristic; it can
  occasionally over-pack a chunk that's heavy on short tokens
  (numbers, acronyms). If retrieval quality suffers in P4, swap
  the budget calc for `tiktoken` or Voyage's own `count_tokens`
  endpoint. Deferred.
- **Embedding cache.** Re-running `build:kb` re-embeds every
  chunk even if only one file changed. Could hash each chunk's
  text and skip re-embedding unchanged ones. At Voyage's free
  tier this isn't worth the complexity yet.
- **Multi-vector chunks.** Some retrieval research suggests
  embedding both the chunk text AND a hypothetical question
  for each chunk improves recall. Deferred — let's see if
  baseline RAG is good enough first.
- **Sparse + dense hybrid.** Vectra is dense-only. If recall
  on specific item names (BiS gear, ability names) is poor in
  P4 testing, consider adding a lightweight sparse index
  (e.g., MiniSearch over chunk text). Deferred.
- **Re-indexing on deploy.** Currently `data/vectra/` ships
  baked into the Docker image. If we move to dynamic build
  (per §9 second option), we'd want change detection so the
  Dockerfile only rebuilds when `kb/` changes. Deferred.
