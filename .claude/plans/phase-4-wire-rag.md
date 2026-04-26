# Phase 4 — Wire RAG retrieval into `/zz`

**Status:** Draft
**Parent plan:** `v2-rebuild.md`
**Depends on:** Phase 3 (KB build pipeline + chunker + embedder + vectra store all in place)
**Goal:** the bot's `/zz` slash command stops answering from
Sonnet's training data and starts answering from the
hand-authored KB. Channel determines game (Phase 1 wiring),
prompt gets embedded via Voyage (Phase 3 wrapper), top-K chunks
get retrieved from vectra scoped to that game (Phase 3 store),
context-stuffed into Sonnet (Phase 2 wrapper), reply is the
plain answer text (no sources footer / no citation rendering —
friends-server use case doesn't care about provenance). End
state: useful, grounded game answers.

---

## 1. Pre-flight

No new external dependencies. Same Anthropic + Voyage keys
from Phases 2/3. The KB index at `data/vectra/` must exist
locally and be committed to git (Phase 3 §9) so the Docker
image picks it up; if you've been iterating on KB content,
make sure the latest `npm run build:kb` output is committed
before deploying.

One small Discord-side check: the `/zz` slash command schema
isn't changing in this phase, so `npm run register` is NOT
needed. (Same as Phase 2.)

## 2. Branch

```
cd ~/Code/zugzugbot
git checkout master
git pull
git checkout -b feat/v2-wire-rag
```

## 3. Tooling

Nothing new. All deps from Phases 1-3.

## 4. Project structure (Phase 4 additions)

```
zugzugbot/
  src/
    rag/
      query.ts                    # NEW — embed + search orchestration
      store.ts                    # MODIFIED — add runtime singleton getter
      __tests__/
        query.test.ts             # NEW — vitest with mocked embed + store
    commands/
      zz.ts                       # MODIFIED — RAG flow (retrieve → context-stuff → complete)
    llm/
      prompts.ts                  # MODIFIED — drop the (intro)-fallback path,
                                  #            finalize buildSystemPromptWithContext
      __tests__/
        prompts.test.ts           # MODIFIED — add a few more context-variant tests
```

No new directories, no new env vars, no new third-party deps.

## 5. Architecture

### 5.1 The runtime data flow

When a user types `/zz prompt: how does ret pally open` in
`#wow`:

```
interaction.channelId
        │
        ▼
getGameForChannel()          (Phase 1 — already in src/config/channels.ts)
        │
        ▼  game = 'wow'
        │
        ▼
retrieve(prompt, { game, k: 5 })          (NEW — src/rag/query.ts)
        │
        ├── embedQuery(prompt)             (Phase 3 — src/rag/embed.ts)
        │       │
        │       ▼
        │   [number] (512 floats)
        │       │
        ├── search(index, embedding,       (Phase 3 — src/rag/store.ts)
        │         k, { game })
        │       │
        │       ▼
        │   SearchResult[]
        │
        ▼
contextChunks: SearchResult[]
        │
        ▼
buildSystemPromptWithContext(game, chunks)  (Phase 2 placeholder, finalized here)
        │
        ▼
complete(systemPrompt, userPrompt)          (Phase 2 — src/llm/anthropic.ts)
        │
        ▼
answer: string
        │
        ▼
truncateForDiscord(answer)                  (existing — caps at 2000 chars)
        │
        ▼
interaction.editReply(...)
```

### 5.2 Index loading lifecycle

`vectra`'s `LocalIndex` opens `data/vectra/index.json` from
disk. We want this to happen exactly once per process — eager
load at boot rather than per-query.

Approach: a module-level lazy singleton in `src/rag/store.ts`.
First call to `getRuntimeIndex()` opens the index and caches
the reference. Subsequent calls return the cached instance.
The bot doesn't need a separate "warm up" step — first `/zz`
query is a few hundred ms slower (one-time disk read of a
~1 MB JSON), then steady-state.

If the index doesn't exist at runtime (someone deployed without
committing `data/vectra/`), we want a hard fail at first query
with a clear error, NOT a silent fallback to non-RAG. Loose
behavior would mask "the bot has no knowledge" as "the bot is
running normally." Ship-stopping but not boot-blocking.

### 5.3 K (top-K) value

