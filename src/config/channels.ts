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
