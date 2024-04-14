const CLASSES = {
    Barbarian: 'barbarian',
    Druid: 'druid',
    Necromancer: 'necromancer',
    Rogue: 'rogue',
    Sorceror: 'sorceror',
};

const CLASS_ALIAS_MAP = new Map([
    ['barb', CLASSES.Barbarian],
    ['drood', CLASSES.Druid],
    ['necro', CLASSES.Necromancer],
    ['sorc', CLASSES.Sorceror],
]);

const VALID_CLASSES = new Set(Object.values(CLASSES));

const BUILDS = {
    // barb
    DoubleSwing: 'double-swing',
    HammerOfTheAncients: 'hammer-of-the-ancients',
    Thorns: 'thorns',
    Upheaval: 'upheaval',
    WalkingArsenal: 'walking-arsenal',
    Whirlwind: 'whirlwind',

    // druid
    LightningShred: 'lightning-shred',
    LightningStorm: 'lightning-storm',
    PoisonShred: 'poison-shred',
    Pulverize: 'pulverize',
    Stormclaw: 'stormclaw',
    Trampleslide: 'trampleslide',
    WerewolfTornado: 'werewolf-tornado',

    // necromancer
    BlightCorpseExplosion: 'blight-corpse-explosion',
    BloodLance: 'blood-lance',
    BloodSurge: 'blood-surge',
    BoneSpear: 'bone-spear',
    BoneSpirit: 'bone-spirit',
    Infinimist: 'infinimist',
    PureSummoner: 'summoner',
    Sever: 'sever',
    ShadowSummoner: 'shadow-summoner',

    // rogue
    Barrage: 'barrage',
    DeathTrap: 'death-trap',
    Flurry: 'flurry',
    FlurryRapidFire: 'flurry-rapid-fire',
    RainOfArrows: 'rain-of-arrows',
    RapidFire: 'rapid-fire',
    PenetratingShot: 'penetrating-shot',
    TwistingBlades: 'twisting-blades',

    // sorc
    ArcLash: 'arc-lash',
    BallLightning: 'ball-lightning',
    Blizzard: 'blizzard',
    ChainLightning: 'chain-lightning',
    Fireball: 'fireball',
    Firewall: 'firewall',
    FrozenOrb: 'frozen-orb',
    IceShards: 'ice-shards',
    Meteor: 'meteor',
};

const VALID_BUILDS = new Set(Object.values(BUILDS));

const BUILD_ALIAS_MAP = new Map([
    // barb
    ['hota', BUILDS.HammerOfTheAncients],
    ['spin2win', BUILDS.Whirlwind],
    ['ww', BUILDS.Whirlwind],

    // necro
    ['blight-ce', BUILDS.BlightCorpseExplosion],
    ['bloodmist', BUILDS.Infinimist],

    // rogue
    ['tb', BUILDS.TwistingBlades],

    // sorc
    ['blizz', BUILDS.Blizzard],
    ['orb', BUILDS.FrozenOrb],
]);

const BUILD_CLASS_MAP = new Map([
    [CLASSES.Barbarian, new Set([
        BUILDS.DoubleSwing,
        BUILDS.HammerOfTheAncients,
        BUILDS.Thorns,
        BUILDS.Upheaval,
        BUILDS.WalkingArsenal,
        BUILDS.Whirlwind,
    ])],
    [CLASSES.Druid, new Set([
        BUILDS.LightningShred,
        BUILDS.LightningStorm,
        BUILDS.PoisonShred,
        BUILDS.Pulverize,
        BUILDS.Stormclaw,
        BUILDS.Trampleslide,
        BUILDS.WerewolfTornado,
    ])],
    [CLASSES.Necromancer, new Set([
        BUILDS.BlightCorpseExplosion,
        BUILDS.BloodLance,
        BUILDS.BloodSurge,
        BUILDS.BoneSpear,
        BUILDS.BoneSpirit,
        BUILDS.Infinimist,
        BUILDS.PureSummoner,
        BUILDS.Sever,
        BUILDS.ShadowSummoner,
    ])],
    [CLASSES.Rogue, new Set([
        BUILDS.Barrage,
        BUILDS.DeathTrap,
        BUILDS.Flurry,
        BUILDS.FlurryRapidFire,
        BUILDS.RainOfArrows,
        BUILDS.RapidFire,
        BUILDS.PenetratingShot,
        BUILDS.TwistingBlades,
    ])],
    [CLASSES.Sorceror, new Set([
        BUILDS.ArcLash,
        BUILDS.BallLightning,
        BUILDS.Blizzard,
        BUILDS.ChainLightning,
        BUILDS.Fireball,
        BUILDS.Firewall,
        BUILDS.FrozenOrb,
        BUILDS.IceShards,
        BUILDS.Meteor,
    ])],
]);

module.exports = {
    VALID_CLASSES,
    CLASS_ALIAS_MAP,
    VALID_BUILDS,
    BUILD_ALIAS_MAP,
    BUILD_CLASS_MAP,
};