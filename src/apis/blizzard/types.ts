export interface PlayableClassIndexResponse {
  classes: Array<{ id: number; name: string; key: { href: string } }>;
}

export interface PlayableClassResponse {
  id: number;
  name: string;
  specializations: Array<{ id: number; name: string; key: { href: string } }>;
}

export interface SpellRef {
  id: number;
  name: string;
  key?: { href: string };
}

export interface SpellTooltipFull {
  spell: SpellRef;
  description?: string;
  cast_time?: string;
  range?: string;
  cooldown?: string;
  power_cost?: string;
}

export interface TalentTooltipEntry {
  talent: { id: number; name: string; key: { href: string } };
  spell_tooltip: SpellTooltipFull;
}

export interface TalentRank {
  rank: number;
  tooltip?: TalentTooltipEntry;
  choice_of_tooltips?: TalentTooltipEntry[];
}

export interface TalentNode {
  id: number;
  display_row?: number;
  display_col?: number;
  unlocks?: number[];
  locked_by?: number[];
  node_type?: { id: number; type: string };
  ranks?: TalentRank[];
}

export interface HeroTalentTree {
  id: number;
  name: string;
  hero_talent_nodes?: TalentNode[];
}

export interface PlayableSpecializationResponse {
  id: number;
  name: string;
  role?: { type: string; name: string };
  playable_class?: { id: number; name: string };
  spec_talent_tree?: { name: string; key: { href: string } };
  hero_talent_trees?: Array<{
    id: number;
    name: string;
    key: { href: string };
  }>;
}

export interface TalentTreeResponse {
  id: number;
  class_talent_nodes?: TalentNode[];
  spec_talent_nodes?: TalentNode[];
  hero_talent_trees?: HeroTalentTree[];
}

export interface SpellResponse {
  id: number;
  name: string;
  description?: string;
}

export interface SpellMediaResponse {
  assets: Array<{ key: string; value: string }>;
}
