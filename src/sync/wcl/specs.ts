/**
 * The 39 playable WoW specs and their WCL identity strings.
 *
 * `className` and `specName` use WCL's exact title-cased
 * names (verified against `worldData.classes`). `slug` is the
 * normalized lowercase form we use for filenames + the runtime
 * channel-game routing layer.
 *
 * `metric` selects which performance metric is appropriate per role:
 *   - dps  → all damage-dealers + tanks (WCL has no clean tank metric)
 *   - hps  → healers
 */

export type WclMetric = 'dps' | 'hps';
export type WclRole = 'tank' | 'healer' | 'dps';

export interface SpecEntry {
  className: string;
  specName: string;
  classSlug: string;
  specSlug: string;
  role: WclRole;
  metric: WclMetric;
}

export const SPECS: readonly SpecEntry[] = [
  {
    className: 'DeathKnight',
    specName: 'Blood',
    classSlug: 'death-knight',
    specSlug: 'blood',
    role: 'tank',
    metric: 'dps',
  },
  {
    className: 'DeathKnight',
    specName: 'Frost',
    classSlug: 'death-knight',
    specSlug: 'frost',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'DeathKnight',
    specName: 'Unholy',
    classSlug: 'death-knight',
    specSlug: 'unholy',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'DemonHunter',
    specName: 'Havoc',
    classSlug: 'demon-hunter',
    specSlug: 'havoc',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'DemonHunter',
    specName: 'Vengeance',
    classSlug: 'demon-hunter',
    specSlug: 'vengeance',
    role: 'tank',
    metric: 'dps',
  },

  {
    className: 'Druid',
    specName: 'Balance',
    classSlug: 'druid',
    specSlug: 'balance',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Druid',
    specName: 'Feral',
    classSlug: 'druid',
    specSlug: 'feral',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Druid',
    specName: 'Guardian',
    classSlug: 'druid',
    specSlug: 'guardian',
    role: 'tank',
    metric: 'dps',
  },
  {
    className: 'Druid',
    specName: 'Restoration',
    classSlug: 'druid',
    specSlug: 'restoration',
    role: 'healer',
    metric: 'hps',
  },

  {
    className: 'Evoker',
    specName: 'Devastation',
    classSlug: 'evoker',
    specSlug: 'devastation',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Evoker',
    specName: 'Preservation',
    classSlug: 'evoker',
    specSlug: 'preservation',
    role: 'healer',
    metric: 'hps',
  },
  {
    className: 'Evoker',
    specName: 'Augmentation',
    classSlug: 'evoker',
    specSlug: 'augmentation',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Hunter',
    specName: 'BeastMastery',
    classSlug: 'hunter',
    specSlug: 'beast-mastery',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Hunter',
    specName: 'Marksmanship',
    classSlug: 'hunter',
    specSlug: 'marksmanship',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Hunter',
    specName: 'Survival',
    classSlug: 'hunter',
    specSlug: 'survival',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Mage',
    specName: 'Arcane',
    classSlug: 'mage',
    specSlug: 'arcane',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Mage',
    specName: 'Fire',
    classSlug: 'mage',
    specSlug: 'fire',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Mage',
    specName: 'Frost',
    classSlug: 'mage',
    specSlug: 'frost',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Monk',
    specName: 'Brewmaster',
    classSlug: 'monk',
    specSlug: 'brewmaster',
    role: 'tank',
    metric: 'dps',
  },
  {
    className: 'Monk',
    specName: 'Mistweaver',
    classSlug: 'monk',
    specSlug: 'mistweaver',
    role: 'healer',
    metric: 'hps',
  },
  {
    className: 'Monk',
    specName: 'Windwalker',
    classSlug: 'monk',
    specSlug: 'windwalker',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Paladin',
    specName: 'Holy',
    classSlug: 'paladin',
    specSlug: 'holy',
    role: 'healer',
    metric: 'hps',
  },
  {
    className: 'Paladin',
    specName: 'Protection',
    classSlug: 'paladin',
    specSlug: 'protection',
    role: 'tank',
    metric: 'dps',
  },
  {
    className: 'Paladin',
    specName: 'Retribution',
    classSlug: 'paladin',
    specSlug: 'retribution',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Priest',
    specName: 'Discipline',
    classSlug: 'priest',
    specSlug: 'discipline',
    role: 'healer',
    metric: 'hps',
  },
  {
    className: 'Priest',
    specName: 'Holy',
    classSlug: 'priest',
    specSlug: 'holy',
    role: 'healer',
    metric: 'hps',
  },
  {
    className: 'Priest',
    specName: 'Shadow',
    classSlug: 'priest',
    specSlug: 'shadow',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Rogue',
    specName: 'Assassination',
    classSlug: 'rogue',
    specSlug: 'assassination',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Rogue',
    specName: 'Outlaw',
    classSlug: 'rogue',
    specSlug: 'outlaw',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Rogue',
    specName: 'Subtlety',
    classSlug: 'rogue',
    specSlug: 'subtlety',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Shaman',
    specName: 'Elemental',
    classSlug: 'shaman',
    specSlug: 'elemental',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Shaman',
    specName: 'Enhancement',
    classSlug: 'shaman',
    specSlug: 'enhancement',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Shaman',
    specName: 'Restoration',
    classSlug: 'shaman',
    specSlug: 'restoration',
    role: 'healer',
    metric: 'hps',
  },

  {
    className: 'Warlock',
    specName: 'Affliction',
    classSlug: 'warlock',
    specSlug: 'affliction',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Warlock',
    specName: 'Demonology',
    classSlug: 'warlock',
    specSlug: 'demonology',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Warlock',
    specName: 'Destruction',
    classSlug: 'warlock',
    specSlug: 'destruction',
    role: 'dps',
    metric: 'dps',
  },

  {
    className: 'Warrior',
    specName: 'Arms',
    classSlug: 'warrior',
    specSlug: 'arms',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Warrior',
    specName: 'Fury',
    classSlug: 'warrior',
    specSlug: 'fury',
    role: 'dps',
    metric: 'dps',
  },
  {
    className: 'Warrior',
    specName: 'Protection',
    classSlug: 'warrior',
    specSlug: 'protection',
    role: 'tank',
    metric: 'dps',
  },
];

export interface SpecFilter {
  classSlug?: string;
  specSlug?: string;
}

export function filterSpecs(filter: SpecFilter): SpecEntry[] {
  const cls = filter.classSlug?.toLowerCase();
  const spec = filter.specSlug?.toLowerCase();
  return SPECS.filter((s) => {
    if (cls && s.classSlug !== cls) return false;
    if (spec && s.specSlug !== spec) return false;
    return true;
  });
}
