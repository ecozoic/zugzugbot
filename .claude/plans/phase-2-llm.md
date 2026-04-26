# Phase 2 — Anthropic LLM wrapper + naïve `/zz` (no RAG yet)

**Status:** Draft
**Parent plan:** `v2-rebuild.md`
**Depends on:** Phase 1 (TS scaffold deployed and serving the
stub `/zz` reply)
**Goal:** wire the `/zz` slash command to Claude Sonnet 4.6.
Channel-game routing already resolves the game (Phase 1) but
isn't used yet — the LLM gets just the user prompt + a generic
system prompt. No KB, no retrieval. Friends should be able to
ask questions and get plausible Sonnet answers, with the same
"answers from training data" quality limitations the old
`bot.js` had — that's the deliberate intermediate state
between scaffold (P1) and grounded RAG (P3 + P4).

---

## 1. Pre-flight

One real prerequisite: an **Anthropic API key**.

- Get one at https://console.anthropic.com/ → API Keys → Create Key
- The key starts with `sk-ant-`
- Personal hobby budget: set a usage cap on the key (Console →
  Usage Limits) so a runaway bot can't drain the wallet. $20/month
  is comfortably above the expected cost.
- Add `$5–10` in initial credits if the account is new.

That's it. No new Discord-portal config, no new Fly secrets infra.

## 2. Branch

```
cd ~/Code/zugzugbot
git checkout master
git pull
git checkout -b feat/v2-anthropic-llm
```

## 3. Tooling

`@anthropic-ai/sdk` was pre-installed in Phase 1's `package.json`
specifically so this phase doesn't need a `package.json` change.
Verify it's still listed:

```
grep '@anthropic-ai/sdk' package.json
```

If it's missing for any reason: `npm install @anthropic-ai/sdk`.

No other dependency changes.

## 4. Project structure (Phase 2 additions)

```
zugzugbot/
  src/
    llm/
      anthropic.ts        # NEW — SDK wrapper
      prompts.ts          # NEW — system prompt builder + (P4 placeholder)
      __tests__/
        prompts.test.ts   # NEW — vitest coverage for the prompt builder
    config/
      env.ts              # MODIFIED — add ANTHROPIC_API_KEY
      channels.ts         # MODIFIED — expose listMappedChannels() helper
      __tests__/
        channels.test.ts  # NEW — vitest coverage for listMappedChannels
    commands/
      zz.ts               # MODIFIED — call the LLM + dynamic channel hint
  .env.example            # MODIFIED — add ANTHROPIC_API_KEY
```

## 5. File contents

### 5.1 `src/llm/anthropic.ts`

```ts
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024; // ~750 words; comfortably fits in Discord's 2000-char limit

export async function complete(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // We requested a single text response; assert the content shape.
  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(
      `Anthropic returned no text content (got ${block?.type ?? 'undefined'})`,
    );
  }
  return block.text;
}
```

Notes:

- **Model pinned** to `claude-sonnet-4-6`. Don't switch models
  without thinking — the parent plan §4.1 covers why (Opus is
  overkill, Haiku struggles with the context windows we'll feed
  it in Phase 4).
- **`max_tokens: 1024`** — Discord's hard message length is
  2000 characters. A 1024-token response is roughly 700-800
  words = comfortably under the limit even with the answer +
  sources footer (the latter lands in Phase 4).
- **No streaming.** Discord supports message edits but the
  latency win is small (Sonnet is fast) and the implementation
  is fiddly. Defer indefinitely.
- **No retry logic.** Anthropic's SDK already handles transient
  errors with built-in retries. If the SDK gives up, the error
  bubbles up to the `/zz` handler's try/catch and the user sees
  the friendly fallback message.

### 5.2 `src/llm/prompts.ts`

