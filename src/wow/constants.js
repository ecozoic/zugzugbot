const CLASSES = {
    DeathKnight: 'death-knight',
    DemonHunter: 'demon-hunter',
    Druid: 'druid',
    Evoker: 'evoker',
    Hunter: 'hunter',
    Mage: 'mage',
    Monk: 'monk',
    Paladin: 'paladin',
    Priest: 'priest',
    Rogue: 'rogue',
    Shaman: 'shaman',
    Warlock: 'warlock',
    Warrior: 'warrior',
};

const VALID_CLASSES = new Set(Object.values(CLASSES));

const CLASS_ALIAS_MAP = new Map([
    ['dk', CLASSES.DeathKnight],
    ['dh', CLASSES.DemonHunter],
    ['drood', CLASSES.Druid],
    ['evo', CLASSES.Evoker],
    ['huntard', CLASSES.Hunter],
    ['pally', CLASSES.Paladin],
    ['sham', CLASSES.Shaman],
    ['lock', CLASSES.Warlock],
    ['warr', CLASSES.Warrior],
]);

const PATHS = {
    Guide: 'guide',
    Builds: 'builds',
    Rotation: 'rotation',
    Stats: 'stats',
    BiS: 'bis',
    Enchants: 'enchants',
};

const PATH_MAP = new Map([
    [PATHS.Guide, 'guide'],
    [PATHS.Builds, 'spec-builds-talents'],
    [PATHS.Rotation, 'rotation-cooldowns-abilities'],
    [PATHS.Stats, 'stat-priority'],
    [PATHS.BiS, 'gear-best-in-slot'],
    [PATHS.Enchants, 'gems-enchants-consumables'],
]);

const SPECS = {
    // dk
    Blood: 'blood',
    Frost: 'frost',
    Unholy: 'unholy',

    // dh
    Havoc: 'havoc',
    Vengeance: 'vengeance',

    // druid
    Balance: 'balance',
    Feral: 'feral',
    Guardian: 'guardian',
    Restoration: 'restoration',

    // evoker
    Devastation: 'devastation',
    Preservation: 'preservation',
    Augmentation: 'augmentation',

    // hunter
    BeastMastery: 'beast-mastery',
    Marksmanship: 'marksmanship',
    Survival: 'survival',

    // mage
    Arcane: 'arcane',
    Fire: 'fire',
    // Frost: 'frost',

    // monk
    Brewmaster: 'brewmaster',
    Mistweaver: 'mistweaver',
    Windwalker: 'windwalker',

    // paladin
    Holy: 'holy',
    Protection: 'protection',
    Retribution: 'retribution',

    // priest
    Discipline: 'discipline',
    // Holy: 'holy',
    Shadow: 'shadow',

    // rogue
    Assassination: 'assassination',
    Outlaw: 'outlaw',
    Subtlety: 'subtlety',

    // shaman
    Elemental: 'elemental',
    Enhancement: 'enhancement',
    // Restoration: 'restoration',

    // warlock
    Affliction: 'affliction',
    Demonology: 'demonology',
    Destruction: 'destruction',

    // warrior
    Arms: 'arms',
    Fury: 'fury',
    // Protection: 'protection',
};

const VALID_SPECS = new Set(Object.values(SPECS));

const SPEC_ALIAS_MAP = new Map([
    // dk
    ['uh', SPECS.Unholy],

    // druid
    ['boomkin', SPECS.Balance],
    ['cat', SPECS.Feral],
    ['bear', SPECS.Guardian],
    ['resto', SPECS.Restoration],

    // evoker
    ['dev', SPECS.Devastation],
    ['pre', SPECS.Preservation],
    ['aug', SPECS.Augmentation],

    // hunter
    ['bm', SPECS.BeastMastery],
    ['mm', SPECS.Marksmanship],
    ['sv', SPECS.Survival],

    // monk
    ['brew', SPECS.Brewmaster],
    ['mw', SPECS.Mistweaver],
    ['ww', SPECS.Windwalker],
    
    // pally
    ['prot', SPECS.Protection],
    ['ret', SPECS.Retribution],

    // priest
    ['disc', SPECS.Discipline],

    // rogue
    ['sin', SPECS.Assassination],
    ['sub', SPECS.Subtlety],

    // shaman
    ['ele', SPECS.Elemental],
    ['enh', SPECS.Enhancement],
    // ['resto', SPECS.Restoration],

    // warlock
    ['aff', SPECS.Affliction],
    ['demo', SPECS.Demonology],
    ['destro', SPECS.Destruction],

    // warrior
    // ['prot', SPECS.Protection],
]);

const ROLES = {
    Tank: 'tank',
    DPS: 'dps',
    Healer: 'healing',
};

