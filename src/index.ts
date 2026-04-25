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
      await interaction.editReply('Something went wrong. Try again in a sec.');
    } else {
      await interaction.reply({
        content: 'Something went wrong. Try again in a sec.',
        ephemeral: true,
      });
    }
  }
});

await client.login(env.BOT_TOKEN);
