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
