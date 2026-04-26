# Zug Zug Bot v2 — TypeScript + Slash Commands + Multi-Game RAG

**Status:** Draft (rev 2 — multi-game + Obsidian authoring)
**Owner:** John (personal hobby project)
**Target deployment:** existing Fly.io app, in place

---

## 1. Why rebuild

The current `src/bot.js` is ~50 lines of JS that pipes whatever
the user typed straight into OpenAI GPT-5. It works, but:

- **No grounding.** The model answers from training-data WoW
  knowledge, which is patchy and out-of-date (10.x vs 11.x talents,
  TWW season changes, etc.). Friends ask "what's BiS for ret in 11.1"
  and get plausible-but-wrong answers.
- **No command surface.** Anyone tagging the bot triggers an LLM call.
  No way to scope queries (e.g., "answer only from paladin KB"),
  no argument parsing, no Discord-side validation.
- **WoW only.** The bot was named for and scoped to WoW questions.
  But the friends server has dedicated channels for Diablo 4 and
  FF14 too, and those communities want the same kind of grounded
  Q&A bot.
- **JavaScript.** Easy to bootstrap, but the v2 surface (RAG,
  multiple games, typed message contracts) benefits a lot from
  TS + strict mode.

The goal is a small, well-shaped TypeScript codebase that grounds
answers in a manually-authored local knowledge base, supports
multiple games via channel-aware routing, exposes one clean slash
command, and continues to run on the same Fly.io app so the
friends-server bot identity doesn't change.

## 2. Goals (in scope)

- Rewrite in TypeScript with `strict` mode.
- Replace prefix/mention triggers with a single `discord.js` v14
  slash command: `/zz <prompt>` (with optional `game:` override).
- Switch the LLM from OpenAI GPT-5 → Anthropic Claude Sonnet 4.6.
- Add a RAG layer: Voyage `voyage-3-lite` embeddings → `vectra`
  in-memory vector store → top-K retrieval (filtered by game) →
  context-stuffed prompt → Anthropic completion.
- **Multi-game from day one:** WoW, Diablo 4, FF14. Each game has
  its own KB partition under `kb/<game>/`. The Discord channel the
  command was invoked in determines the game (configurable map).
- **KB authored manually**, no automated fetcher. Drop `.md` files
  with YAML frontmatter into `kb/<game>/` (directly, or via Obsidian
  treating `kb/` as a vault). Build script chunks + embeds whatever
  exists. Adding a new game = make a folder, write content, add a
  channel mapping.
- Migrate the existing Fly.io deployment in place. Same app name,
  same Discord bot identity. No new bot registration.

## 3. Non-goals

- **No public release.** Friends-server only. The "personal use"
  envelope around manually-copied third-party guide content
  (Wowhead, Maxroll, The Balance, Icy-Veins, etc.) depends on this
  staying private. If we ever wanted to share it, we'd need to
  revisit content sourcing entirely.
- **No automated content fetcher.** No crawler, no build-time URL
  scraper, no `r.jina.ai` integration. The KB is hand-authored
  markdown. (We can always add an `npm run fetch:url` developer
  convenience script later if it would help bootstrap a new
  topic.)
- **No multi-server / multi-tenant.** One bot, one server, one
  channel-to-game map.
- **No image generation, voice, or other modalities.** Text Q&A only.
- **No fine-tuning.** Sonnet + RAG is the entire strategy.
- **No web UI / dashboard.** Discord is the only surface.

## 4. Architecture decisions

### 4.1 LLM: Anthropic Claude Sonnet 4.6

Sonnet is the right balance of speed/cost/quality for "answer from
provided context" tasks. Opus is overkill (and slow); Haiku
struggles with the 8-12k-token context windows we'll be stuffing.
Switch model only with deliberate intent.

Model ID: `claude-sonnet-4-6`. Anthropic SDK: `@anthropic-ai/sdk`.

### 4.2 Embeddings: Voyage `voyage-3-lite`

Voyage is Anthropic's recommended embedding partner and is priced
on par with OpenAI per-1M tokens. Using Voyage instead of OpenAI
also avoids depending on two separate API keys for two different
LLM vendors.

### 4.3 Vector store: `vectra`

