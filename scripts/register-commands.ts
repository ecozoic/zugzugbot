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
