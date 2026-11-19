// activities.js: the work between jobs — taxi fares, a street race, and
// Solmara Arms, where money turns into firepower. Fares pay by distance with
// a tip for a fast, smooth ride, and consecutive fares chain a bonus — but a
// passenger only waits so long. The race has a rival to beat, a countdown, and
// a best time worth chasing. The shop's better stock is gated by rep.
import { ECONOMY, SHOP, WEAPONS } from './config.js';
import { ACTION_ENTER } from './input.js';
import { giveWeapon } from './player.js';
import { writeBestRaceMs } from './save.js';

// Two race routes, both starting on the Neon Row start line, alternating.
const RACE_ROUTES = [
  {
    name: 'Neon Loop', time: 100,
    checkpoints: [
      { x: 1600, y: 680 }, { x: 2300, y: 1350 }, { x: 1600, y: 2050 },
      { x: 900, y: 2050 }, { x: 900, y: 1000 }, { x: 1600, y: 680 },
    ],
  },
  {
    name: 'Coast Run', time: 110,
    checkpoints: [
      { x: 1600, y: 680 }, { x: 2300, y: 1000 }, { x: 2760, y: 500 },
      { x: 2760, y: 2000 }, { x: 2400, y: 2600 }, { x: 1600, y: 2050 }, { x: 1600, y: 680 },
    ],
  },
];

export function startTaxiFare(world) {
  const { state, city, random } = world;
  const p = state.player;
  if (state.taxi || !p.car) return;
  // A waiting passenger appears on a sidewalk near the player.
  const spot = city.randomRoadSpot();
  const px = spot.axis === 'h' ? spot.x : spot.line + 44;
  const py = spot.axis === 'h' ? spot.line + 44 : spot.y;
  const dest = city.randomRoadSpot();
  state.taxi = {
    state: 'pickup',
    px, py,
    dx: dest.axis === 'h' ? dest.x : dest.line,
    dy: dest.axis === 'h' ? dest.line : dest.y,
    fare: 0, riding: false,
    patience: ECONOMY.taxiPatience,
    chain: state.taxiChain || 0,
  };
  world.banner('Taxi fare', 'Pick up the passenger — follow the green marker', 3);
}

export function stepActivities(world, dt, input, events, actions) {
  const { state, city } = world;
  const p = state.player;
  state.taxiCooldown = Math.max(0, (state.taxiCooldown || 0) - dt);
  state.raceCooldown = Math.max(0, (state.raceCooldown || 0) - dt);
  // Driving a taxi is the taxi job: fares find the driver on their own.
  if (p.car && p.car.model === 'taxi' && !state.taxi && state.taxiCooldown <= 0) startTaxiFare(world);
  // The street race starts when a car rolls onto its start marker in Neon Row.
  if (p.car && !state.race && state.raceCooldown <= 0 && Math.hypot(p.x - 1600, p.y - 680) < 70) startRace(world);
  // --- Taxi ---
  const t = state.taxi;
  if (t) {
    if (!p.car) {
      state.taxi = null;
      state.taxiChain = 0;
      world.banner('Fare lost', 'You left the car.', 3);
    } else if (t.state === 'pickup') {
      // A passenger only waits so long.
      t.patience -= dt;
      if (t.patience <= 0) {
        state.taxi = null;
        state.taxiChain = 0;
        state.taxiCooldown = 8;
        world.banner('Fare lost', 'The passenger gave up waiting.', 3);
      } else if (Math.hypot(p.x - t.px, p.y - t.py) < 60) {
        t.state = 'ride'; t.riding = true;
        world.banner('Passenger aboard', 'Drive to the destination — fast and smooth pays more', 3);
      }
    } else if (t.state === 'ride' && Math.hypot(p.x - t.dx, p.y - t.dy) < 70) {
      const dist = Math.hypot(t.px - t.dx, t.py - t.dy);
      const fare = Math.round(ECONOMY.taxiFareBase + dist * ECONOMY.taxiFarePerMetre / 10);
      const tip = Math.abs(p.car.speed) > ECONOMY.taxiTipSpeed ? ECONOMY.taxiTip : 0;
      const chainBonus = (t.chain || 0) * ECONOMY.taxiChainBonus;
      const total = fare + tip + chainBonus;
      world.addMoney(total);
      state.stats.faresDone = (state.stats.faresDone || 0) + 1;
      state.taxiChain = (state.taxiChain || 0) + 1;
      world.banner('Fare complete!', `+$${total}${chainBonus > 0 ? ` (chain +$${chainBonus})` : ''}`, 3);
      events.push('cash');
      state.taxi = null;
      state.taxiCooldown = 8;
    }
  }
  // --- Street race: checkpoints in order, against the clock and a rival.
  const r = state.race;
  if (r) {
    if (!p.car) {
      state.race = null;
      if (r.rival) r.rival.driver = null;
    } else {
      if (r.countdown > 0) {
        r.countdown -= dt;
      } else {
        r.timer -= dt;
        r.elapsed += dt;
      }
      stepRival(world, r, dt);
      if (world.state.race !== r) return; // the rival already ended the race
      const cp = r.checkpoints[r.next];
      if (r.countdown <= 0 && cp && Math.hypot(p.x - cp.x, p.y - cp.y) < 70) {
        r.next += 1;
        events.push('pickup');
        if (r.next >= r.checkpoints.length) {
          finishRace(world, r, events);
          return;
        }
      }
      if (r && r.timer <= 0) {
        world.banner('Race lost', 'Out of time.', 3);
        if (r.rival) r.rival.driver = null;
        state.race = null; state.raceCooldown = 10;
      }
    }
  }
  // --- Shops: stand at the marker on foot and press E.
  if (p.onFoot && !state.shopOpen) {
    const near = nearShop(world);
    if (near && ((actions || 0) & ACTION_ENTER)) {
      state.shopOpen = near;
      events.push('shopOpen');
    }
  }
}

