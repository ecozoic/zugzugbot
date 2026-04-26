import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpellMediaResponse } from '../../apis/blizzard/index.js';
import type { SpellRef } from '../walk-catalog.js';

const fetchStaticMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock('../../apis/blizzard/index.js', () => ({
  fetchStatic: (path: string) => fetchStaticMock(path),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
}));

import { writeAbilityFile } from '../write-abilities.js';

const SPELL_ID = 255937;
const SYNCED_AT = '2026-04-26T18:00:00Z';
const PATCH = '12.0.5';

function fakeMedia(): SpellMediaResponse {
  return {
    assets: [
      {
        key: 'icon',
        value:
          'https://render.worldofwarcraft.com/us/icons/56/spell_paladin_executionsentence.jpg',
      },
    ],
  };
}

function withMediaResponse(media: SpellMediaResponse | Error): void {
  fetchStaticMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/data/wow/media/spell/')) {
      if (media instanceof Error) throw media;
      return media;
    }
    throw new Error(`Unexpected path in test: ${path}`);
  });
}

const baseRef: SpellRef = {
  spellId: SPELL_ID,
  spellName: 'Wake of Ashes',
  className: 'paladin',
  specs: ['retribution'],
  sourceType: 'spec_talent',
  description: 'Strikes targets in front of you with a wave of ashen flame.',
};

describe('writeAbilityFile', () => {
  beforeEach(() => {
    fetchStaticMock.mockReset();
    writeFileMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes a file with frontmatter containing every expected field', async () => {
    withMediaResponse(fakeMedia());

    const result = await writeAbilityFile({
      ref: baseRef,
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    expect(result.filename).toBe('255937-wake-of-ashes.md');
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileMock.mock.calls[0]!;
    expect(filePath).toContain('255937-wake-of-ashes.md');
    expect(content).toContain('game: wow');
    expect(content).toContain('kind: ability');
    expect(content).toContain('spell_id: 255937');
    expect(content).toContain('spell_name: Wake of Ashes');
    expect(content).toContain('spell_name_normalized: wake-of-ashes');
    expect(content).toContain('class: paladin');
    expect(content).toContain('specs: ["retribution"]');
    expect(content).toContain('source_type: spec_talent');
    expect(content).toContain('synced_from: blizzard-game-data-api');
    expect(content).toContain(`synced_at: "${SYNCED_AT}"`);
    expect(content).toContain(`patch: "${PATCH}"`);
    expect(content).toContain('icon_url: "https://');
  });

  it('renders empty specs array as `specs: []`', async () => {
    withMediaResponse(fakeMedia());

    await writeAbilityFile({
      ref: { ...baseRef, specs: [] },
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    const [, content] = writeFileMock.mock.calls[0]!;
    expect(content).toContain('specs: []');
  });

  it('writes `hero_tree: ~` when sourceType is not hero_talent', async () => {
    withMediaResponse(fakeMedia());

    await writeAbilityFile({
      ref: baseRef,
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    const [, content] = writeFileMock.mock.calls[0]!;
    expect(content).toContain('hero_tree: ~');
  });

  it('renders hero_tree value when present', async () => {
    withMediaResponse(fakeMedia());

    await writeAbilityFile({
      ref: {
        ...baseRef,
        sourceType: 'hero_talent',
        heroTree: 'herald-of-the-sun',
      },
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    const [, content] = writeFileMock.mock.calls[0]!;
    expect(content).toContain('hero_tree: herald-of-the-sun');
  });

  it('renders cast_time / range / cooldown / power_cost when present, ~ when absent', async () => {
    withMediaResponse(fakeMedia());

    await writeAbilityFile({
      ref: {
        ...baseRef,
        castTime: 'Instant',
        range: '40 yd range',
        cooldown: '45 sec cooldown',
      },
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    const [, content] = writeFileMock.mock.calls[0]!;
    expect(content).toContain('cast_time: Instant');
    expect(content).toContain('range: "40 yd range"');
    expect(content).toContain('cooldown: "45 sec cooldown"');
    expect(content).toContain('power_cost: ~');
  });

  it('formats body H1 as `<Name> (<Class>)`', async () => {
    withMediaResponse(fakeMedia());

    await writeAbilityFile({
      ref: baseRef,
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    const [, content] = writeFileMock.mock.calls[0]!;
    expect(content).toContain('# Wake of Ashes (Paladin)');
  });

  it('writes file without icon_url when media fetch 404s', async () => {
    withMediaResponse(new Error('Blizzard API 404'));

    const result = await writeAbilityFile({
      ref: baseRef,
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    const [, content] = writeFileMock.mock.calls[0]!;
    expect(content).toContain('icon_url: ~');
    expect(content).not.toContain('icon_url: https://');
  });

  it('returns warning when description contains placeholder tokens', async () => {
    withMediaResponse(fakeMedia());

    const result = await writeAbilityFile({
      ref: { ...baseRef, description: 'Deals $s1 Holy damage over $a1 sec.' },
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    expect(result.warning).toMatch(/placeholder tokens/);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });

  it('uses fallback body when description is empty', async () => {
    withMediaResponse(fakeMedia());

    await writeAbilityFile({
      ref: { ...baseRef, description: '' },
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    const [, content] = writeFileMock.mock.calls[0]!;
    expect(content).toContain('(no description returned by API)');
  });

  it('does not write when dryRun=true', async () => {
    withMediaResponse(fakeMedia());

    const result = await writeAbilityFile({
      ref: baseRef,
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(mkdirMock).not.toHaveBeenCalled();
  });

  it('produces filename keyed by spell id and normalized name', async () => {
    withMediaResponse(fakeMedia());

    const result = await writeAbilityFile({
      ref: { ...baseRef, spellId: 31935, spellName: "Avenger's Shield" },
      patch: PATCH,
      syncedAt: SYNCED_AT,
      dryRun: false,
    });

    expect(result.filename).toBe('31935-avengers-shield.md');
  });
});
