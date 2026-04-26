# Zug Zug Bot

A small, hobby-grade Discord bot for a private friends server. Answers
game questions (rotations, BiS, builds, leveling, etc.) using
Retrieval-Augmented Generation against a curated local knowledge base.

Multi-game from v2 onward: WoW, Diablo 4, FF14. The bot routes each
question to the correct game's KB partition based on which Discord
channel the command was invoked in (we have a `#wow` channel, a
`#diablo` channel, and a `#ff14` channel; the channel-to-game map
lives in config).

The current production bot at `src/bot.js` is a 50-LOC JavaScript script
that pipes prompts straight to OpenAI GPT-5 — WoW only, mention-triggered.
The v2 rebuild (planned in `.claude/plans/v2-rebuild.md`) replaces it
with a TypeScript + slash-command + multi-game RAG architecture while
preserving the bot's existing Fly.io deployment identity so the
friends-server registration doesn't change.

## Tech Stack (v2)

- **Language:** TypeScript with `strict` mode (no `any`, no implicit any)
- **Discord:** `discord.js` v14 with `SlashCommandBuilder` for declared
  application commands. **No prefix-matching.**
- **LLM:** Anthropic SDK (`@anthropic-ai/sdk`) targeting Claude Sonnet 4.6
  (`claude-sonnet-4-6`). Switch model only with deliberate intent — Sonnet
  is the right balance of speed/cost/quality for "answer-from-context"
  tasks.
- **Embeddings:** Voyage AI `voyage-3-lite` for KB vectors. Same
  per-1M-token cost as OpenAI; recommended by Anthropic for use with
  Claude.
- **Vector store:** `vectra` (in-memory + JSON file on disk).
  Sized for <50k chunks; replace with LanceDB if the KB outgrows that.
- **KB content:** human-authored markdown under `kb/<game>/...md`.
  No automated URL fetcher in v2. Author either directly in the
  repo or via Obsidian (the `kb/` directory doubles as an Obsidian
  vault). YAML frontmatter on each file supplies chunk metadata
  (`game`, `topic`, `class`, `source`, `patch`, etc).
- **Lint/format:** ESLint + Prettier, project-bedtime defaults.
- **Hosting:** Fly.io (existing `fly.toml` + `Dockerfile`). Migrate
  in-place — same app name, same Discord bot identity.

## Repository Structure (v2 target)

```
zugzugbot/
  .claude/
    CLAUDE.md
    plans/
      v2-rebuild.md
  src/
    index.ts              # Discord client + command routing
    commands/
      zz.ts               # /zz <prompt> [game?] — channel-scoped Q&A
    rag/
      embed.ts            # Voyage SDK wrapper
      chunk.ts            # MD chunker (frontmatter parser, wikilink stripper,
                          #             H2/H3 splitter)
      query.ts            # query → top-K → context-stuffing (filter by game)
      store.ts            # vectra wrapper
    llm/
      anthropic.ts        # Anthropic SDK wrapper
      prompts.ts          # system prompts + answer-from-context template
    config/
      channels.ts         # Discord channel ID → game mapping
      env.ts              # env validation (zod)
  scripts/
    build-kb.ts           # walk kb/, parse frontmatter, chunk, embed → vectra.json
    register-commands.ts  # one-shot: register slash commands with Discord
  kb/                     # ALSO an Obsidian vault — same directory
    wow/
      paladin-retribution.md
      paladin-protection.md
      ...
    diablo/
      barbarian-whirlwind.md
      ...
    ff14/
      dragoon-opener.md
      ...
  data/
    vectra.json           # the local vector store (gitignored OR LFS)
  .env.example            # ANTHROPIC_API_KEY, VOYAGE_API_KEY, BOT_TOKEN,
                          # CHANNEL_GAME_MAP (JSON)
  Dockerfile              # already exists, may need TS build step added
  fly.toml                # already exists, no changes expected
  package.json
  tsconfig.json
```

### KB file format

Every `.md` file under `kb/` has YAML frontmatter that supplies
chunk metadata:

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

The build script reads frontmatter + applies it to every chunk
extracted from the file. `game` is required; everything else is
optional and used as a metadata filter at retrieval time. Obsidian
wikilinks (`[[some page]]`) are stripped at chunk time since they're
vault-internal and not useful to the LLM.

## Coding Conventions

- **One module = one responsibility.** `embed.ts` knows about Voyage,
  nothing else does. Same for `anthropic.ts`. Don't pass the SDK
  client around the codebase.
- **Pure functions where possible.** `chunk(md: string): Chunk[]`
  shouldn't read files or hit APIs.
- **Errors:** throw `Error` with descriptive messages. Top-level
  Discord handler catches + replies with a friendly fallback. Don't
  swallow errors silently anywhere.
- **No comments unless they explain WHY.** TS types document WHAT.
- **Tests:** vitest. Cover the chunker, the prompt builder, and the
  config loader. Don't test the SDK wrappers — that's testing
  fixtures, not behavior.

## Branching + Deployment

- Default branch: `main`.
- Rebuild on a `feat/v2-typescript-rag` branch. Old `bot.js` keeps
  running on Fly.io until v2 is verified locally + by hand-testing in
  the friends server.
- Cut over with a single Fly deploy from the rebuild branch once green.

## Operating Notes

- This is a **personal hobby project**, not part of the Spacefrogs
  workstream. Do not introduce shared infrastructure (Supabase, Stripe,
  PostHog, etc.). Keep the dependency footprint small.
- Friends-server-only. **Never publish the bot or share invite links
  publicly** — KB content is manually copied/authored from various
  third-party guide sites (Wowhead, Maxroll, The Balance, etc.); the
  "personal use" envelope depends on the bot staying private.
- KB content is **manually authored**. No runtime crawler, no
  build-time URL fetcher in v2. Add new entries by dropping
  frontmatter-tagged `.md` files under `kb/<game>/` (Obsidian or
  any editor) and re-running the build.
- Adding a new game = (a) create `kb/<new-game>/`, (b) author content,
  (c) add the channel ID → game mapping in `src/config/channels.ts`
  (or the `CHANNEL_GAME_MAP` env var), (d) re-deploy.

## Quick Reference

- See `.claude/plans/v2-rebuild.md` for the full rebuild plan, including
  phase-by-phase implementation order, slash-command shapes, and KB
  content sources.
