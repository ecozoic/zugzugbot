import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('listMappedChannels', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.CHANNEL_GAME_MAP;
  });

  it('returns an empty list when CHANNEL_GAME_MAP is unset', async () => {
    // Set to empty string instead of delete so dotenv (loaded by env.ts)
    // doesn't repopulate it from a local .env file.
    process.env.CHANNEL_GAME_MAP = '';
    process.env.BOT_TOKEN = 'test';
    process.env.DISCORD_CLIENT_ID = 'test';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.VOYAGE_API_KEY = 'pa-test';
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
    process.env.VOYAGE_API_KEY = 'pa-test';
    const { listMappedChannels } = await import('../channels.js');
    expect(listMappedChannels()).toEqual([
      { channelId: '111', game: 'wow' },
      { channelId: '222', game: 'diablo' },
      { channelId: '333', game: 'ff14' },
    ]);
  });
});
