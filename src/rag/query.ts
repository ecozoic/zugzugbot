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
