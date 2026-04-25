import { describe, expect, it } from 'vitest';
import { chunk } from '../chunk.js';

describe('chunk', () => {
  describe('frontmatter', () => {
    it('throws on missing game', () => {
      const md = '---\nclass: paladin\n---\n\n## Body\n\nstuff';
      expect(() => chunk(md, 'test.md')).toThrow(/missing or invalid 'game'/);
    });

    it('throws on invalid game', () => {
      const md = '---\ngame: starcraft\n---\n\n## Body\n\nstuff';
      expect(() => chunk(md, 'test.md')).toThrow(
        /must be wow \| diablo \| ff14/,
      );
    });

    it('passes through optional string fields as metadata', () => {
      const md = `---
game: wow
class: paladin
spec: retribution
topic: rotation
source: wowhead-manual
patch: '11.1'
---

## Opener

${'word '.repeat(50)}`;
      const chunks = chunk(md, 'wow/paladin-retribution.md');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.metadata).toMatchObject({
        game: 'wow',
        class: 'paladin',
        spec: 'retribution',
        topic: 'rotation',
        source: 'wowhead-manual',
        patch: '11.1',
        source_file: 'wow/paladin-retribution.md',
      });
    });
  });

  describe('Obsidian syntax stripping', () => {
    it('strips bare wikilinks', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\nSee [[Wake of Ashes]] for details. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).toContain('See Wake of Ashes for details.');
      expect(chunks[0]!.text).not.toContain('[[');
    });

    it('strips wikilinks with display text', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\nUse [[Wake_of_Ashes|WoA]] early. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).toContain('Use WoA early.');
      expect(chunks[0]!.text).not.toContain('Wake_of_Ashes');
    });

    it('drops image embeds', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\n![[talents.png]]\n\nText after. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).not.toContain('talents.png');
      expect(chunks[0]!.text).toContain('Text after.');
    });

    it('drops standard markdown images', () => {
      const md = `---\ngame: wow\n---\n\n## Body\n\n![chart](https://example.com/chart.png)\n\nText. ${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.text).not.toContain('chart');
      expect(chunks[0]!.text).not.toContain('example.com');
      expect(chunks[0]!.text).toContain('Text.');
    });
  });

  describe('heading splits', () => {
    it('splits on H2 boundaries', () => {
      const md = `---\ngame: wow\n---\n\n## Opener\n\n${'word '.repeat(40)}\n\n## Steady State\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.metadata.heading_path).toBe('Opener');
      expect(chunks[1]!.metadata.heading_path).toBe('Steady State');
    });

    it('joins H2 + H3 into heading_path', () => {
      const md = `---\ngame: wow\n---\n\n## Opener\n\n### Phase 1\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.metadata.heading_path).toBe('Opener > Phase 1');
    });

    it('labels pre-H2 content as (intro)', () => {
      const md = `---\ngame: wow\n---\n\n# Title\n\nIntro paragraph. ${'word '.repeat(40)}\n\n## Section\n\n${'word '.repeat(40)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks[0]!.metadata.heading_path).toBe('(intro)');
      expect(chunks[1]!.metadata.heading_path).toBe('Section');
    });
  });

  describe('size limits', () => {
    it('drops chunks below MIN_WORDS', () => {
      const md = `---\ngame: wow\n---\n\n## Tiny\n\nfew words here\n\n## Big\n\n${'word '.repeat(50)}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.metadata.heading_path).toBe('Big');
    });

    it('splits oversized sections on paragraph boundaries', () => {
      const para = `${'word '.repeat(200)}`;
      const md = `---\ngame: wow\n---\n\n## Long\n\n${para}\n\n${para}\n\n${para}`;
      const chunks = chunk(md, 'test.md');
      expect(chunks.length).toBeGreaterThan(1);
      // All chunks should share the heading_path
      for (const c of chunks) {
        expect(c.metadata.heading_path).toBe('Long');
      }
    });
  });
});