Default `k = 5`. Reasoning:

- Voyage `voyage-3-lite` produces 512-dim vectors. Cosine
  similarity is meaningful at low K.
- Each chunk averages ~350 words ≈ ~455 tokens. 5 chunks =
  ~2.3k tokens of context. Plus system prompt (~500 tokens)
  + user prompt (~50 tokens) + reserved output budget (1024)
  = well under Sonnet's 200k window.
- Empirically, 5 chunks gives the model enough variety to
  pick the most relevant facts without drowning it.
- Configurable later if we want; not exposed as a slash-command
  option in this phase (would clutter UX without clear benefit).

### 5.4 No sources footer / no user-facing citations

The reply is the plain answer text. We deliberately don't render
"📚 Sources: ..." or any other provenance affordance — friends
asking quick game questions in Discord don't need (or want) to
verify which file the answer came from. Keeps the reply tight,
fits Discord's 2000-char limit comfortably, no per-chunk
formatting code needed.

The system prompt still passes labeled `[Source N: ...]` blocks
to the model for its internal attribution (so when synthesizing
across multiple chunks, the model can disambiguate "this fact
from chunk 2, this from chunk 4" in its own reasoning). Whether
the model NAMES sources in its prose is up to it — we don't
encourage or forbid it. If you ever decide you do want
citations, they're a small follow-up: re-add a `formatReply()`
helper that consumes the chunks array and appends a footer.

## 6. File contents

### 6.1 `src/rag/store.ts` — add `getRuntimeIndex()`

Modify the existing file. Keep `createOrLoadIndex`,
`addChunks`, `search` exactly as they are (used by the build
script). Add a runtime singleton:

```ts
import { LocalIndex } from 'vectra';
import path from 'node:path';
import type { Chunk, ChunkMetadata } from './chunk.js';

// ... (existing code: createOrLoadIndex, addChunks, search) ...

const RUNTIME_INDEX_PATH = path.resolve(process.cwd(), 'data/vectra');

let runtimeIndexPromise: Promise<LocalIndex> | null = null;

/**
 * Returns the runtime vectra index, loading it on first call.
 * Subsequent calls return the cached instance.
 *
 * Hard-fails (rejects) if the index doesn't exist on disk —
 * we don't want to silently degrade to non-RAG behavior.
 */
export function getRuntimeIndex(): Promise<LocalIndex> {
  if (!runtimeIndexPromise) {
    runtimeIndexPromise = openOrThrow();
  }
  return runtimeIndexPromise;
}

async function openOrThrow(): Promise<LocalIndex> {
  const index = new LocalIndex(RUNTIME_INDEX_PATH);
  if (!(await index.isIndexCreated())) {
    throw new Error(
      `Vectra index missing at ${RUNTIME_INDEX_PATH}/. Did you run 'npm run build:kb' and commit data/vectra/?`,
    );
  }
  return index;
}
```

Notes:

- The promise is cached, NOT the resolved index. This means
  concurrent first-callers all await the same load (no
  race / double-load).
- `process.cwd()` is the repo root in dev (tsx) and `/app`
  in the Docker image. Both correct since `data/vectra/`
  ships at the same relative path.
- The error message names the build script — future-me reads
  the stack trace and immediately knows what to do.

### 6.2 `src/rag/query.ts` — new file

```ts
import { embedQuery } from './embed.js';
import { getRuntimeIndex, search, type SearchResult } from './store.js';
import type { Game } from '../types.js';

export interface RetrieveOpts {
  game: Game;
  k?: number;
}

const DEFAULT_K = 5;

/**
 * End-to-end retrieval: embed the user's prompt, search the
 * runtime index for top-K chunks scoped to the channel's game,
 * return the results.
 *
 * Phase 4 callers (the /zz handler) feed these into
 * buildSystemPromptWithContext + the Anthropic call.
 *
 * Errors propagate — caller's try/catch converts them to the
 * friendly Discord fallback.
 */
export async function retrieve(
  prompt: string,
  opts: RetrieveOpts,
): Promise<SearchResult[]> {
  const k = opts.k ?? DEFAULT_K;
  const [embedding, index] = await Promise.all([
    embedQuery(prompt),
    getRuntimeIndex(),
  ]);
  return search(index, embedding, k, { game: opts.game });
}
```

Notes:

- `Promise.all` overlaps the embed call (network) with the
  index open (disk), which is meaningful only on the very
  first query. On subsequent queries `getRuntimeIndex()`
  resolves synchronously from the cached promise.
- No telemetry / logging here. If a query fails, the caller
  logs + Sentry-captures (existing pattern from anthropic.ts).

### 6.3 `src/llm/prompts.ts` — finalize the context variant

The Phase 2 plan stubbed `buildSystemPromptWithContext`. It's
already shaped correctly. Two small revisions for Phase 4:

1. Pass through chunk metadata into the source label
   (`heading_path` + source-file hint) so the model can quote
   precisely if asked
2. Strengthen the "answer only from sources" instruction —
   real RAG systems leak training-data answers when this
   isn't crisp

Modify the existing function:

```ts
import type { Game } from '../types.js';
import type { SearchResult } from '../rag/store.js';

const GAME_NAMES: Record<Game, string> = {
  wow: 'World of Warcraft',
  diablo: 'Diablo 4',
  ff14: 'Final Fantasy XIV',
};

/**
 * System prompt for a question about a specific game with
 * NO retrieved context. Phase 4 still uses this when retrieval
 * returns 0 chunks — the model knows to say "I don't have info"
 * because of the explicit instruction.
 */
export function buildSystemPrompt(game: Game): string {
  const name = GAME_NAMES[game];
  return [
    `You are a knowledgeable ${name} expert helping friends in a Discord chat.`,
    `Keep answers concise (a few short paragraphs at most).`,
    `If the question is genuinely ambiguous, ask one clarifying question instead of guessing.`,
    `If you don't know something, say so plainly — don't make things up.`,
  ].join(' ');
}

/**
 * System prompt for a RAG-grounded question. Embeds the
 * retrieved chunks as labeled sources and instructs the model
 * to answer ONLY from them.
 *
 * If contextChunks is empty (retrieval found nothing matching
 * the query), returns the base prompt — the model will say
 * "I don't have info" per the no-fabrication instruction in
 * buildSystemPrompt.
 */
export function buildSystemPromptWithContext(
  game: Game,
  contextChunks: SearchResult[],
): string {
  if (contextChunks.length === 0) {
    return buildSystemPrompt(game);
  }
  const name = GAME_NAMES[game];
  const sourcesBlock = contextChunks
    .map((c, i) => {
      const label =
        c.metadata.heading_path && c.metadata.heading_path !== '(intro)'
          ? `${c.metadata.source_file} → ${c.metadata.heading_path}`
          : c.metadata.source_file;
      return `[Source ${i + 1}: ${label}]\n${c.text}`;
    })
    .join('\n\n');

  return [
    `You are a knowledgeable ${name} expert helping friends in a Discord chat.`,
    `Answer the user's question using ONLY the information in the sources below.`,
    `If the sources don't directly address the question, say so plainly — do not fall back to general knowledge or make assumptions.`,
    `Keep answers concise (a few short paragraphs at most).`,
    ``,
    `<sources>`,
    sourcesBlock,
    `</sources>`,
  ].join('\n');
}
```

Note: `SearchResult` is imported from `../rag/store.js`. This
introduces a one-way dependency: `llm/prompts.ts` → `rag/store.ts`.
Acceptable — prompts.ts is the orchestration layer between LLM
and retrieval, so it knows about both.

### 6.4 `src/commands/zz.ts` — wire the RAG flow

Replace the Phase 2 simple LLM call with the full retrieve →
context-stuff → complete → format-with-sources flow. Full new
file:

```ts
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  getGameForChannel,
  listMappedChannels,
} from '../config/channels.js';
import { complete } from '../llm/anthropic.js';
import { buildSystemPromptWithContext } from '../llm/prompts.js';
import { retrieve } from '../rag/query.js';
import type { Game } from '../types.js';

