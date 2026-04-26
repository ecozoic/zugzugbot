import { fetchStatic } from '../apis/blizzard/index.js';
import type {
  HeroTalentTree,
  PlayableClassIndexResponse,
  PlayableClassResponse,
  PlayableSpecializationResponse,
  TalentNode,
  TalentTooltipEntry,
  TalentTreeResponse,
} from '../apis/blizzard/index.js';

export type SourceType =
  | 'class_baseline'
  | 'spec_baseline'
  | 'class_talent'
  | 'spec_talent'
  | 'hero_talent';

export interface SpellRef {
  spellId: number;
  spellName: string;
  className: string;
  specs: string[];
  sourceType: SourceType;
  heroTree?: string;
  description?: string;
  castTime?: string;
  range?: string;
  cooldown?: string;
  powerCost?: string;
}

export interface WalkOptions {
  classFilter?: string;
  specFilter?: string;
}

/** Returns map keyed by spell_id with merged refs across the walk. */
export async function walkCatalog(
  opts: WalkOptions,
): Promise<Map<number, SpellRef>> {
  const catalog = new Map<number, SpellRef>();
  const classIndex = await fetchStatic<PlayableClassIndexResponse>(
    '/data/wow/playable-class/index',
  );

  const classFilterLower = opts.classFilter?.toLowerCase();
  const specFilterLower = opts.specFilter?.toLowerCase();

  for (const cls of classIndex.classes) {
    if (classFilterLower && cls.name.toLowerCase() !== classFilterLower) {
      continue;
    }
    const classData = await fetchStatic<PlayableClassResponse>(
      `/data/wow/playable-class/${cls.id}`,
    );
    const className = cls.name.toLowerCase();

    for (const specRef of classData.specializations) {
      if (specFilterLower && specRef.name.toLowerCase() !== specFilterLower) {
        continue;
      }
      const spec = await fetchStatic<PlayableSpecializationResponse>(
        `/data/wow/playable-specialization/${specRef.id}`,
      );
      const specName = spec.name.toLowerCase();

      const treeId = parseTalentTreeIdFromHref(spec.spec_talent_tree?.key.href);
      if (treeId === undefined) {
        console.warn(
          `[walk-catalog] no spec_talent_tree href for ${specName} ${className} — skipping talent walk`,
        );
        continue;
      }

      let tree: TalentTreeResponse;
      try {
        tree = await fetchStatic<TalentTreeResponse>(
          `/data/wow/talent-tree/${treeId}/playable-specialization/${spec.id}`,
        );
      } catch (err) {
        console.warn(
          `[walk-catalog] failed to fetch talent tree ${treeId} for ${specName} ${className}: ${(err as Error).message}`,
        );
        continue;
      }

      walkNodes(catalog, tree.class_talent_nodes, {
        className,
        specName,
        sourceType: 'class_talent',
      });
      walkNodes(catalog, tree.spec_talent_nodes, {
        className,
        specName,
        sourceType: 'spec_talent',
      });
      walkHeroTrees(catalog, tree.hero_talent_trees, className, specName);
    }
  }
  return catalog;
}

function parseTalentTreeIdFromHref(
  href: string | undefined,
): number | undefined {
  if (!href) return undefined;
  const match = /\/talent-tree\/(\d+)/.exec(href);
  if (!match) return undefined;
  return Number(match[1]);
}

interface NodeWalkContext {
  className: string;
  specName: string;
  sourceType: SourceType;
  heroTree?: string;
}

function walkNodes(
  catalog: Map<number, SpellRef>,
  nodes: TalentNode[] | undefined,
  ctx: NodeWalkContext,
): void {
  if (!nodes) {
    console.warn(
      `[walk-catalog] missing ${ctx.sourceType} nodes for ${ctx.specName} ${ctx.className}`,
    );
    return;
  }
  for (const node of nodes) {
    for (const rank of node.ranks ?? []) {
      const tooltips: TalentTooltipEntry[] = [];
      if (rank.tooltip) tooltips.push(rank.tooltip);
      if (rank.choice_of_tooltips) tooltips.push(...rank.choice_of_tooltips);
      for (const t of tooltips) {
        const spell = t.spell_tooltip?.spell;
        if (!spell) continue;
        registerSpell(catalog, {
          spellId: spell.id,
          spellName: spell.name,
          className: ctx.className,
          specs: [ctx.specName],
          sourceType: ctx.sourceType,
          ...(ctx.heroTree !== undefined ? { heroTree: ctx.heroTree } : {}),
          ...(t.spell_tooltip.description !== undefined
            ? { description: t.spell_tooltip.description }
            : {}),
          ...(t.spell_tooltip.cast_time !== undefined
            ? { castTime: t.spell_tooltip.cast_time }
            : {}),
          ...(t.spell_tooltip.range !== undefined
            ? { range: t.spell_tooltip.range }
            : {}),
          ...(t.spell_tooltip.cooldown !== undefined
            ? { cooldown: t.spell_tooltip.cooldown }
            : {}),
          ...(t.spell_tooltip.power_cost !== undefined
            ? { powerCost: t.spell_tooltip.power_cost }
            : {}),
        });
      }
    }
  }
}

function walkHeroTrees(
  catalog: Map<number, SpellRef>,
  heroTrees: HeroTalentTree[] | undefined,
  className: string,
  specName: string,
): void {
  if (!heroTrees) return;
  for (const hero of heroTrees) {
    const heroTreeKey = hero.name.toLowerCase().replace(/\s+/g, '-');
    walkNodes(catalog, hero.hero_talent_nodes, {
      className,
      specName,
      sourceType: 'hero_talent',
      heroTree: heroTreeKey,
    });
  }
}

const SOURCE_TYPE_PRIORITY: Record<SourceType, number> = {
  class_baseline: 0,
  spec_baseline: 1,
  class_talent: 2,
  spec_talent: 3,
  hero_talent: 4,
};

/**
 * Idempotent insert into the catalog. Exported so the overrides pass
 * can register spells it fetches while preserving the talent walk's
 * source-type priority + spec-merge semantics.
 */
export function registerSpell(
  catalog: Map<number, SpellRef>,
  ref: SpellRef,
): void {
  const existing = catalog.get(ref.spellId);
  if (!existing) {
    catalog.set(ref.spellId, ref);
    return;
  }
  const mergedSpecs = Array.from(new Set([...existing.specs, ...ref.specs]));
  const sourceType =
    SOURCE_TYPE_PRIORITY[existing.sourceType] <=
    SOURCE_TYPE_PRIORITY[ref.sourceType]
      ? existing.sourceType
      : ref.sourceType;
  const heroTree = existing.heroTree ?? ref.heroTree;
  const merged: SpellRef = {
    spellId: existing.spellId,
    spellName: existing.spellName,
    className: existing.className,
    specs: mergedSpecs,
    sourceType,
    ...(heroTree !== undefined ? { heroTree } : {}),
    ...((existing.description ?? ref.description)
      ? { description: existing.description ?? ref.description }
      : {}),
    ...((existing.castTime ?? ref.castTime)
      ? { castTime: existing.castTime ?? ref.castTime }
      : {}),
    ...((existing.range ?? ref.range)
      ? { range: existing.range ?? ref.range }
      : {}),
    ...((existing.cooldown ?? ref.cooldown)
      ? { cooldown: existing.cooldown ?? ref.cooldown }
      : {}),
    ...((existing.powerCost ?? ref.powerCost)
      ? { powerCost: existing.powerCost ?? ref.powerCost }
      : {}),
  };
  catalog.set(ref.spellId, merged);
}
