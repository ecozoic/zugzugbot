import matter from 'gray-matter';
import type { Game } from '../types.js';

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  game: Game;
  source_file: string;
  heading_path: string;
  class?: string;
  spec?: string;
  topic?: string;
  source?: string;
  patch?: string;
}

const TARGET_WORDS = 350; // ~500 tokens for English (1 token ≈ 0.7 words)
const MIN_WORDS = 35; // ~50 tokens; below this drop the chunk
const SLACK_FACTOR = 1.3; // don't split a section that's only modestly oversized

const GAMES: readonly Game[] = ['wow', 'diablo', 'ff14'];

/**
 * Pure function: markdown string + filename → array of embeddable chunks.
 *
 * - Parses frontmatter (gray-matter); throws if `game` is missing/invalid
 * - Strips Obsidian wikilinks `[[x]]` / `[[x|y]]`
 * - Drops image embeds (markdown + Obsidian syntax)
 * - Splits body on H2/H3 boundaries; further splits oversized sections
 *   on paragraph boundaries
 * - Drops chunks below MIN_WORDS
 * - Each chunk inherits frontmatter as metadata + a derived heading_path
 */
export function chunk(rawMd: string, sourceFile: string): Chunk[] {
  const { data: frontmatter, content } = matter(rawMd);

  const game = frontmatter.game;
  if (!isGame(game)) {
    throw new Error(
      `${sourceFile}: missing or invalid 'game' frontmatter (got ${JSON.stringify(game)}; must be wow | diablo | ff14)`,
    );
  }

  const cleaned = stripObsidianSyntax(content);
  const sections = splitOnHeadings(cleaned);

  return sections
    .flatMap((section) => splitToTargetSize(section))
    .filter((s) => wordCount(s.text) >= MIN_WORDS)
    .map((s) => ({
      text: s.text,
      metadata: buildMetadata(frontmatter, sourceFile, s.headingPath),
    }));
}

function isGame(v: unknown): v is Game {
  return typeof v === 'string' && (GAMES as readonly string[]).includes(v);
}

function buildMetadata(
  frontmatter: Record<string, unknown>,
  sourceFile: string,
  headingPath: string,
): ChunkMetadata {
  const meta: ChunkMetadata = {
    game: frontmatter.game as Game,
    source_file: sourceFile,
    heading_path: headingPath,
  };
  // Pass through known optional string fields
  for (const key of ['class', 'spec', 'topic', 'source', 'patch'] as const) {
    const v = frontmatter[key];
    if (typeof v === 'string') meta[key] = v;
    else if (v !== undefined) meta[key] = String(v); // coerce e.g. patch numbers
  }
  return meta;
}

function stripObsidianSyntax(md: string): string {
  let s = md;
  // Image embeds first (before wikilinks, since ![[...]] would partially match)
  s = s.replace(/!\[\[[^\]]+\]\]/g, ''); // ![[image.png]]
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, ''); // ![alt](url)
  // Wikilinks with display text: [[page|display]] → display
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  // Bare wikilinks: [[page]] → page
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1');
  return s;
}

interface Section {
  text: string;
  headingPath: string;
}

function splitOnHeadings(md: string): Section[] {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let h2: string | null = null;
  let h3: string | null = null;
  let currentText: string[] = [];

  function flush() {
    const text = currentText.join('\n').trim();
    currentText = [];
    if (text.length === 0) return;
    const path = [h2, h3].filter(Boolean).join(' > ') || '(intro)';
    sections.push({ text, headingPath: path });
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      h2 = line.slice(3).trim();
      h3 = null;
    } else if (line.startsWith('### ')) {
      flush();
      h3 = line.slice(4).trim();
    } else if (line.startsWith('# ')) {
      // H1 = file title; treat content before first H2 as intro
      flush();
    } else {
      currentText.push(line);
    }
  }
  flush();
  return sections;
}

function splitToTargetSize(section: Section): Section[] {
  if (wordCount(section.text) <= TARGET_WORDS * SLACK_FACTOR) {
    return [section];
  }
  // Paragraph-aware split
  const paragraphs = section.text.split(/\n\n+/);
  const out: Section[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  for (const p of paragraphs) {
    const pw = wordCount(p);
    if (bufferWords + pw > TARGET_WORDS && buffer.length > 0) {
      out.push({ text: buffer.join('\n\n'), headingPath: section.headingPath });
      buffer = [p];
      bufferWords = pw;
    } else {
      buffer.push(p);
      bufferWords += pw;
    }
  }
  if (buffer.length > 0) {
    out.push({ text: buffer.join('\n\n'), headingPath: section.headingPath });
  }
  return out;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