```ts
import type { Game } from '../types.js';

const GAME_NAMES: Record<Game, string> = {
  wow: 'World of Warcraft',
  diablo: 'Diablo 4',
  ff14: 'Final Fantasy XIV',
};

/**
 * Build the system prompt for a question about a specific game.
 *
 * Phase 2: just frames the bot's role + game scope. No retrieved
 * context yet — the model answers from its training data.
 *
 * Phase 4 will replace this with `buildSystemPromptWithContext`
 * below, which adds an "answer only from the provided context"
 * instruction once we have RAG retrieval wired up.
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
 * Phase 4 will use this. Stubbed here so the shape is in place
 * and Phase 4's diff is small.
 */
export function buildSystemPromptWithContext(
  game: Game,
  contextChunks: string[],
): string {
  const base = buildSystemPrompt(game);
  if (contextChunks.length === 0) {
    return base;
  }
  const contextBlock = contextChunks
    .map((c, i) => `[Source ${i + 1}]\n${c}`)
    .join('\n\n');
  return [
    base,
    '',
    'Answer using ONLY the information in the sources below.',
    "If the sources don't cover the question, say so — do not fall back to general knowledge.",
    '',
    '<sources>',
    contextBlock,
    '</sources>',
  ].join('\n');
}
```

### 5.3 `src/llm/__tests__/prompts.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildSystemPromptWithContext,
} from '../prompts.js';

describe('buildSystemPrompt', () => {
  it('names WoW for wow', () => {
    expect(buildSystemPrompt('wow')).toContain('World of Warcraft');
  });

  it('names Diablo 4 for diablo', () => {
    expect(buildSystemPrompt('diablo')).toContain('Diablo 4');
  });

  it('names FF14 for ff14', () => {
    expect(buildSystemPrompt('ff14')).toContain('Final Fantasy XIV');
  });

  it('includes the no-hallucination instruction', () => {
    const prompt = buildSystemPrompt('wow');
    expect(prompt).toMatch(/don't make things up/i);
  });
});

describe('buildSystemPromptWithContext', () => {
  it('returns the base prompt when no context chunks', () => {
    expect(buildSystemPromptWithContext('wow', [])).toBe(
      buildSystemPrompt('wow'),
    );
  });

  it('embeds context chunks in a sources block', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      'Retribution paladin opener: Wake of Ashes → Crusader Strike.',
      'Holy Power generators: CS, BoJ, J.',
    ]);
    expect(prompt).toContain('<sources>');
    expect(prompt).toContain('Wake of Ashes');
    expect(prompt).toContain('Holy Power generators');
    expect(prompt).toMatch(/answer using only the information in the sources/i);
  });
});
```

### 5.4 `src/config/env.ts` — add `ANTHROPIC_API_KEY`

Modify the existing zod schema:

```ts
const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  CHANNEL_GAME_MAP: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'), // NEW
});
```

The `startsWith('sk-ant-')` check catches typos / pasting the
wrong key entirely, fail-fast at boot.

### 5.5 `src/config/channels.ts` — expose `listMappedChannels()`

The Phase 1 fallback message in `/zz` hardcoded
`"Try #wow, #diablo, or #ff14"`. That string lies if the
channels are named anything else, and it's a second source of
truth alongside `CHANNEL_GAME_MAP`. Phase 2 fixes both by
deriving the hint dynamically from the map and rendering each
entry as a Discord channel mention (`<#channelId>`), which
the user's client renders as a clickable link to the channel.

Add a new exported helper to the existing `channels.ts` file
(keep `getGameForChannel` exactly as it was):

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

/**
 * Returns every (channelId, game) pair the bot is configured for.
 * Used to render the "I'm not set up here, try these channels"
 * fallback message dynamically — channelIds become clickable
 * channel mentions in Discord (`<#id>` syntax).
 */
