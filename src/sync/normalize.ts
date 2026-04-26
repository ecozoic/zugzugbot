/**
 * Normalize a spell name for use as an index key and filename slug.
 *
 * Rules:
 * - Lowercase
 * - Apostrophes (straight + curly), colons, commas, periods, exclamation
 *   marks → stripped (so `Avenger's Shield` collapses, not splits)
 * - Whitespace + remaining non-alphanumerics → single hyphen
 * - Collapse adjacent hyphens
 * - Trim leading/trailing hyphens
 *
 * Examples:
 *   "Wake of Ashes"          → "wake-of-ashes"
 *   "Avenger's Shield"       → "avengers-shield"
 *   "Power Word: Fortitude"  → "power-word-fortitude"
 *   "Hand of A'dal"          → "hand-of-adal"
 *   "Lay on Hands!"          → "lay-on-hands"
 */
export function normalizeSpellName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['‘’‚‛,.:!?]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
