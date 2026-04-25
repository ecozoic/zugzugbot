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