export const data = new SlashCommandBuilder()
  .setName('zz')
  .setDescription('Ask a game question (uses this channel as game context)')
  .addStringOption((opt) =>
    opt
      .setName('prompt')
      .setDescription('Your question')
      .setRequired(true)
      .setMaxLength(500),
  )
  .addStringOption((opt) =>
    opt
      .setName('game')
      .setDescription('Override the channel-derived game')
      .setRequired(false)
      .addChoices(
        { name: 'WoW', value: 'wow' },
        { name: 'Diablo 4', value: 'diablo' },
        { name: 'FF14', value: 'ff14' },
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  const prompt = interaction.options.getString('prompt', true);
  const gameOverride = interaction.options.getString('game') as Game | null;
  const game = gameOverride ?? getGameForChannel(interaction.channelId);

  if (!game) {
    await interaction.editReply(unmappedChannelHint());
    return;
  }

  try {
    const chunks = await retrieve(prompt, { game });
    const systemPrompt = buildSystemPromptWithContext(game, chunks);
    const answer = await complete(systemPrompt, prompt);
    await interaction.editReply(truncateForDiscord(answer));
  } catch (err) {
    console.error('[/zz] handler failed:', err);
    await interaction.editReply(
      "Couldn't get an answer this time. Try again in a sec.",
    );
  }
}

const DISCORD_MESSAGE_MAX = 2000;

function truncateForDiscord(text: string): string {
  if (text.length <= DISCORD_MESSAGE_MAX) return text;
  return text.slice(0, DISCORD_MESSAGE_MAX - 1) + '…';
}

function unmappedChannelHint(): string {
  const mapped = listMappedChannels();
  if (mapped.length === 0) {
    return "I'm not set up to answer questions in any channel yet. Pass `game:` to override.";
  }
  const channelList = mapped
    .map(({ channelId, game }) => `<#${channelId}> (${game})`)
    .join(', ');
  return `I'm not set up to answer questions in this channel. Try ${channelList}, or pass \`game:\` to override.`;
}
```

Notes vs Phase 2:

- The `try/catch` wraps the whole RAG-then-LLM chain. Any
  failure (Voyage error, vectra read error, Anthropic error)
  produces the same friendly fallback. Errors logged via
  `console.error` for `fly logs` debugging.
- No sources footer — see §5.4. The reply is just the answer
  text, truncated to Discord's 2000-char limit as a
  belt-and-suspenders guard.

### 6.5 `src/rag/__tests__/query.test.ts` — new file

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../embed.js', () => ({
  embedQuery: vi.fn(),
}));

vi.mock('../store.js', () => ({
  getRuntimeIndex: vi.fn(),
  search: vi.fn(),
}));

import { embedQuery } from '../embed.js';
import { getRuntimeIndex, search } from '../store.js';
import { retrieve } from '../query.js';

describe('retrieve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('embeds the prompt, opens the index, and searches with the game filter', async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3];
    const fakeIndex = { id: 'fake-index' } as unknown;
    const fakeResults = [
      {
        text: 'Wake of Ashes opener',
        metadata: {
          game: 'wow' as const,
          source_file: 'wow/paladin-retribution.md',
          heading_path: 'Opener',
        },
        score: 0.92,
      },
    ];
    vi.mocked(embedQuery).mockResolvedValue(fakeEmbedding);
    vi.mocked(getRuntimeIndex).mockResolvedValue(fakeIndex as never);
    vi.mocked(search).mockResolvedValue(fakeResults);

    const out = await retrieve('how does ret pally open', { game: 'wow' });

    expect(embedQuery).toHaveBeenCalledWith('how does ret pally open');
    expect(getRuntimeIndex).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith(fakeIndex, fakeEmbedding, 5, {
      game: 'wow',
    });
    expect(out).toEqual(fakeResults);
  });

  it('honors the k override', async () => {
    vi.mocked(embedQuery).mockResolvedValue([]);
    vi.mocked(getRuntimeIndex).mockResolvedValue({} as never);
    vi.mocked(search).mockResolvedValue([]);

    await retrieve('q', { game: 'diablo', k: 10 });

    expect(search).toHaveBeenCalledWith(expect.anything(), [], 10, {
      game: 'diablo',
    });
  });

  it('returns empty array when search finds no chunks', async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1]);
    vi.mocked(getRuntimeIndex).mockResolvedValue({} as never);
    vi.mocked(search).mockResolvedValue([]);

    const out = await retrieve('obscure question', { game: 'ff14' });

    expect(out).toEqual([]);
  });

  it('propagates errors from embedQuery', async () => {
    vi.mocked(embedQuery).mockRejectedValue(new Error('voyage 500'));
    vi.mocked(getRuntimeIndex).mockResolvedValue({} as never);

    await expect(retrieve('q', { game: 'wow' })).rejects.toThrow(/voyage 500/);
  });
});
```

### 6.6 `src/llm/__tests__/prompts.test.ts` — extend

Phase 2's tests already cover `buildSystemPrompt` and the
empty-context fallback. Add cases for the populated-context
variant:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildSystemPromptWithContext,
} from '../prompts.js';
import type { SearchResult } from '../../rag/store.js';

