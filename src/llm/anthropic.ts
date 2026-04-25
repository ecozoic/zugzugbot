import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024; // ~750 words; comfortably fits in Discord's 2000-char limit

export async function complete(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  // We requested a single text response; assert the content shape.
  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(
      `Anthropic returned no text content (got ${block?.type ?? 'undefined'})`,
    );
  }
  return block.text;
}
