import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(), // dev: register guild-scoped commands for instant updates
  CHANNEL_GAME_MAP: z.string().optional(), // JSON; parsed in channels.ts
  ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
  VOYAGE_API_KEY: z.string().min(1).startsWith('pa-'),
  BLIZZARD_CLIENT_ID: z.string().min(1).optional(),
  BLIZZARD_CLIENT_SECRET: z.string().min(1).optional(),
  WCL_CLIENT_ID: z.string().min(1).optional(),
  WCL_CLIENT_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env);