// ... (existing tests for buildSystemPrompt + the empty-context case)

describe('buildSystemPromptWithContext (with chunks)', () => {
  function makeChunk(
    text: string,
    sourceFile: string,
    headingPath: string,
  ): SearchResult {
    return {
      text,
      metadata: {
        game: 'wow',
        source_file: sourceFile,
        heading_path: headingPath,
      },
      score: 0.9,
    };
  }

  it('embeds chunk text in a sources block', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk(
        'Pre-pot Tempered Potion of Power 2 seconds before pull.',
        'wow/paladin-retribution.md',
        'Opener',
      ),
    ]);
    expect(prompt).toContain('<sources>');
    expect(prompt).toContain('Tempered Potion of Power');
    expect(prompt).toContain('paladin-retribution.md → Opener');
  });

  it('includes the no-fabrication instruction', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk('text', 'wow/x.md', 'Y'),
    ]);
    expect(prompt).toMatch(/answer.*using only the information in the sources/i);
    expect(prompt).toMatch(/do not fall back to general knowledge/i);
  });

  it('omits heading arrow when path is "(intro)"', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk('intro paragraph', 'wow/general.md', '(intro)'),
    ]);
    expect(prompt).toContain('wow/general.md');
    expect(prompt).not.toContain('wow/general.md →');
  });

  it('numbers multiple sources sequentially', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk('a', 'wow/x.md', 'Y'),
      makeChunk('b', 'wow/x.md', 'Z'),
      makeChunk('c', 'wow/y.md', 'Q'),
    ]);
    expect(prompt).toContain('[Source 1:');
    expect(prompt).toContain('[Source 2:');
    expect(prompt).toContain('[Source 3:');
  });
});
```

### 6.7 `README.md` — bump the status line + roadmap

Two small edits:

1. **Status paragraph** (~line 12): change

   > Phases 1, 2, and 3 complete. Slash command + Anthropic
   > LLM + KB build pipeline are all in place. Phase 4 (wire
   > RAG retrieval into the slash command) is the next piece
   > of work; until it lands, `/zz` answers from Claude
   > Sonnet's training data without grounding.

   to

   > Phases 1-4 complete. `/zz` answers from the hand-authored
   > KB via Voyage embeddings + vectra retrieval, scoped to
   > whichever game the channel is mapped to. Phase 5 is the
   > open-ended "expand the KB + tune retrieval" phase.

2. **Roadmap** section: change Phase 4's bullet from

   > **Phase 4** Wire RAG into `/zz` with channel-game scoping

   to

   > **Phase 4** ✅ Wire RAG into `/zz` with channel-game scoping

That's it — no new sections, no commands cheatsheet changes
(Phase 4 doesn't add npm scripts), no env-var changes (Phase 3
already added `VOYAGE_API_KEY`).

## 7. Local validation

1. **Build + lint + format + tests:**
   ```
   npm run build && npm run typecheck && npm run lint && npm run format:check && npm test -- --run
   ```
   All green.

2. **Make sure the index exists locally:**
   ```
   ls data/vectra/
   ```
   If empty, run `npm run build:kb` first (needs
   `VOYAGE_API_KEY`).

3. **Run the bot locally:**
   - `fly scale count 0 -a zugzug` (only one client per token)
   - `npm run dev`
   - Confirm `Ready! Logged in as ...`

4. **Hand-test 5-10 prompts per game:**
   - In `#wow`: `/zz prompt: how does ret pally open`. Expect a
     reply that references actual rotation steps from
     `kb/wow/paladin-retribution.md`. Sources footer should
     show the file + heading_path.
   - In `#wow`: `/zz prompt: what's the lore of ezran draelan`.
     Expect "I don't have info on that yet" or similar — your
     KB doesn't cover lore.
   - In `#diablo`: `/zz prompt: best whirlwind paragon priority`.
     Expect Diablo-grounded answer.
   - In `#general` (unmapped): `/zz prompt: hi`. Expect the
     "not set up here" hint.
   - In `#general` with override: `/zz prompt: hi game:wow`.
     Expect a WoW-grounded reply.
   - Force an error: temporarily rename `data/vectra/` to
     `data/vectra-disabled/`, restart `npm run dev`, run any
     `/zz`. Expect: console error mentioning the missing
     index, Discord shows the friendly fallback. Restore the
     directory when done.

