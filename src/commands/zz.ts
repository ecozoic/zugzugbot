import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getGameForChannel, listMappedChannels } from '../config/channels.js';
import { complete } from '../llm/anthropic.js';
import { buildSystemPromptWithContext } from '../llm/prompts.js';
import { retrieve } from '../rag/query.js';
import type { Game } from '../types.js';

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
  const gameOverride = interaction.options.getString('game') as Game | null;
  const game = gameOverride ?? getGameForChannel(interaction.channelId);

  if (!game) {
    await interaction.editReply(unmappedChannelHint());
    return;
  }

  try {
    const chunks = await retrieve(prompt, { game });
    const systemPrompt = buildSystemPromptWithContext(game, chunks);
    const answer = await complete(systemPrompt, prompt);
    await interaction.editReply(truncateForDiscord(answer));
  } catch (err) {
    console.error('[/zz] handler failed:', err);
    await interaction.editReply(
      "Couldn't get an answer this time. Try again in a sec.",
    );
  }
}

const DISCORD_MESSAGE_MAX = 2000;

function truncateForDiscord(text: string): string {
  if (text.length <= DISCORD_MESSAGE_MAX) return text;
  return text.slice(0, DISCORD_MESSAGE_MAX - 1) + '…';
}

function unmappedChannelHint(): string {
  const mapped = listMappedChannels();
  if (mapped.length === 0) {
    return "I'm not set up to answer questions in any channel yet. Pass `game:` to override.";
  }
  const channelList = mapped
    .map(({ channelId, game }) => `<#${channelId}> (${game})`)
    .join(', ');
  return `I'm not set up to answer questions in this channel. Try ${channelList}, or pass \`game:\` to override.`;
}
