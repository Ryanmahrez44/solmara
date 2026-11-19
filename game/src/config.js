// SOLMARA — Streets of the Sun. config.js: every tuned number, colour and name in
// one place, so the rest of the game reads like a design document.
// The city is "Solmara", a sun-soaked coastal city of our own: no name, character,
// vehicle, map or asset comes from any commercial game.
//
// Revision pass 1.1: districts carry their own traffic/police density, weapons and
// cars are rebalanced, the wanted system grows roadblocks, and the economy pays
// for clean, fast work (par-time and no-heat bonuses, taxi fare chains).
export const VERSION = '1.1.0';
export const STEP = 1 / 60;
export const CITY_SIZE = 3200;
export const BLOCK = 260;
export const ROAD_W = 64;
export const LANE = 12;

// Palette: warm Vice-City-like sun, turquoise sea, pastel art-deco, neon nights.
export const COLORS = {
  asphalt: '#3a3f4a',
  asphaltDark: '#31353f',
  lane: '#e8d27a',
  sidewalk: '#b8a88f',
  sidewalkEdge: '#9a8a72',
  sand: '#ecd9a0',
  sandWet: '#dcc78d',
  sea: '#1fa8c9',
  seaDeep: '#0f7fa8',
  grass: '#7fb069',
  park: '#6da25e',
  buildingRoof: ['#e07856', '#e8a87c', '#d96c7b', '#7fb3d5', '#f2c14e', '#a78bfa', '#8ecae6', '#ffb703'],
  buildingWall: '#f4ead8',
  neonPink: '#ff2e88',
  neonCyan: '#00e5ff',
  neonYellow: '#ffe14d',
  policeWhite: '#f2f2f2',
  policeBlack: '#1c2430',
  taxiYellow: '#ffc300',
  duskTint: 'rgba(255,110,40,0.16)',
  nightTint: 'rgba(8,18,54,0.38)',
};

// traffic / police: density multipliers the spawn director reads per district.
export const DISTRICTS = [
  { name: 'Marina Bay', x0: 0, y0: 2240, x1: 3200, y1: 3200, tint: '#eaf6ff', traffic: 0.9, police: 0.8 },
  { name: 'Neon Row', x0: 1150, y0: 900, x1: 2050, y1: 1800, tint: '#ffe9f4', traffic: 1.5, police: 1.2 },
  { name: 'Old Town', x0: 0, y0: 900, x1: 1150, y1: 2240, tint: '#fff3d6', traffic: 1.0, police: 1.0 },
  { name: 'Portside', x0: 2050, y0: 0, x1: 3200, y1: 900, tint: '#e8e2d5', traffic: 0.8, police: 1.1 },
  { name: 'Bayside', x0: 2050, y0: 900, x1: 3200, y1: 2240, tint: '#e6f2ef', traffic: 1.0, police: 0.9 },
  { name: 'Hillside', x0: 0, y0: 0, x1: 1150, y1: 900, tint: '#e6f2df', traffic: 0.6, police: 0.7 },
  { name: 'The Strip', x0: 1150, y0: 1800, x1: 2050, y1: 2240, tint: '#f3e4ff', traffic: 1.3, police: 1.1 },
];

// Time of day from the game clock (minutes since midnight).
export function phaseAt(clockMin) {
  if (clockMin >= 360 && clockMin < 480) return 'dawn';
  if (clockMin >= 480 && clockMin < 1080) return 'day';
  if (clockMin >= 1080 && clockMin < 1200) return 'dusk';
  return 'night';
}

// Player / on-foot tuning.
export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  runSpeed: 265,
  accel: 1400,
  healthMax: 100,
  armorMax: 100,
  punchDamage: 12,
  punchComboBonus: 6, // the third punch in a combo hits harder
  punchRange: 34,
  punchCooldown: 0.38,
  staminaMax: 100,
  staminaDrain: 22, // per second while sprinting
  staminaRegen: 14, // per second while not sprinting
  staminaRunLock: 25, // sprint stays locked until stamina recovers past this
  healthRegenDelay: 10, // seconds calm before health starts coming back
  healthRegenRate: 4, // health per second once calm
};