5. **Stop the local bot.**

## 8. Deploy to Fly

```
git add src/rag/store.ts src/rag/query.ts src/rag/__tests__/query.test.ts
git add src/llm/prompts.ts src/llm/__tests__/prompts.test.ts
git add src/commands/zz.ts
git add README.md
git commit -m "feat: wire RAG retrieval into /zz with channel-game scoping"
git push -u origin feat/v2-wire-rag
fly deploy -a zugzug
fly logs -a zugzug
```

Watch for `Ready! Logged in as ...`. Smoke-test in the friends
server. The first `/zz` query is a few hundred ms slower than
subsequent ones (one-time disk read of `data/vectra/`).

If something's broken: `fly logs` shows the error. Roll back
with `fly releases -a zugzug && fly deploy --image <prev-id>`.

## 9. Exit criteria (gate to Phase 5)

- [ ] `npm run typecheck && npm run lint && npm run format:check && npm test -- --run`
      all pass
- [ ] `npm run build` produces `dist/rag/query.js`
- [ ] Bot deploys to Fly and connects to Discord
- [ ] `/zz` in `#wow` returns an answer whose substance comes
      from `kb/wow/*.md` content (verify by toggling a chunk's
      content and confirming the answer reflects the change)
- [ ] `/zz` in `#diablo` returns Diablo-grounded answers
- [ ] `/zz` in `#ff14` returns FF14-grounded answers
- [ ] `/zz prompt: <something not in KB>` produces "I don't
      have info" or similar — does NOT fabricate
