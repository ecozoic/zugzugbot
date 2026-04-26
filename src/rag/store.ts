import { LocalIndex } from 'vectra';
import path from 'node:path';
import type { Chunk, ChunkMetadata } from './chunk.js';

export interface IndexedChunk extends Chunk {
  embedding: number[];
}

export interface SearchResult {
  text: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * Open the index at `indexPath`, creating it if missing.
 * `indexPath` is a directory; vectra creates `index.json` + items inside.
 */
export async function createOrLoadIndex(
  indexPath: string,
): Promise<LocalIndex> {
  const index = new LocalIndex(indexPath);
  if (!(await index.isIndexCreated())) {
    await index.createIndex();
  }
  return index;
}

/**
 * Insert chunks. Each chunk's text is stored alongside its metadata
 * so search results can reconstruct the chunk without a separate lookup.
 */
export async function addChunks(
  index: LocalIndex,
  chunks: IndexedChunk[],
): Promise<void> {
  for (const c of chunks) {
    await index.insertItem({
      vector: c.embedding,
      metadata: { ...c.metadata, text: c.text },
    });
  }
}

/**
 * Search by query embedding. Optional `filter` is a partial metadata
 * match — Phase 4 uses this with `{ game }` to scope retrieval to
 * the channel's configured game.
 */
export async function search(
  index: LocalIndex,
  queryEmbedding: number[],
  k: number,
  filter?: Partial<ChunkMetadata>,
): Promise<SearchResult[]> {
  const results = await index.queryItems(queryEmbedding, '', k, filter);
  return results.map((r) => {
    const meta = r.item.metadata as unknown as ChunkMetadata & { text: string };
    const { text, ...metadata } = meta;
    return { text, metadata, score: r.score };
  });
}

const RUNTIME_INDEX_PATH = path.resolve(process.cwd(), 'data/vectra');

let runtimeIndexPromise: Promise<LocalIndex> | null = null;

/**
 * Returns the runtime vectra index, loading it on first call.
 * Subsequent calls return the cached instance.
 *
 * Hard-fails (rejects) if the index doesn't exist on disk —
 * we don't want to silently degrade to non-RAG behavior.
 */
export function getRuntimeIndex(): Promise<LocalIndex> {
  if (!runtimeIndexPromise) {
    runtimeIndexPromise = openOrThrow();
  }
  return runtimeIndexPromise;
}

async function openOrThrow(): Promise<LocalIndex> {
  const index = new LocalIndex(RUNTIME_INDEX_PATH);
  if (!(await index.isIndexCreated())) {
    throw new Error(
      `Vectra index missing at ${RUNTIME_INDEX_PATH}/. Did you run 'npm run build:kb' and commit data/vectra/?`,
    );
  }
  return index;
}
