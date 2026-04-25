import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildSystemPromptWithContext } from '../prompts.js';

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

  it('embeds context chunks in a sources block', () => {
    const prompt = buildSystemPromptWithContext('wow', [
      'Retribution paladin opener: Wake of Ashes → Crusader Strike.',
      'Holy Power generators: CS, BoJ, J.',
    ]);
    expect(prompt).toContain('<sources>');
    expect(prompt).toContain('Wake of Ashes');
    expect(prompt).toContain('Holy Power generators');
    expect(prompt).toMatch(/answer using only the information in the sources/i);
  });
});
