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
