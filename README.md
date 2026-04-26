# zugzugbot

A small Discord bot for a private friends server. Answers
game questions (rotations, builds, BiS, leveling, etc.) using
Retrieval-Augmented Generation against a hand-authored local
knowledge base.

Multi-game: WoW, Diablo 4, FF14. The bot picks which game's
knowledge to draw from based on the channel the question was
asked in.

**Status:** v2 rebuild — Phases 1-4 complete. `/zz` answers
from the hand-authored KB via Voyage embeddings + vectra
retrieval, scoped to whichever game the channel is mapped to.
Phase 5 is the open-ended "expand the KB + tune retrieval"
phase.

## Tech stack

- **Language:** TypeScript with `strict` mode (ESM, Node 20 LTS)
- **Discord:** [`discord.js`](https://discord.js.org/) v14 +
  `SlashCommandBuilder` (no prefix matching, no message-content
  intent)
- **LLM:** Anthropic SDK targeting Claude Sonnet 4.6
  (`claude-sonnet-4-6`)
- **Embeddings:** Voyage AI `voyage-3-lite`
- **Vector store:** [`vectra`](https://github.com/Stevenic/vectra)
  (in-memory + JSON on disk, ships baked into the Docker image)
- **Markdown:** [`gray-matter`](https://github.com/jonschlinkert/gray-matter)
  for YAML frontmatter parsing
- **Hosting:** Fly.io (existing app, in-place migration from v1)
- **Lint/format/test:** ESLint flat config + Prettier + Vitest

## Slash commands

```
/zz prompt:<string> [game:<wow|diablo|ff14>]
```

- `prompt` (required) — the user's question
- `game` (optional) — overrides the channel-derived game so you
  can ask a WoW question from `#general`, etc.

If invoked in a channel that isn't mapped to any game (and no
`game:` argument is passed), the bot replies with a friendly
"I'm not set up to answer questions in this channel" message
listing the channels that ARE mapped (rendered as clickable
channel mentions).

## Project structure

```
zugzugbot/
  src/
    index.ts                      Discord client + interaction handler
    commands/
      zz.ts                       /zz slash command
    config/
      env.ts                      zod-validated env loader
      channels.ts                 Discord channel ID → game mapping
    llm/
      anthropic.ts                Anthropic SDK wrapper
      prompts.ts                  System prompt + (Phase 4) context-stuffing template
    rag/
      chunk.ts                    Markdown → Chunk[] (frontmatter + heading splits)
      embed.ts                    Voyage SDK wrapper
      store.ts                    vectra wrapper (createOrLoadIndex, addChunks, search)
    types.ts                      Game enum + shared types
  scripts/
    build-kb.ts                   Walks kb/, chunks, embeds, writes data/vectra/
    register-commands.ts          One-shot Discord slash-command registration
  kb/                             ALSO an Obsidian vault — same directory
    wow/
      paladin-retribution.md
      paladin-protection.md
    diablo/
      barbarian-whirlwind.md
    ff14/
      paladin-rotation.md
  data/
    vectra/                       Built KB index (committed to git)
  .claude/
    plans/                        Phase-by-phase implementation plans
  Dockerfile                      Multi-stage TS build → dist/index.js
  fly.toml                        Fly app config (existing zugzug app)
```

## KB authoring

Knowledge base content lives under `kb/<game>/*.md`. Each file
has YAML frontmatter declaring at minimum its game, plus
optional metadata that flows through as filterable chunk
attributes:

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

Pre-pot Tempered Potion of Power 2 seconds before pull...

## Steady State Priority

Cast Wake of Ashes on cooldown...
```

Conventions:

- **`game` is required**, must be one of `wow | diablo | ff14`,
  must match the parent folder name (chunker enforces this at
  build time)
- Use `# H1` once for the file title (not a chunk boundary)
- `## H2` and `### H3` are chunk boundaries — see Phase 3 plan
  for hierarchy guidance
- Obsidian wikilinks (`[[some page]]`) and image embeds
  (`![[image.png]]`, `![alt](url)`) are stripped at chunk time
- Sections under ~50 words after stripping are dropped from
  the index

The `kb/` directory doubles as an Obsidian vault — open the
folder in Obsidian for backlinks, graph view, and mobile capture.
The bot has zero dependency on Obsidian; it just reads `.md` from
disk.

## Setup

Copy `.env.example` to `.env` and populate:

```
BOT_TOKEN=                 # Discord bot token
DISCORD_CLIENT_ID=         # Application ID from Discord developer portal
DISCORD_GUILD_ID=          # Friends-server ID (right-click server → Copy Server ID)
CHANNEL_GAME_MAP=          # JSON: {"<channelId>": "wow" | "diablo" | "ff14"}
ANTHROPIC_API_KEY=         # sk-ant-... from console.anthropic.com (set a usage cap)
VOYAGE_API_KEY=            # pa-... from voyageai.com (free tier covers ~16k rebuilds)
```

Discord developer portal: invite URL must include the
`applications.commands` OAuth scope (separate from `bot`).
The `MessageContent` privileged intent should be DISABLED — v2
doesn't read message content.

## Commands

```
npm install                 Install dependencies
npm run build               TS build → dist/
npm run typecheck           tsc --noEmit
npm run lint                ESLint
npm run format              Prettier auto-fix
npm run format:check        Prettier check-only
npm test                    Vitest

npm run dev                 Run in dev mode (tsx watch src/index.ts)
npm run register            Register /zz slash command with Discord (one-shot)
npm run build:kb            Build KB index from kb/*.md → data/vectra/
npm run start               Run compiled dist/index.js (production)
```

## Build + deploy

The KB index (`data/vectra/`) is built locally and committed to
git, then baked into the Docker image at deploy time. No
`VOYAGE_API_KEY` is needed at deploy or runtime for index loading
— only for rebuilding.

**Iterating on KB content:**

1. Edit `.md` files under `kb/<game>/`
2. `npm run build:kb` (rewrites `data/vectra/` from scratch each run — wipe-and-rebuild semantics, so deletes and renames work cleanly)
3. Spot-check `data/vectra/index.json`, `git add`, `git commit`
4. `fly deploy -a zugzug` (Phase 4+)

**Iterating on bot code:**

1. Make changes
2. `npm run build && npm run typecheck && npm run lint && npm test`
3. Locally: `fly scale count 0 -a zugzug` → `npm run dev` → smoke-test
   `/zz prompt: ...` in friends server → stop local
4. `fly deploy -a zugzug`

If only the slash-command schema changes (renames, new options,
new choices), also run `npm run register` once before/after
deploy. Pure runtime/handler logic changes don't need
re-registration.

## Roadmap

- **Phase 1** ✅ TypeScript scaffold + Discord client + stub `/zz`
- **Phase 2** ✅ Anthropic SDK wired into `/zz` (no RAG yet)
- **Phase 3** ✅ KB build pipeline (chunker + Voyage embed + vectra store + seed content)
- **Phase 4** ✅ Wire RAG into `/zz` with channel-game scoping
- **Phase 5** Expand KB to comprehensive coverage; tune chunking + retrieval

Phase plans live under `.claude/plans/`.

## Notes

- **Personal hobby project**, friends-server only. **Never publish
  the bot or share invite links publicly.** The "personal use"
  envelope around hand-copied third-party guide content (Wowhead,
  Maxroll, The Balance, Icy-Veins, etc.) depends on the bot
  staying private.
- KB content is **manually authored**. No runtime crawler, no
  build-time URL fetcher.
- Adding a new game: edit `GAMES` + the `Game` union in
  `src/types.ts`, add a choice to `src/commands/zz.ts`'s
  SlashCommandBuilder, add the channel ID → game mapping to
  `CHANNEL_GAME_MAP`, create `kb/<game>/`, author content,
  `npm run build:kb`, `npm run register`, deploy.
