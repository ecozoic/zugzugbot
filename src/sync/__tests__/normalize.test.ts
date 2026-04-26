import { describe, expect, it } from 'vitest';
import { normalizeSpellName } from '../normalize.js';

describe('normalizeSpellName', () => {
  it('lowercases and hyphenates basic spell names', () => {
    expect(normalizeSpellName('Wake of Ashes')).toBe('wake-of-ashes');
    expect(normalizeSpellName('Word of Glory')).toBe('word-of-glory');
  });

  it('strips apostrophes so possessives collapse rather than split', () => {
    expect(normalizeSpellName("Avenger's Shield")).toBe('avengers-shield');
    expect(normalizeSpellName("Hand of A'dal")).toBe('hand-of-adal');
  });

  it('drops colons (Power Word: Fortitude → power-word-fortitude)', () => {
    expect(normalizeSpellName('Power Word: Fortitude')).toBe(
      'power-word-fortitude',
    );
  });

  it('drops trailing punctuation like exclamation marks', () => {
    expect(normalizeSpellName('Lay on Hands!')).toBe('lay-on-hands');
  });

  it('trims surrounding whitespace and collapses internal whitespace', () => {
    expect(normalizeSpellName('   Spaced   ')).toBe('spaced');
    expect(normalizeSpellName('Spaced   Out   Name')).toBe('spaced-out-name');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeSpellName('')).toBe('');
  });

  it('handles parentheses by hyphenating across them', () => {
    expect(normalizeSpellName('Hammer of Wrath (Avenging Wrath)')).toBe(
      'hammer-of-wrath-avenging-wrath',
    );
  });

  it('collapses adjacent hyphens', () => {
    expect(normalizeSpellName('Foo  --  Bar')).toBe('foo-bar');
  });

  it('handles curly apostrophes the same as straight ones', () => {
    expect(normalizeSpellName('Avenger’s Shield')).toBe('avengers-shield');
  });
});