`vectra` is an in-memory + JSON-on-disk vector store. Sized
comfortably for <50k chunks, well above what a manually-authored
multi-game KB needs (probably 1k-5k chunks per game, so ~5-15k
total at full coverage).

If the KB grows past ~50k chunks (unlikely without expanding way
beyond the original scope), swap to LanceDB. The retrieval
interface (`store.search(embedding, k, filter)`) hides this
detail; only `src/rag/store.ts` would change.

### 4.4 Multi-game via channel-aware routing

Each game has its own KB partition: `kb/wow/`, `kb/diablo/`,
`kb/ff14/`. The build script tags every chunk with
`metadata.game = <directory name>`.

At command time, the bot reads `interaction.channelId`, looks it
up in a channel-to-game map, and passes `{ game }` as a retrieval
filter to `store.search(...)` so only chunks from the matching
game are returned.

The map lives in two possible places:

- **`src/config/channels.ts`** — a `Record<string, Game>` literal,
  checked into git. Simplest, but channel IDs leak into source
  control.
- **`CHANNEL_GAME_MAP` env var** — a JSON string parsed at boot.
  Keeps channel IDs out of git, easier to update without a
  redeploy (just `fly secrets set` + restart).

Default to the env var approach for v2. Channel IDs are not
secrets per se, but they're personal infrastructure metadata and
keeping them out of the public repo is hygienic.

If a command is invoked in a channel with no mapping, the bot
replies with: `"I'm not set up to answer questions in this
channel. Try #wow, #diablo, or #ff14."`

The `game:` argument on `/zz` overrides the channel-derived game,
so a user in #general can still ask `/zz game:wow how does
divine purpose proc`.

### 4.5 Content sourcing: manually authored, Obsidian-friendly

KB content is hand-written or hand-copied into `.md` files under
`kb/<game>/`. Sources we'll typically draw from:

- **WoW:** Wowhead guides, Method/Liquid VOD notes, official
  patch notes
- **Diablo 4:** Maxroll, Mobalytics, Icy-Veins
- **FF14:** The Balance (Discord-server-derived guides),
  Icy-Veins, Mr. Happy patch reviews

For each source, the workflow is: read the article → distill into
markdown → save under `kb/<game>/<topic>.md` with frontmatter →
commit. No automated scraping.

**Obsidian as the authoring layer.** The `kb/` directory is also a
valid Obsidian vault. Use Obsidian for:

- Backlinks + graph view to see how topics connect
- Daily notes for "today's patch impressions" entries
- Mobile capture (Obsidian mobile app) for jotting things down
  while playing
- The Obsidian Git plugin for committing/pushing without leaving
  the editor
- Templates for new-class / new-build / new-encounter entries

The bot has zero dependency on Obsidian — it just reads `.md`
files. But authoring there is much nicer than raw markdown in
VS Code.

### 4.6 Frontmatter as chunk metadata

Every `.md` file starts with YAML frontmatter:

```markdown
---
game: wow
class: paladin
spec: retribution
topic: rotation
source: wowhead-manual
patch: '11.1'
---

# Retribution Paladin Rotation

