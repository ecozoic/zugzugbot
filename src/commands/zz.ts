import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGameForChannel } from '../config/channels.js';

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
  const gameOverride = interaction.options.getString('game');
  const game = gameOverride ?? getGameForChannel(interaction.channelId);

  if (!game) {
    await interaction.editReply(
      "I'm not set up to answer questions in this channel. Try #wow, " +
        '#diablo, or #ff14, or pass `game:` to override.',
    );
    return;
  }

  // Phase 1 stub — Phase 2 wires the LLM, Phase 4 wires retrieval.
  await interaction.editReply(
    `(stub) Got it — would answer your **${game}** question:\n> ${prompt}`,
  );
}