export function listMappedChannels(): Array<{ channelId: string; game: Game }> {
  return Object.entries(loadMap()).map(([channelId, game]) => ({
    channelId,
    game,
  }));
}
```

### 5.6 `src/config/__tests__/channels.test.ts`

Lightweight coverage for the new helper. The existing
`getGameForChannel` is implicitly covered by the integration
test in §6 step 4, but the new helper benefits from a couple
of unit cases.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('listMappedChannels', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.CHANNEL_GAME_MAP = '';
  });

  it('returns an empty list when CHANNEL_GAME_MAP is unset', async () => {
    // Use empty string instead of `delete process.env.CHANNEL_GAME_MAP` —
    // env.ts calls dotenv/config at import time, and if the developer's
    // local .env has CHANNEL_GAME_MAP set, dotenv will repopulate the
    // deleted var on import. dotenv DOESN'T overwrite existing values
    // (even empty strings), so setting to '' keeps the test isolated.
    // loadMap() treats empty string as falsy → returns {}.
    process.env.CHANNEL_GAME_MAP = '';
    process.env.BOT_TOKEN = 'test';
    process.env.DISCORD_CLIENT_ID = 'test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const { listMappedChannels } = await import('../channels.js');
    expect(listMappedChannels()).toEqual([]);
  });

  it('returns a (channelId, game) entry for each map key', async () => {
    process.env.CHANNEL_GAME_MAP = JSON.stringify({
      '111': 'wow',
      '222': 'diablo',
      '333': 'ff14',
    });
    process.env.BOT_TOKEN = 'test';
    process.env.DISCORD_CLIENT_ID = 'test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const { listMappedChannels } = await import('../channels.js');
    expect(listMappedChannels()).toEqual([
      { channelId: '111', game: 'wow' },
      { channelId: '222', game: 'diablo' },
      { channelId: '333', game: 'ff14' },
    ]);
  });
});
```

Two non-obvious things about this test file:

- `vi.resetModules()` in `beforeEach` is needed because
  `channels.ts` caches the parsed map at module scope —
  without the reset, the second test would see the first
  test's empty cache.
- `CHANNEL_GAME_MAP = ''` instead of `delete process.env.CHANNEL_GAME_MAP`:
  `env.ts` calls `dotenv/config` at import time. If the
  developer's local `.env` has `CHANNEL_GAME_MAP` populated
  (which it will, in real use), dotenv repopulates the deleted
  var on the dynamic import inside the test. dotenv does NOT
  overwrite existing values (even empty strings), so setting
  to `''` keeps the test isolated. `loadMap()` treats empty
  string as falsy → returns `{}`.

### 5.7 `src/commands/zz.ts` — wire the LLM + dynamic channel hint

Replace the stub reply with a real LLM call AND swap the
hardcoded channel-name fallback for a dynamically-rendered
list of mapped channels. Full new file:

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
import { buildSystemPrompt } from '../llm/prompts.js';
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
  // Cast: addChoices() above constrains the option's value at the Discord
  // schema layer, but discord.js's type for getString('game') is just
  // string | null. The values that can actually arrive are the choice values.
  const gameOverride = interaction.options.getString('game') as Game | null;
  const game = gameOverride ?? getGameForChannel(interaction.channelId);

  if (!game) {
    await interaction.editReply(unmappedChannelHint());
    return;
  }

  const systemPrompt = buildSystemPrompt(game);

  try {
    const answer = await complete(systemPrompt, prompt);
    await interaction.editReply(truncateForDiscord(answer));
  } catch (err) {
    console.error('[/zz] anthropic call failed:', err);
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

Notes:

- `truncateForDiscord` is a belt-and-suspenders guard. With
  `max_tokens: 1024` we shouldn't realistically exceed 2000
  chars, but if the model goes wild on a question with lots
  of code/tables, we don't want to crash the reply with a
  Discord 400 error.
- Errors are caught and replied via `editReply` (we already
  deferred, so a fresh `reply` would fail). The error itself
  goes to console — Fly captures stdout for after-the-fact
  debugging.
- `unmappedChannelHint()` reads from the in-process cache that
  `channels.ts` already maintains, so it's effectively free
  per call.
- Discord's `<#channelId>` syntax renders as a clickable
  channel link in the user's client (just like `@mention`s
  render as clickable user links). Falls back to plain text
  if the user can't see that channel — Discord handles that
  on the client side.
- The empty-map case (`mapped.length === 0`) is a sanity
  branch; in practice you'd never deploy to Fly without
  populating `CHANNEL_GAME_MAP`, but it keeps the message
  honest if you somehow do.

### 5.8 `.env.example` — add `ANTHROPIC_API_KEY`