## Opener
...
```

The build script parses frontmatter (via `gray-matter` or similar)
and applies every key as chunk metadata. `game` is required;
everything else is optional. Frontmatter values become retrieval
filters in `store.search(...)`, so we can scope by class, spec,
topic, etc., on top of game.

For v2 we only actively filter on `game` (channel-derived). The
extra metadata is "free" and we can build a `class:` filter
argument later if quality demands it.

### 4.7 Slash commands

discord.js v14 + `SlashCommandBuilder`. Commands are registered
once (or whenever the schema changes) via
`scripts/register-commands.ts`. The bot process only handles the
`InteractionCreate` event — no `messageCreate` listener at all.

Single command for v2:

```
/zz prompt:<string> game:<wow|diablo|ff14>?
```

- `prompt` (required) — the user's question
- `game` (optional) — overrides the channel-derived game; useful
  for cross-channel queries

Behavior:

1. `await interaction.deferReply()` immediately (Discord 3s timeout).
2. Determine game: explicit `game:` arg > channel-mapping lookup.
   If neither resolves, edit reply with the friendly fallback.
3. Embed the prompt via Voyage.
4. `store.search(embedding, k=5, { game })` to retrieve top-K
   chunks scoped to the chosen game.
5. Build context string from chunks (frontmatter heading +
   content + source).
6. Call `llm.anthropic.complete(systemPrompt, contextStuffedPrompt)`.
7. `interaction.editReply(answer + sourcesFooter)`.

**No `/zz-class`, `/zz-spec`, etc., for v2.** Class/job/build names
vary across games (WoW: paladin, Diablo: barbarian, FF14: dragoon)
so a single typed enum doesn't fit. The LLM should be able to pick
the right scope from the prompt + retrieved chunks. If retrieval
quality is poor in practice, we can add per-game scope commands
in v3.

### 4.8 Hosting: keep Fly.io, in-place

The bot already runs on Fly.io with the friends-server registration
tied to its identity. Migrating off Fly would require re-registering
and re-onboarding. Not worth it. The existing `fly.toml` and
`Dockerfile` stay; `Dockerfile` likely needs a TS build step added
(e.g., `RUN npm run build` producing `dist/`).

`data/vectra.json` ships **with the image** for v2 (it's small,
maybe 5-20 MB even with all three games covered). This means
rebuilding the KB requires a redeploy, which is fine for the
manually-authored workflow. If the KB ever becomes too large to
bake into the image, we'd attach a Fly volume and copy the JSON
in on first boot — but that's a follow-up, not v2.

## 5. Repository structure

See `.claude/CLAUDE.md` § "Repository Structure (v2 target)" for
the full tree. Key directories:

- `src/commands/zz.ts` — the single slash command, exporting
  `{ data, execute }`.
- `src/rag/` — pure-ish modules: `chunk` (frontmatter + wikilink
  + heading-aware), `embed` (Voyage), `query` (orchestration),
  `store` (vectra wrapper).
- `src/llm/` — Anthropic SDK wrapper + prompt templates.
- `src/config/channels.ts` — channel ID → game mapping helper
  (reads `CHANNEL_GAME_MAP` env var, validates with zod).
- `scripts/build-kb.ts` — walks `kb/<game>/`, parses frontmatter,
  chunks, embeds, writes vectra.json.
- `kb/<game>/...md` — manually-authored content. Doubles as an
  Obsidian vault.

## 6. Implementation phases

Each phase should land as a single PR on `feat/v2-typescript-rag`
and leave the bot deployable (even if some commands are stubs).
The old `bot.js` keeps running on Fly until the very last cutover.

### Phase 1 — TS scaffold + Discord client

- `package.json` with TS, eslint, prettier, vitest.
- `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`.
- `src/index.ts` boots a discord.js v14 client, logs in with
  `BOT_TOKEN`, registers an `InteractionCreate` handler that
  routes by `interaction.commandName`.
- `scripts/register-commands.ts` registers `/zz` with a no-op
  response ("not implemented yet").
- `src/config/env.ts` + `src/config/channels.ts` validate env
  vars with zod (including `CHANNEL_GAME_MAP` shape).
- Verify on Fly with the new Docker image — bot connects,
  `/zz` appears in the friends server, replies with the
  placeholder. No KB, no LLM yet.

**Exit criteria:** new bot image runs (replacing old `bot.js`
since we're keeping the same Fly app), `/zz` works as a stub,
mention-replies stop working (intended cutover behavior).

### Phase 2 — LLM wrapper + naïve `/zz`

- `src/llm/anthropic.ts` — thin wrapper around the SDK,
  `complete(systemPrompt, userPrompt): Promise<string>`. No
  streaming for v2.
- `src/llm/prompts.ts` — system prompt that frames the bot as a
  game-knowledge expert answering from provided context, plus
  the context-stuffing template (used in Phase 4).
- Wire `/zz` to call the LLM **without** RAG yet — system prompt
  + user prompt only. Channel mapping resolves and is logged but
  not yet used to filter retrieval.
- Test in friends server.

**Exit criteria:** `/zz <anything>` produces a Sonnet response in
under 10s, errors gracefully on API failure.

### Phase 3 — KB build pipeline (manual content + frontmatter)

- Author seed content. Roughly 5-10 markdown files per game to
  start, covering the most-asked topics (rotations, BiS,
  leveling tips). Each file has full frontmatter.
- `src/rag/chunk.ts` — pure function `chunk(rawMd: string,
  filePath: string): Chunk[]`:
  1. Parse frontmatter (`gray-matter`).
  2. Strip Obsidian wikilinks (`[[text]]` → `text`).
  3. Drop image embeds (`![[...]]` and `![alt](url)`).
  4. Split body on `##` and `###` boundaries.
  5. Target ~500 tokens per chunk; drop chunks under 50 tokens.
  6. Each chunk inherits the file's frontmatter as `metadata`,
     plus a derived `heading_path` (e.g., `"Opener > Phase 1"`).
