import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildSystemPromptWithContext } from '../prompts.js';
import type { SearchResult } from '../../rag/store.js';

describe('buildSystemPrompt', () => {
  it('names WoW for wow', () => {
    expect(buildSystemPrompt('wow')).toContain('World of Warcraft');
  });

  it('names Diablo 4 for diablo', () => {
    expect(buildSystemPrompt('diablo')).toContain('Diablo 4');
  });

  it('names FF14 for ff14', () => {
    expect(buildSystemPrompt('ff14')).toContain('Final Fantasy XIV');
  });

  it('includes the no-hallucination instruction', () => {
    const prompt = buildSystemPrompt('wow');
    expect(prompt).toMatch(/don't make things up/i);
  });
});

describe('buildSystemPromptWithContext', () => {
  it('returns the base prompt when no context chunks', () => {
    expect(buildSystemPromptWithContext('wow', [])).toBe(
      buildSystemPrompt('wow'),
    );
  });
});

describe('buildSystemPromptWithContext (with chunks)', () => {
  function makeChunk(
    text: string,
    sourceFile: string,
    headingPath: string,
  ): SearchResult {
    return {
      text,
      metadata: {
        game: 'wow',
        source_file: sourceFile,
        heading_path: headingPath,
      },
      score: 0.9,
    };
  }

  it('embeds chunk text in a sources block', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk(
        'Pre-pot Tempered Potion of Power 2 seconds before pull.',
        'wow/paladin-retribution.md',
        'Opener',
      ),
    ]);
    expect(prompt).toContain('<sources>');
    expect(prompt).toContain('Tempered Potion of Power');
    expect(prompt).toContain('paladin-retribution.md → Opener');
  });

  it('includes the no-fabrication instruction', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk('text', 'wow/x.md', 'Y'),
    ]);
    expect(prompt).toMatch(
      /answer.*using only the information in the sources/i,
    );
    expect(prompt).toMatch(/do not fall back to general knowledge/i);
  });

  it('omits heading arrow when path is "(intro)"', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk('intro paragraph', 'wow/general.md', '(intro)'),
    ]);
    expect(prompt).toContain('wow/general.md');
    expect(prompt).not.toContain('wow/general.md →');
  });

  it('numbers multiple sources sequentially', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      makeChunk('a', 'wow/x.md', 'Y'),
      makeChunk('b', 'wow/x.md', 'Z'),
      makeChunk('c', 'wow/y.md', 'Q'),
    ]);
    expect(prompt).toContain('[Source 1:');
    expect(prompt).toContain('[Source 2:');
    expect(prompt).toContain('[Source 3:');
  });
});