Append:

```
# Anthropic API key, starts with sk-ant-. Get one at
# https://console.anthropic.com/. Set a usage cap on the key
# in the console so a runaway bot can't drain the wallet.
ANTHROPIC_API_KEY=
```

## 6. Local validation

1. **Build:** `npm run build` → emits `dist/`. Fix TS errors.
2. **Lint + format:** `npm run lint && npm run format:check`.
3. **Tests:** `npm test -- --run` (or just `npm test` and ctrl-C
   after the first pass). The new prompt-builder tests should
   all pass.
4. **Run locally:**
   - Take prod offline: `fly scale count 0 -a zugzug` (only one
     active client per token).
   - Populate `.env` with `ANTHROPIC_API_KEY` (in addition to
     the Phase 1 vars). `npm run register` is NOT needed —
     command schema didn't change, the existing registration
     still applies.
   - `npm run dev`, confirm `Ready! Logged in as ...`.
   - In a mapped channel, run `/zz prompt: what's a good
     leveling spec for a new paladin in TWW`. Expect a real
     Sonnet response within ~5-10 seconds.
   - In an unmapped channel, expect the unchanged Phase 1
     "not set up here" message.
   - With `game:` override from any channel, expect the answer
     to be game-appropriate (`game: diablo` → Diablo 4 framing
     even if you ask a vague question).
   - Force an error: temporarily set `ANTHROPIC_API_KEY=sk-ant-bogus`
     in `.env`, restart `npm run dev`, run `/zz`. Expect the
     "Couldn't get an answer this time" fallback in Discord and
     the actual error in the local console. Restore the real
     key when done.
   - Stop the local bot.

## 7. Deploy to Fly

```
git add .
git commit -m "feat: wire Anthropic SDK into /zz (no RAG yet)"
git push -u origin feat/v2-anthropic-llm
fly secrets set ANTHROPIC_API_KEY=sk-ant-... -a zugzug
fly deploy -a zugzug
fly logs -a zugzug
```

Watch for `Ready! Logged in as ...`. Smoke-test `/zz` in the
friends server. If something breaks: read logs, fix, redeploy.

## 8. Exit criteria (gate to Phase 3)

- [ ] `npm run typecheck && npm run lint && npm run format:check && npm test`
      all pass
- [ ] `npm run build` produces `dist/llm/anthropic.js` and
      `dist/llm/prompts.js`
- [ ] Bot deploys to Fly with `ANTHROPIC_API_KEY` set as a Fly
      secret
- [ ] `/zz prompt: <real question>` in a mapped channel returns
      a Sonnet answer within ~10s
- [ ] `game:` override produces a game-appropriate answer when
      invoked from a non-mapped channel
- [ ] Forced API failure (bogus key) produces the friendly
      fallback message in Discord and a real error in `fly logs`
- [ ] Cost dashboard at https://console.anthropic.com/ shows
      non-zero usage matching your test invocations

## 9. Open questions (deferred to later phases)

- **Per-game system prompts.** Does Sonnet's voice/tone
  meaningfully improve if the system prompt is more game-specific
  ("You are a hardcore raider helping with rotations" vs the
  current generic "knowledgeable expert")? Hand-test in Phase 4
  alongside the RAG quality work — if both happen at the same
  time it's hard to attribute quality changes.
- **Multi-turn conversations.** A `/zz` invocation is one-shot
  today. Should follow-ups in the same Discord thread carry
  context? Probably yes someday, but it adds significant
  complexity (interaction tokens are short-lived; we'd need
  to use a `messageCreate` listener inside threads, which
  re-enables the `MessageContent` privileged intent we just
  turned off). Defer indefinitely.
- **Usage / cost telemetry.** Do we want a `/zz-stats` command
  (or just a daily console log) showing query count + token
  spend? Defer until usage volume is interesting enough to
  watch (probably never, at friends-server scale).
- **Cache.** Same question by two friends in 5 minutes shouldn't
  cost two Sonnet calls. Probably worth a small in-memory LRU
  in Phase 5+, but not before we have RAG retrieval driving
  most of the cost.
