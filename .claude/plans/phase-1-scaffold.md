# Phase 1 — TypeScript scaffold + Discord client

**Status:** Draft
**Parent plan:** `v2-rebuild.md`
**Goal:** stand up the v2 codebase as a deployable shell.
At end of phase, the new bot is running on Fly with a working
`/zz` slash command that replies with a placeholder. No KB, no
LLM, no game-routing logic yet — just the foundation everything
else builds on.

---

## 1. Pre-flight

The bot's existing surface area is small enough (and used
infrequently enough) that we don't need to choreograph the
migration. Build v2 on a branch, deploy when ready, fix
forward if anything's off.

The one thing we genuinely need before v2 is functional in
Discord:

**Slash commands need the `applications.commands` OAuth scope**
on the bot's invite URL — separate from the `bot` scope. If the
bot was originally invited with only `bot`, slash commands won't
show up after registration.

1. Discord Developer Portal → your application → **OAuth2 → URL Generator**
2. Check both `bot` AND `applications.commands`
3. Generate the URL, open it, re-authorize the bot for the
   friends server. Server admin clicks "Authorize" — bot identity
   doesn't change.

Verify by checking the bot's permissions in the friends server's
Integrations settings include "Use Application Commands".

## 2. Branch + repo prep

```
cd ~/Code/zugzugbot
git checkout master
git pull
git checkout -b feat/v2-typescript-rag
git rm src/bot.js src/ai.js
git rm -r src/wow
```

(Default branch on this repo is `master`, not `main`.)

