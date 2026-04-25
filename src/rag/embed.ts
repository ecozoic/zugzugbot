import { VoyageAIClient } from 'voyageai';
import { env } from '../config/env.js';

const client = new VoyageAIClient({ apiKey: env.VOYAGE_API_KEY });
const MODEL = 'voyage-3-lite';
const MAX_BATCH_SIZE = 128; // Voyage's per-request input limit

/**
 * Embed an array of document texts. Used by the build pipeline.
 * Batches transparently to stay under Voyage's per-request limit.
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await client.embed({
      input: batch,
      model: MODEL,
      inputType: 'document',
    });
    for (const item of response.data ?? []) {
      if (!item.embedding) {
        throw new Error('Voyage returned an item without an embedding');
      }
      all.push(item.embedding);
    }
  }
  return all;
}

/**
 * Embed a single query. Used at /zz invocation time in Phase 4.
 * `inputType: 'query'` produces embeddings asymmetrically optimized
 * for retrieval against `inputType: 'document'` vectors above.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const response = await client.embed({
    input: [text],
    model: MODEL,
    inputType: 'query',
  });
  const first = response.data?.[0];
  if (!first?.embedding) {
    throw new Error('Voyage returned no embedding for query');
  }
  return first.embedding;
}