// The rival drives the same checkpoints at a steady pace; beat them to the line.
function stepRival(world, r, dt) {
  const rival = r.rival;
  if (!rival || rival.dead || r.countdown > 0) return;
  const cp = r.checkpoints[rival.next];
  if (!cp) return;
  const dx = cp.x - rival.x; const dy = cp.y - rival.y;
  const d = Math.hypot(dx, dy);
  if (d < 70) {
    rival.next += 1;
    if (rival.next >= r.checkpoints.length) {
      world.banner('Race lost', 'The rival beat you to the line.', 3);
      rival.driver = null;
      world.state.race = null;
      world.state.raceCooldown = 10;
    }
    return;
  }
  const want = Math.atan2(dy, dx);
  rival.angle += (((want - rival.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, 2.5 * dt);
  rival.speed += (250 - rival.speed) * Math.min(1, 2 * dt);
}

function finishRace(world, r, events) {
  const { state } = world;
  const bonus = Math.max(0, Math.round(r.timer)) * ECONOMY.raceTimeBonusPerSec;
  const rivalBonus = r.rival && r.rival.next < r.checkpoints.length ? ECONOMY.raceRivalBonus : 0;
  const total = ECONOMY.raceReward + bonus + rivalBonus;
  world.addMoney(total);
  state.stats.racesWon = (state.stats.racesWon || 0) + 1;
  const ms = Math.round((r.elapsed || 0) * 1000);
  if (ms > 0) {
    if (!state.stats.bestRaceMs || ms < state.stats.bestRaceMs) {
      state.stats.bestRaceMs = ms;
      writeBestRaceMs(ms);
    }
  }
  world.banner('Race won!', `+$${total}${rivalBonus > 0 ? ' — you beat the rival!' : ''}`, 3);
  events.push('cash');
  if (r.rival) r.rival.driver = null;
  state.race = null;
  state.raceCooldown = 10;
}

export function nearShop(world) {
  const { state, city } = world;
  const p = state.player;
  if (Math.hypot(p.x - city.places.arms.x, p.y - city.places.arms.y) < 70) return 'arms';
  if (Math.hypot(p.x - city.places.hospital.x, p.y - city.places.hospital.y) < 70) return 'hospital';
  return null;
}

export function startRace(world) {
  const { state } = world;
  if (state.race || !state.player.car) return;
  const route = RACE_ROUTES[(state.stats.racesWon || 0) % RACE_ROUTES.length];
  const rival = world.spawnCar('sport', 1600, 640, 0, 'npc');
  rival.targetSpeed = 250;
  rival.next = 0;
  state.race = { checkpoints: route.checkpoints, next: 0, timer: route.time, elapsed: 0, countdown: 3, name: route.name, rival };
  world.banner(`Street race: ${route.name}!`, '3… 2… 1… Hit every checkpoint before the clock runs out', 3);
}

/** The shop's shelf for the pause-menu UI: label, price, locked-by-rep, owned. */
export function shopCatalog(world) {
  const { state } = world;
  const kind = state.shopOpen;
  const items = [];
  const rep = state.rep || 0;
  if (kind === 'arms') {
    items.push({ label: 'Medkit — full health', price: SHOP.health.price, key: 'health' });
    items.push({ label: 'Kevlar Vest — full armor', price: SHOP.armor.price, key: 'armor' });
    items.push({ label: 'Ammo Box', price: SHOP.ammo.price, key: 'ammo' });
    for (const k of SHOP.weapons) {
      const owned = (world.state.player.owned || []).includes(k);
      const gate = SHOP.gates[k] || 0;
      const locked = !owned && rep < gate;
      items.push({
        label: `${WEAPONS[k].name}${owned ? ' (owned — equip)' : locked ? ` (needs REP ${gate})` : ''}`,
        price: owned ? 0 : WEAPONS[k].price, key: k, locked,
      });
    }
  } else {
    items.push({ label: 'Full treatment — health to 100', price: SHOP.health.price, key: 'health' });
    items.push({ label: 'Kevlar Vest — armor to 100', price: SHOP.armor.price, key: 'armor' });
  }
  return items;
}

export function buyItem(world, kind) {
  const { state } = world;
  const p = state.player;
  if (kind === 'health' || kind === 'armor' || kind === 'ammo') {
    const item = SHOP[kind];
    if (state.money < item.price) return false;
    state.money -= item.price;
    if (kind === 'health') p.health = 100;
    if (kind === 'armor') p.armor = 100;
    if (kind === 'ammo') { p.ammo.pistol += 48; p.ammo.smg += 128; p.ammo.shotgun += 24; }
    return true;
  }
  const w = WEAPONS[kind];
  if (!w || !w.price || state.money < w.price) return false;
  // Rep gates the better stock: no SMG before REP 10, no scattergun before 25.
  if ((SHOP.gates[kind] || 0) > (state.rep || 0)) return false;
  if ((p.owned || []).includes(kind)) return false; // already owned: equip instead
  state.money -= w.price;
  giveWeapon(world, kind);
  return true;
}

export function ownedWeapons(world) {
  return world.state.player.owned || ['fists'];
}