`src/bot.js`, `src/ai.js`, and `src/wow/` are all v1 surface
and get deleted in the same branch as the v2 scaffold lands —
no parallel-run period, no rollback gymnastics. The branch
itself is the rollback (revert the merge if v2 is broken in
ways we can't fix forward in 5 minutes).

## 3. Tooling + package layout

### 3.1 Bump Node + add TS toolchain

`package.json` becomes (rewrite, don't merge):

```json
{
  "name": "zugzugbot",
  "version": "2.0.0",
  "description": "Multi-game RAG Discord bot for our friends server",
  "main": "dist/index.js",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "register": "tsx scripts/register-commands.ts",
    "lint": "eslint src scripts",
    "format": "prettier --write src scripts",
    "format:check": "prettier --check src scripts",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "discord.js": "^14.16.0",
    "dotenv": "^16.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@flydotio/dockerfile": "^0.5.0",
    "@types/node": "^20.14.0",
    "@typescript-eslint/eslint-plugin": "^7.16.0",
    "@typescript-eslint/parser": "^7.16.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.3.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

Notes on choices:

- **`"type": "module"`** — full ESM. discord.js v14 supports
  both CJS and ESM; ESM aligns better with TS + modern Node.
- **Node 20 LTS** — current bot is on 18.18; bump while we're
  rewriting everything else. Update `Dockerfile` ARG to match.
- **`@anthropic-ai/sdk`** is added in Phase 1 even though we
  don't call it yet — it's a tiny dependency and pre-installing
  it means Phase 2 doesn't need a `package.json` change.
- **`tsx`** for `dev` and `register` scripts (no compile
  needed at dev time).
- **`zod`** for env validation.

Run:

```
rm -rf node_modules package-lock.json
npm install
```

### 3.2 `tsconfig.json` + `tsconfig.build.json`

Two configs because `tsc` rejects `rootDir: "src"` if `include`
spans both `src/` and `scripts/` (TS6059). Split: a base config
covers typecheck + lint over both directories, a build config
extends it with the narrower `rootDir` + `include` for the
shipped output.

`tsconfig.json` (base — used by `tsc --noEmit` for typecheck,
ESLint, editor):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

`tsconfig.build.json` (used by `npm run build`, ships only
`src/` to `dist/`):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

The `build` script in `package.json` is therefore
`"build": "tsc -p tsconfig.build.json"` (already reflected in
§3.1). `register-commands.ts` benefits from the strict settings
via the base config but isn't compiled to `dist/` — `tsx` runs
it from source.

### 3.3 ESLint + Prettier

Minimal flat ESLint config (`eslint.config.js`):

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { parser: tsparser },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
];
```

`.prettierrc` (defaults are fine):

```json
{ "singleQuote": true, "trailingComma": "all" }
```

### 3.4 `.gitignore` additions

Confirm these are present:

```
node_modules/
dist/
.env
.env.local
data/vectra.json
```

(We'll add `data/` in Phase 3; safe to gitignore now.)

## 4. Project structure (Phase 1 footprint only)

```
zugzugbot/
  src/
    bot.js                # OLD — leave in place until §6 cutover
    wow/wow.js            # OLD — leave in place
    index.ts              # NEW entrypoint
    config/
      env.ts              # zod-validated env loader
      channels.ts         # channel ID → game placeholder (returns null in P1)
    commands/
      zz.ts               # /zz slash command (placeholder reply)
    types.ts              # shared types (Game, etc.)
  scripts/
    register-commands.ts  # one-shot: register slash commands with Discord
  .env.example            # documents required env vars
  Dockerfile              # bumped to Node 20, builds dist/, swaps CMD
  fly.toml                # unchanged (just verify it's still present)
  package.json
  tsconfig.json
  eslint.config.js
```

## 5. File contents (P1 stubs)

### 5.1 `src/types.ts`

```ts
export type Game = 'wow' | 'diablo' | 'ff14';
export const GAMES: readonly Game[] = ['wow', 'diablo', 'ff14'];
```

### 5.2 `src/config/env.ts`

```ts
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(), // dev: register guild-scoped commands for instant updates
  CHANNEL_GAME_MAP: z.string().optional(), // JSON; parsed in channels.ts
  // Phase 2+ vars are intentionally NOT here yet.
  // ANTHROPIC_API_KEY, VOYAGE_API_KEY → added in Phase 2/3
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
```

`DISCORD_CLIENT_ID` is new in v2 — needed for the REST command
registration call. Fetch it from Discord Developer Portal →
your application → General Information → Application ID.

`DISCORD_GUILD_ID` is optional — when set, commands register
**only to that guild** and are visible immediately. Without it,
commands are global and take up to an hour to propagate. For
the friends server we have one known guild ID, so always set
it (production AND dev) to make the slash command live
instantly.

### 5.3 `src/config/channels.ts`

Phase 1 stub — real impl lands in Phase 4.

```ts
import { env } from './env.js';
import type { Game } from '../types.js';
import { GAMES } from '../types.js';

let cache: Record<string, Game> | null = null;

function loadMap(): Record<string, Game> {
  if (cache) return cache;
  if (!env.CHANNEL_GAME_MAP) {
    cache = {};
    return cache;
  }
  const parsed = JSON.parse(env.CHANNEL_GAME_MAP) as Record<string, string>;
  for (const [chanId, game] of Object.entries(parsed)) {
    if (!GAMES.includes(game as Game)) {
      throw new Error(`CHANNEL_GAME_MAP: unknown game "${game}" for ${chanId}`);
    }
  }
  cache = parsed as Record<string, Game>;
  return cache;
}

export function getGameForChannel(channelId: string): Game | null {
  return loadMap()[channelId] ?? null;
}
```

Throwing on bad `CHANNEL_GAME_MAP` at first lookup (rather than
import time) keeps `register-commands.ts` runnable without the
map being set.

### 5.4 `src/commands/zz.ts`

```ts
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGameForChannel } from '../config/channels.js';

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
  const gameOverride = interaction.options.getString('game');
  const game = gameOverride ?? getGameForChannel(interaction.channelId);

  if (!game) {
    await interaction.editReply(
      "I'm not set up to answer questions in this channel. Try #wow, " +
        '#diablo, or #ff14, or pass `game:` to override.',
    );
    return;
  }

  // Phase 1 stub — Phase 2 wires the LLM, Phase 4 wires retrieval.
  await interaction.editReply(
    `(stub) Got it — would answer your **${game}** question:\n> ${prompt}`,
  );
}
```

### 5.5 `src/index.ts`

```ts
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { env } from './config/env.js';
import * as zz from './commands/zz.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== zz.data.name) return;
  try {
    await zz.execute(interaction);
  } catch (err) {
    console.error('[/zz] handler threw:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(
        "Something went wrong. Try again in a sec.",
      );
    } else {
      await interaction.reply({
        content: "Something went wrong. Try again in a sec.",
        ephemeral: true,
      });
    }
  }
});

await client.login(env.BOT_TOKEN);
```

Notes:

- **No `MessageContent` intent.** v2 doesn't read message
  content, only interactions. While you're in the Discord
  developer portal for the OAuth scope check (§1), also disable
  the `MessageContent` privileged intent — cleaner permission
  posture and one less thing in the privileged-intents review.
- **Top-level `await`** is fine — `"type": "module"` + ES2022
  target.

### 5.6 `scripts/register-commands.ts`

```ts
import { REST, Routes } from 'discord.js';
import { env } from '../src/config/env.js';
import * as zz from '../src/commands/zz.js';

const rest = new REST({ version: '10' }).setToken(env.BOT_TOKEN);

const body = [zz.data.toJSON()];

const route = env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

console.log(
  `Registering ${body.length} command(s) ${
    env.DISCORD_GUILD_ID ? `to guild ${env.DISCORD_GUILD_ID}` : 'globally'
  }...`,
);

const result = await rest.put(route, { body });

console.log('Done.');
console.log(result);
```

Run with: `npm run register`.

### 5.7 `.env.example`

```
BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
# JSON map: { "<channelId>": "wow" | "diablo" | "ff14" }
# Phase 1 can leave this unset — the /zz handler returns the
# friendly "not set up here" message until you populate it.
CHANNEL_GAME_MAP=
```

## 6. Dockerfile

Full rewrite — old file is short enough:

```dockerfile
# syntax = docker/dockerfile:1
ARG NODE_VERSION=20.15.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"
WORKDIR /app
ENV NODE_ENV="production"

FROM base AS build
RUN apt-get update -qq && \
    apt-get install -y build-essential pkg-config python-is-python3
COPY --link package-lock.json package.json ./
RUN npm ci --include=dev
COPY --link . .
RUN npm run build

FROM base
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json

CMD [ "node", "dist/index.js" ]
```

Changes vs the current Dockerfile:

- Node 20 (was 18.18)
- Install dev deps in build stage so `tsc` works, then copy
  only `dist/` + `node_modules/` (production deps already
  installed) into the final stage. Slimmer image.
- `CMD` runs `node dist/index.js`.
- Drops the `EXPOSE 3000` since the bot doesn't serve HTTP.

## 7. Local validation (before any Fly deploy)

1. **Build:** `npm run build` → emits `dist/`. Fix any TS
   errors.
2. **Lint + format:** `npm run lint && npm run format:check`.
3. **Run locally:** populate `.env` with `BOT_TOKEN` +
   `DISCORD_CLIENT_ID` + `DISCORD_GUILD_ID`. Take the prod bot
   offline with `fly scale count 0 -a zugzug` so the local
   process can hold the Discord connection (one token, one
   active client at a time).
   - `npm run register` once.
   - `npm run dev`. Confirm `Ready! Logged in as ...`.
   - In the friends server, type `/zz` — Discord should
     autocomplete and show the prompt + game options.
   - Invoke `/zz` in a channel without `CHANNEL_GAME_MAP`
     populated. Expect the "not set up here" message.
   - Set `CHANNEL_GAME_MAP='{"<test-channel-id>":"wow"}'` in
     `.env`, restart `npm run dev`, invoke `/zz` in that
     channel. Expect the `(stub) Got it — would answer your
     **wow** question:` reply.
   - Stop the local bot. Don't bother bringing prod back up —
     §8 immediately deploys v2 there anyway.

## 8. Deploy to Fly

```
git add .
git commit -m "feat: v2 TypeScript scaffold + slash command stub"
git push -u origin feat/v2-typescript-rag
fly deploy -a zugzug
fly logs -a zugzug
```

Watch for `Ready! Logged in as ...`. Run `/zz prompt: hello` in
a mapped channel to confirm.

If something's broken: `fly releases -a zugzug` shows the
prior image, `fly deploy --image <id> -a zugzug` rolls back.
The bot has no persistent state so there's nothing to lose.
Most likely fix-forward is faster than rollback once you see
the actual error in `fly logs`.

## 9. Exit criteria (gate to Phase 2)

- [ ] `npm run typecheck && npm run lint && npm run format:check`
      all pass
- [ ] `npm run build` produces `dist/index.js`
- [ ] Bot deploys to Fly and connects to Discord
- [ ] `/zz prompt:` autocompletes in the friends server
- [ ] In a mapped channel, `/zz` returns the stub reply with
      the correct game name
- [ ] In an unmapped channel, `/zz` returns the friendly
      "not set up here" message
- [ ] `game:` override works from any channel

## 10. Open questions deferred

- Structured logger (pino / winston) in P1, or wait until we
  have something worth logging? **Defer to P4** — `console.log`
  is fine for the scaffold.
- Fly healthcheck endpoint? **No** — Fly for non-HTTP apps just
  monitors the process; restart-on-crash is built in.