// Weapons: name, damage, fire interval, spread, range, bullet speed, mag, reload.
export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, interval: 0.38, spread: 0, range: 34, speed: 0, mag: Infinity, reload: 0, auto: false },
  pistol: { name: 'P9 Pistol', damage: 24, interval: 0.24, spread: 0.05, range: 460, speed: 950, mag: 12, reload: 0.9, auto: false, price: 500 },
  smg: { name: 'VK-9 SMG', damage: 13, interval: 0.08, spread: 0.11, range: 380, speed: 1000, mag: 32, reload: 1.1, auto: true, price: 1500 },
  shotgun: { name: 'M12 Scattergun', damage: 16, interval: 0.85, spread: 0.2, range: 300, speed: 850, mag: 6, reload: 1.6, auto: false, pellets: 7, price: 2600 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

// Car models: top speed, acceleration, grip (steering), size, colours, offroad
// (1 = sand barely slows it, 0.5 = the beach eats half its speed).
export const CAR_MODELS = {
  sedan: { name: 'Solmar Sedan', top: 330, accel: 230, grip: 2.6, w: 46, h: 22, offroad: 0.7, colors: ['#c0392b', '#2e86c1', '#7d3c98', '#b7950b', '#5d6d7e'] },
  coupe: { name: 'Vela Coupe', top: 360, accel: 260, grip: 2.9, w: 44, h: 21, offroad: 0.6, colors: ['#e74c3c', '#f39c12', '#16a085'] },
  taxi: { name: 'City Cab', top: 310, accel: 210, grip: 2.5, w: 46, h: 22, offroad: 0.7, colors: ['#ffc300'] },
  van: { name: 'Cargo Van', top: 270, accel: 170, grip: 2.1, w: 52, h: 24, offroad: 0.75, colors: ['#95a5a6', '#5d6d7e', '#a569bd'] },
  truck: { name: 'Hauler Truck', top: 250, accel: 150, grip: 1.9, w: 62, h: 26, offroad: 0.85, colors: ['#6e5100', '#7b7d7d'] },
  sport: { name: 'Cometa GT', top: 430, accel: 330, grip: 3.4, w: 46, h: 21, offroad: 0.5, colors: ['#ff2e88', '#00e5ff', '#ffe14d'] },
  pickup: { name: 'Rancho Pickup', top: 300, accel: 200, grip: 2.4, w: 50, h: 23, offroad: 0.9, colors: ['#229954', '#b03a2e', '#2c3e50'] },
  police: { name: 'SMPD Interceptor', top: 400, accel: 310, grip: 3.2, w: 48, h: 22, offroad: 0.7, colors: ['#f2f2f2'] },
};

// Wanted / police tuning.
export const WANTED = {
  maxStars: 5,
  decayDelay: 9, // seconds unseen before stars start falling
  decayRate: 0.25, // stars per second once hidden
  heatPerCarTheft: 0.9,
  heatPerPedHit: 0.5,
  heatPerShot: 0.08,
  heatPerCopKill: 1.0,
  heatPerGuardKill: 0.3,
  heatPerCrash: 0.12,
  copsPerStar: [0, 1, 2, 3, 4, 5],
  copCatchRadius: 26,
  copRamDamage: 6,
  copFootSpeed: 185,
  copSprintSpeed: 205, // at 4+ stars officers run the player down
  bustTime: 2.2, // seconds a cop must touch the player on foot to bust
  roadblockStars: 3, // from 3 stars the SMPD sets roadblocks ahead of the player
  roadblockCooldown: 25,
};

// Economy.
export const ECONOMY = {
  startMoney: 150,
  taxiFareBase: 45,
  taxiFarePerMetre: 0.4,
  taxiTip: 25,
  taxiTipSpeed: 200, // average speed above this earns the tip
  taxiChainBonus: 10, // extra per consecutive fare without losing one
  taxiPatience: 75, // seconds to reach a waiting passenger
  packageReward: 250,
  raceReward: 400,
  raceTimeBonusPerSec: 5,
  raceRivalBonus: 250,
  missionRewards: [400, 800, 1200, 1800, 2400, 4000],
  parBonusPct: 0.25, // finish under par time: +25% of the mission reward
  cleanBonus: 150, // finish a mission with no wanted level at all
  sportCarPrice: 5000,
  healthCost: 60,
  armorCost: 120,
  ammoCost: 80,
};

// Missions unlock in order; rep gates the shop's better stock.
export const SHOP = {
  weapons: ['pistol', 'smg', 'shotgun'],
  gates: { pistol: 0, smg: 10, shotgun: 25 }, // rep needed before the shop sells it
  health: { name: 'Medkit', price: 60 },
  armor: { name: 'Kevlar Vest', price: 120 },
  ammo: { name: 'Ammo Box', price: 80 },
};

export const SAVE_KEY = 'solmara-save-v1';
export const SETTINGS_KEY = 'solmara-settings-v1';
export const BEST_KEY = 'solmara-best-v1';