const SPEC_ROLE_MAP = new Map([
    // dk
    [SPECS.Blood, ROLES.Tank],
    [SPECS.Frost, ROLES.DPS],
    [SPECS.Unholy, ROLES.DPS],

    // dh
    [SPECS.Havoc, ROLES.DPS],
    [SPECS.Vengeance, ROLES.Tank],

    // druid
    [SPECS.Balance, ROLES.DPS],
    [SPECS.Feral, ROLES.DPS],
    [SPECS.Guardian, ROLES.Tank],
    [SPECS.Restoration, ROLES.Healer],

    // evoker
    [SPECS.Devastation, ROLES.DPS],
    [SPECS.Preservation, ROLES.Healer],
    [SPECS.Augmentation, ROLES.DPS],

    // hunter
    [SPECS.BeastMastery, ROLES.DPS],
    [SPECS.Marksmanship, ROLES.DPS],
    [SPECS.Survival, ROLES.DPS],

    // mage
    [SPECS.Arcane, ROLES.DPS],
    [SPECS.Fire, ROLES.DPS],
    // [SPECS.Frost, ROLES.DPS],

    // monk
    [SPECS.Brewmaster, ROLES.Tank],
    [SPECS.Mistweaver, ROLES.Healer],
    [SPECS.Windwalker, ROLES.DPS],

    // paladin
    [SPECS.Holy, ROLES.Healer],
    [SPECS.Protection, ROLES.Tank],
    [SPECS.Retribution, ROLES.DPS],

    // priest
    [SPECS.Discipline, ROLES.Healer],
    // [SPECS.Holy, ROLES.Healer],
    [SPECS.Shadow, ROLES.DPS],

    // rogue
    [SPECS.Assassination, ROLES.DPS],
    [SPECS.Outlaw, ROLES.DPS],
    [SPECS.Subtlety, ROLES.DPS],

    // shaman
    [SPECS.Elemental, ROLES.DPS],
    [SPECS.Enhancement, ROLES.DPS],
    // [SPECS.Restoration, ROLES.Healer],

    // warlock
    [SPECS.Affliction, ROLES.DPS],
    [SPECS.Demonology, ROLES.DPS],
    [SPECS.Destruction, ROLES.DPS],

    // warrior
    [SPECS.Arms, ROLES.DPS],
    [SPECS.Fury, ROLES.DPS],
    // [SPECS.Protection, ROLES.Tank],
]);

const SPEC_CLASS_MAP = new Map([
    [CLASSES.DeathKnight, new Set([
        SPECS.Blood,
        SPECS.Frost,
        SPECS.Unholy,
    ])],
    [CLASSES.DemonHunter, new Set([
        SPECS.Havoc,
        SPECS.Vengeance,
    ])],
    [CLASSES.Druid, new Set([
        SPECS.Balance,
        SPECS.Feral,
        SPECS.Guardian,
        SPECS.Restoration,
    ])],
    [CLASSES.Evoker, new Set([
        SPECS.Devastation,
        SPECS.Preservation,
        SPECS.Augmentation,
    ])],
    [CLASSES.Hunter, new Set([
        SPECS.BeastMastery,
        SPECS.Marksmanship,
        SPECS.Survival,
    ])],
    [CLASSES.Mage, new Set([
        SPECS.Arcane,
        SPECS.Fire,
        SPECS.Frost,
    ])],
    [CLASSES.Monk, new Set([
        SPECS.Brewmaster,
        SPECS.Mistweaver,
        SPECS.Windwalker,
    ])],
    [CLASSES.Paladin, new Set([
        SPECS.Holy,
        SPECS.Protection,
        SPECS.Retribution,
    ])],
    [CLASSES.Priest, new Set([
        SPECS.Discipline,
        SPECS.Holy,
        SPECS.Shadow,
    ])],
    [CLASSES.Rogue, new Set([
        SPECS.Assassination,
        SPECS.Outlaw,
        SPECS.Subtlety,
    ])],
    [CLASSES.Shaman, new Set([
        SPECS.Elemental,
        SPECS.Enhancement,
        SPECS.Restoration,
    ])],
    [CLASSES.Warlock, new Set([
        SPECS.Affliction,
        SPECS.Demonology,
        SPECS.Destruction,
    ])],
    [CLASSES.Warrior, new Set([
        SPECS.Arms,
        SPECS.Fury,
        SPECS.Protection,
    ])],
]);

module.exports = {
    VALID_CLASSES,
    CLASS_ALIAS_MAP,
    VALID_SPECS,
    SPEC_ALIAS_MAP,
    PATHS,
    PATH_MAP,
    SPEC_ROLE_MAP,
    SPEC_CLASS_MAP,  
};