- `src/rag/embed.ts` — Voyage SDK wrapper.
- `src/rag/store.ts` — vectra wrapper, `index(chunks)` and
  `search(queryEmbedding, k, filter?)`. `filter` matches against
  chunk metadata (any key from frontmatter).
- `scripts/build-kb.ts`:
  1. `glob('kb/**/*.md')`
  2. For each file: read → `chunk()` → batch-embed via Voyage →
     accumulate.
  3. Write `data/vectra.json`.
- Run `npm run build:kb` locally, commit `data/vectra.json`
  (TBD whether to use Git LFS — defer until the file actually
  gets big).

**Exit criteria:** `data/vectra.json` exists and contains
embeddings for all seed `.md` files across all 3 games.
`vitest` covers the chunker (frontmatter parsing, wikilink
stripping, heading splits). Bot still works as in Phase 2 (RAG
not wired in yet).

### Phase 4 — Wire RAG into `/zz` with channel-game scoping

- `src/rag/query.ts` — `retrieve(prompt: string, opts:
{ game: Game, k?: number }): Promise<Chunk[]>`. Embeds the
  prompt, calls `store.search(embedding, k, { game })`,
  returns top-K.
- `src/config/channels.ts` — `getGameForChannel(channelId:
string): Game | null` (reads `CHANNEL_GAME_MAP`).
- `/zz` flow:
  1. Resolve game: `interaction.options.getString('game')` or
     `getGameForChannel(interaction.channelId)`.
  2. If no game: edit reply with the "not set up here" message.
  3. `retrieve(prompt, { game, k: 5 })`.
  4. Build context string from chunks (heading_path +
     content + source).
  5. Call Anthropic.
  6. Reply with answer + "Sources:" footer listing source
     fields from frontmatter.
- System prompt instructs the model to answer **only from the
  provided context** and to say "I don't have info on that" if
  the context doesn't cover it.

