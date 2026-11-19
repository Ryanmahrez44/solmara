// save.js: the save slot in localStorage — money, rep, weapons, mission progress,
// stats and where Dario stands. Continue on the title screen loads it back.
// Saves carry a version, so an older slot still loads: a field the old save
// never had falls back to its default instead of breaking the game.
// Settings (mute, radio station) live apart from the save slot, so they
// survive a new game; the fastest race time keeps its own key.
import { BEST_KEY, SAVE_KEY, SETTINGS_KEY } from './config.js';

export const SAVE_VERSION = 2;

export function saveGame(world) {
  const s = world.state;
  const p = s.player;
  const data = {
    version: SAVE_VERSION,
    money: s.money, rep: s.rep, missionIndex: s.mission.index,
    missionsDone: s.stats.missionsDone, earned: s.stats.earned,
    playSeconds: Math.round(s.stats.playSeconds || 0),
    faresDone: s.stats.faresDone || 0, racesWon: s.stats.racesWon || 0,
    bestRaceMs: s.stats.bestRaceMs || 0,
    x: p.x, y: p.y, health: p.health, armor: p.armor,
    weapon: p.weapon, owned: p.owned, ammo: p.ammo,
    packages: s.packages.spots.map((sp) => sp.got),
    time: Date.now(),
  };
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function loadGame(world) {
  let data = null;
  try { data = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null'); }
  catch { data = null; }
  if (!data || typeof data !== 'object') return false;
  const s = world.state;
  const p = s.player;
  s.money = data.money ?? s.money;
  s.rep = data.rep ?? 0;
  s.mission.index = data.missionIndex || 0;
  s.stats.missionsDone = data.missionsDone || 0;
  s.stats.earned = data.earned || 0;
  s.stats.playSeconds = data.playSeconds || 0;
  s.stats.faresDone = data.faresDone || 0;
  s.stats.racesWon = data.racesWon || 0;
  s.stats.bestRaceMs = data.bestRaceMs || 0;
  p.x = data.x ?? p.x; p.y = data.y ?? p.y;
  p.health = data.health ?? 100; p.armor = data.armor ?? 0;
  p.weapon = data.weapon || 'fists';
  p.owned = Array.isArray(data.owned) && data.owned.length > 0 ? data.owned : ['fists'];
  // Merge with the fresh defaults so an old save with a partial ammo object
  // never leaves a weapon without a reserve count.
  p.ammo = { pistol: 24, smg: 64, shotgun: 12, ...(data.ammo || {}) };
  p.mag = 0; // reloaded from reserve on first use
  if (Array.isArray(data.packages)) {
    data.packages.forEach((got, i) => {
      if (s.packages.spots[i]) {
        s.packages.spots[i].got = !!got;
        if (got) s.packages.collected += 1;
      }
    });
  }
  return true;
}

export function hasSave() {
  try { return !!window.localStorage.getItem(SAVE_KEY); }
  catch { return false; }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); return true; }
  catch { return false; }
}

// A one-line summary for the title screen's Continue button ("$1,240 · 3 jobs").
export function readSaveMeta() {
  let data = null;
  try { data = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null'); }
  catch { data = null; }
  if (!data || typeof data !== 'object') return null;
  return {
    money: data.money || 0,
    missionsDone: data.missionsDone || 0,
    earned: data.earned || 0,
    savedAt: data.time || 0,
  };
}

// Settings live apart from the save slot: mute and radio survive a new game.
export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      muted: !!settings.muted,
      station: Number.isInteger(settings.station) ? settings.station : 0,
    }));
    return true;
  } catch { return false; }
}

export function loadSettings() {
  try {
    const data = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!data || typeof data !== 'object') return { muted: false, station: 0 };
    return { muted: !!data.muted, station: Number.isInteger(data.station) ? data.station : 0 };
  } catch { return { muted: false, station: 0 }; }
}

// Fastest street-race finish, kept beside the save slot (BEST_KEY).
export function readBestRaceMs() {
  try { return Number(window.localStorage.getItem(BEST_KEY) || 0) || 0; }
  catch { return 0; }
}

export function writeBestRaceMs(ms) {
  try {
    const best = readBestRaceMs();
    if (!best || ms < best) window.localStorage.setItem(BEST_KEY, String(Math.round(ms)));
    return true;
  } catch { return false; }
}
