const CLASSES = {
  Barbarian: "barbarian",
  Druid: "druid",
  Necromancer: "necromancer",
  Rogue: "rogue",
  Sorceror: "sorceror",
};

const CLASS_ALIAS_MAP = new Map([
  ["barb", CLASSES.Barbarian],
  ["drood", CLASSES.Druid],
  ["necro", CLASSES.Necromancer],
  ["sorc", CLASSES.Sorceror],
]);

const VALID_CLASSES = new Set(Object.values(CLASSES));

const BUILDS = {
  // barb
  Bash: "bash",
  DoubleSwing: "double-swing",
  Flay: "flay",
  HammerOfTheAncients: "hammer-of-the-ancients",
  KickDeathBlow: "kick-death-blow",
  Leapquake: "leapquake",
  Rend: "rend",
  Thorns: "thorns",
  Upheaval: "upheaval",
  Whirlwind: "whirlwind",

  // druid
  Boulder: "boulder",
  Companion: "companion",
  Hurricane: "hurricane",
  LightningStorm: "lightning-storm",
  Pulverize: "pulverize",
  Support: "support",
  Tornado: "tornado",
  Trampleslide: "trampleslide",
  WindShear: "wind-shear",

  // necromancer
  Blight: "blight",
  BloodLance: "blood-lance",
  BloodSurge: "blood-surge",
  BoneSpear: "bone-spear",
  BoneSpirit: "bone-spirit",
  Infinimist: "infinimist",
  Minion: "minion",
  Sever: "sever", // endgame

  // rogue
  AndarielsPuncture: "andariels-puncture", //a-p-r
  ArrowStorms: "arrow-storms",
  Barrage: "barrage",
  Flurry: "flurry",
  Grenade: "grenade",
  Heartseeker: "heartseeker",
  RapidFire: "rapid-fire",
  PenetratingShot: "penetrating-shot",
  ShadowStep: "shadow-step",
  TwistingBlades: "twisting-blades",

  // sorc
  ArcLash: "arc-lash",
  BallLightning: "ball-lightning",
  Blizzard: "blizzard",
  ChainLightning: "chain-lightning",
  Fireball: "fireball",
  FireBolt: "fire-bolt",
  Firewall: "firewall",
  FrozenOrb: "frozen-orb",
  IceShards: "ice-shards",
  LightningSpear: "lightning-spear",
  Meteor: "meteor",
};

const VALID_BUILDS = new Set(Object.values(BUILDS));

const BUILD_ALIAS_MAP = new Map([
  // barb
  ["hota", BUILDS.HammerOfTheAncients],
  ["spin2win", BUILDS.Whirlwind],
  ["ww", BUILDS.Whirlwind],

  // necro
  ["bloodmist", BUILDS.Infinimist],

  // rogue
  ["tb", BUILDS.TwistingBlades],

  // sorc
  ["blizz", BUILDS.Blizzard],
  ["orb", BUILDS.FrozenOrb],
]);

const BUILD_CLASS_MAP = new Map([
  [
    CLASSES.Barbarian,
    new Set([
      BUILDS.Bash,
      BUILDS.DoubleSwing,
      BUILDS.Flay,
      BUILDS.HammerOfTheAncients,
      BUILDS.KickDeathBlow,
      BUILDS.Leapquake,
      BUILDS.Rend,
      BUILDS.Thorns,
      BUILDS.Upheaval,
      BUILDS.Whirlwind,
    ]),
    [
      CLASSES.Druid,
      new Set([
        BUILDS.Boulder,
        BUILDS.Companion,
        BUILDS.Hurricane,
        BUILDS.LightningStorm,
        BUILDS.Pulverize,
        BUILDS.Support,
        BUILDS.Tornado,
        BUILDS.Trampleslide,
        BUILDS.WindShear,
      ]),
    ],
    [
      CLASSES.Necromancer,
      new Set([
        BUILDS.Blight,
        BUILDS.BloodLance,
        BUILDS.BloodSurge,
        BUILDS.BoneSpear,
        BUILDS.BoneSpirit,
        BUILDS.Infinimist,
        BUILDS.Minion,
        BUILDS.Sever,
      ]),
    ],
    [
      CLASSES.Rogue,
      new Set([
        BUILDS.AndarielsPuncture,
        BUILDS.Barrage,
        BUILDS.Flurry,
        BUILDS.Grenade,
        BUILDS.Heartseeker,
        BUILDS.RapidFire,
        BUILDS.PenetratingShot,
        BUILDS.ShadowStep,
        BUILDS.TwistingBlades,
      ]),
    ],
    [
      CLASSES.Sorceror,
      new Set([
        BUILDS.ArcLash,
        BUILDS.BallLightning,
        BUILDS.Blizzard,
        BUILDS.ChainLightning,
        BUILDS.Fireball,
        BUILDS.FireBolt,
        BUILDS.Firewall,
        BUILDS.FrozenOrb,
        BUILDS.IceShards,
        BUILDS.LightningSpear,
        BUILDS.Meteor,
      ]),
    ],
  ],
]);

module.exports = {
  VALID_CLASSES,
  CLASS_ALIAS_MAP,
  VALID_BUILDS,
  BUILD_ALIAS_MAP,
  BUILD_CLASS_MAP,
};