- [ ] `game:` override works from any channel
- [ ] Forced index-missing failure produces the friendly
      Discord fallback + a clear error in `fly logs`
- [ ] Voyage usage shows up on console.anthropic.com (well,
      voyageai.com) — confirms real embedding traffic

## 10. Open questions (deferred to Phase 5+)

- **Class/spec scoping.** Right now retrieval filters only on
  `game`. Chunks have `class`/`spec`/`topic` metadata too —
  worth filtering on those if quality suffers (e.g., a paladin
  question surfaces warlock chunks). Defer until P4 hand-test
  reveals whether it's needed.
- **Per-game system prompts.** Currently one system prompt
  shape across all games. If Sonnet's voice/quality varies
  noticeably between games, customize per-game. Defer to P5
  along with KB expansion.
- **Hybrid search (sparse + dense).** Vectra is dense-only.
  If retrieval misses on specific item names (e.g., "Wake of
  Ashes" doesn't surface a chunk that mentions it), consider
  adding a lightweight sparse layer (MiniSearch over chunk
  text, blend with vector scores). Defer.
- **Multi-game queries.** `/zz` strictly scopes to one game.
  "Compare WoW paladin to FF14 paladin" gets half an answer.
  Acceptable — would need a routing pre-step to handle.
- **Caching.** Same prompt + game from two friends back-to-back
  costs two Sonnet calls. Small in-memory LRU could halve cost
  in cluster moments. Defer until usage volume actually feels
  bursty.
- **Streaming.** Discord supports message edits, so we *could*
  stream Sonnet output. Skipped — the latency gain is small,
  the implementation is fiddly, and friends are fine with
  "thinking..." for ~3-5 seconds.
- **Sources footer / citations.** Deliberately not in scope per
  §5.4 — friends-server use case doesn't need provenance. If
  this changes (e.g., you ever want to expose the bot beyond
  the friends server), the system prompt already passes
  `[Source N: ...]` labels to the model, so adding a
  `formatReply()` helper that appends a footer is small.
