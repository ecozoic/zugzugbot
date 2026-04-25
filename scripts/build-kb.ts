import { glob } from 'glob';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chunk, type Chunk } from '../src/rag/chunk.js';
import { embedDocuments } from '../src/rag/embed.js';
import { addChunks, createOrLoadIndex } from '../src/rag/store.js';

const KB_ROOT = 'kb';
const INDEX_DIR = 'data/vectra';

async function main(): Promise<void> {
  console.log(`Scanning ${KB_ROOT}/ for markdown files...`);
  const files = await glob('**/*.md', { cwd: KB_ROOT });
  if (files.length === 0) {
    console.error(
      `No markdown files found under ${KB_ROOT}/. Add some content first.`,
    );
    process.exit(1);
  }
  console.log(`Found ${files.length} files.`);

  const allChunks: Chunk[] = [];
  for (const file of files) {
    const fullPath = path.join(KB_ROOT, file);
    const raw = await readFile(fullPath, 'utf-8');
    const chunks = chunk(raw, file);
    console.log(`  ${file}: ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    console.error(
      'All files produced 0 chunks. Check that they have non-empty bodies.',
    );
    process.exit(1);
  }
  console.log(`Total: ${allChunks.length} chunks across ${files.length} files`);

  console.log(`Embedding via Voyage (${allChunks.length} documents)...`);
  const embeddings = await embedDocuments(allChunks.map((c) => c.text));
  if (embeddings.length !== allChunks.length) {
    throw new Error(
      `Embedding count mismatch: ${embeddings.length} vectors for ${allChunks.length} chunks`,
    );
  }

  console.log(`Writing index to ${INDEX_DIR}/...`);
  const index = await createOrLoadIndex(INDEX_DIR);
  await addChunks(
    index,
    allChunks.map((c, i) => ({ ...c, embedding: embeddings[i]! })),
  );

  // Per-game summary
  const byGame = new Map<string, number>();
  for (const c of allChunks) {
    byGame.set(c.metadata.game, (byGame.get(c.metadata.game) ?? 0) + 1);
  }
  console.log('Done. Chunk counts by game:');
  for (const [g, n] of byGame) {
    console.log(`  ${g}: ${n}`);
  }

  // Approximate cost: ~0.7 tokens per word, $0.02 per 1M tokens
  const totalWords = allChunks.reduce(
    (sum, c) => sum + c.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const approxTokens = Math.round(totalWords * 1.3);
  const approxCostUSD = (approxTokens / 1_000_000) * 0.02;
  console.log(
    `Approx ${approxTokens.toLocaleString()} tokens embedded (~$${approxCostUSD.toFixed(4)}).`,
  );
}

main().catch((err) => {
  console.error('build-kb failed:', err);
  process.exit(1);
});