**Exit criteria:** `/zz` in #wow gives WoW-grounded answers;
`/zz` in #diablo gives Diablo-grounded answers; `/zz game:ff14
...` from any channel gives FF14-grounded answers. Quality-check
5-10 prompts per game by hand.

### Phase 5 — KB expansion + tuning

- Expand each game's KB to comprehensive coverage (every class
  / spec / job, all current-season raids/dungeons/seasons).
- Iterate on chunking heuristics (token target, overlap,
  whether to keep frontmatter in each chunk's text body) based
  on bad answers.
- Iterate on K (top-K count) and the system prompt.
- If retrieval quality is poor and the LLM keeps mixing up
  classes within a game (paladin answer references warlock
  chunks), add a `class:` argument that applies an additional
  filter.

This phase is open-ended and continues forever. The bot is
"shipped" after Phase 4; Phase 5 is ongoing maintenance.

## 7. Channel-game configuration

The `CHANNEL_GAME_MAP` env var is a JSON string:

```
CHANNEL_GAME_MAP='{"123456789012345678":"wow","234567890123456789":"diablo","345678901234567890":"ff14"}'
```

Channel IDs come from right-clicking a Discord channel with
Developer Mode enabled.

`src/config/channels.ts` validates the parsed map at boot via
zod (every value must be one of `wow | diablo | ff14`) and
fails fast if the JSON is malformed.

## 8. Slash command UX

```
/zz prompt:<string>
  → "Best opener for ret pally?" (in #wow)
    → multi-paragraph answer, sources footer

/zz prompt:<string> game:wow
  → "Best opener for ret pally?" (from #general)
    → same answer

/zz prompt:<string>
  → (in #general, no override)
    → "I'm not set up to answer questions in this channel. Try
       #wow, #diablo, or #ff14, or use the `game:` argument."
```

Defer interaction within 3s, then `editReply` with the actual
answer:

```ts
await interaction.deferReply();
const answer = await runRag(...);
await interaction.editReply(answer);
```

Error handling: if any step throws, `editReply` with a friendly
fallback ("Couldn't get an answer this time, try again in a
sec"). Errors logged to console (Fly captures stdout) but not to
the user.

## 9. Migration safety

- Build v2 entirely on `feat/v2-typescript-rag`. Never touch
  `main` until the final cutover.
- The cutover is a single Fly deploy from the rebuild branch.
  Once deployed, the old `bot.js` is gone and the slash command
  is live. There's no graceful overlap because we're keeping the
  same Fly app and bot identity.
- **Pre-cutover validation:** run the v2 bot locally against the
  friends server for at least one evening of hand-testing across
  all 3 game channels. This requires temporarily pointing the
  local bot at the same `BOT_TOKEN` (which means the prod bot
  must be stopped during local testing). Coordinate with friends.
- **Rollback:** if cutover breaks something, revert the merge
  commit on `main`, redeploy. The old `bot.js` is still in git
  history at the pre-rebuild commit.

## 10. Testing

- **vitest:**
  - chunker (frontmatter parsing, wikilink stripping, image
    drop, heading splits, token counts, metadata propagation)
  - prompt builder (context-stuffing template produces the
    expected string)
  - config loader (zod errors on missing env vars, malformed
    `CHANNEL_GAME_MAP`)
  - channel resolver (`getGameForChannel` returns the right
    enum or `null`)
- **Don't test:** the Anthropic SDK wrapper, the Voyage SDK
  wrapper, vectra. SDK fixtures, not behavior we own.
- **Hand-test in Discord:** RAG quality across all 3 game
  channels. There's no reasonable automated eval for "does the
  answer match what a player would expect?" — that's the friends
  in the server.

## 11. Cost estimates

Personal-scale, ballpark per month, with friends across all
3 channels:

- Sonnet: ~$3/M input + $15/M output. With ~5k input tokens per
  query and ~500 output tokens, ~$0.022 per query. 200
  queries/month across all games = $4.40.
- Voyage embeddings: $0.02/M input tokens. KB build is one-time
  per rebuild (~150k tokens for full 3-game KB = $0.003).
  Per-query embeddings (~50 tokens) negligible.
- Fly.io: existing free-tier or $5/month plan, no change.

Total: well under $15/month at expected friends-server volume.

## 12. Open questions

- **vectra.json size at scale.** If the multi-game KB grows past
  ~50 MB, baking into the Docker image gets expensive (slow
  deploys). Probably not a v2 problem.
- **Per-game system prompts.** Should the system prompt vary by
  game (e.g., "You are a WoW expert" vs "You are a Diablo
  expert")? Probably yes for tone/voice; defer until Phase 4
  testing reveals whether one general prompt works.
- **Cache.** Should we cache `(prompt, game) → answer` so repeat
  questions are free? Probably not in v2 — friends ask follow-ups
  more than identical questions.
- **Streaming.** Discord supports message edits, so we *could*
  stream by editing the deferred reply every N tokens. Skipped
  for v2 — Sonnet is fast enough that the latency wins are small
  and the implementation is fiddly.
- **Cross-game queries.** `/zz` strictly scopes to one game. If
  someone asks "compare WoW paladin to FF14 paladin" they'd get
  half the answer. Acceptable for v2; would need a routing
  pre-step to handle properly.
- **Obsidian-only sync.** If we lean heavily on Obsidian, do we
  want to set up the Obsidian Git plugin for one-click commits?
  Optional QoL, defer until the manual-commit cycle annoys us.

## 13. References

- `.claude/CLAUDE.md` — project conventions, tech stack, repo
  structure, frontmatter schema
- discord.js v14 docs:
  https://discord.js.org/docs/packages/discord.js/14.x
- Anthropic SDK: https://docs.anthropic.com/en/api/client-sdks
- Voyage AI: https://docs.voyageai.com/
- vectra: https://github.com/Stevenic/vectra
- gray-matter (frontmatter parsing):
  https://github.com/jonschlinkert/gray-matter
- Obsidian: https://obsidian.md/
- Obsidian Git plugin: https://github.com/denolehov/obsidian-git
