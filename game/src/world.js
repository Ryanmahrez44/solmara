// world.js: the one place that owns the game state and advances it. Subsystems
// (player, vehicles, peds, police, missions, activities) each own one job and
// take the world as a parameter, so nothing here reaches into their internals.
// step() runs in phases — clock, entities, projectiles, pickups, wanted — and
// returns the frame's events: sounds and announcements main.js plays.
// The clock drives a day phase (dawn, day, dusk, night) the renderer tints by,
// and the state tracks the run's stats (fares, races, play time) for the save.
import { CAR_MODELS, CITY_SIZE, ECONOMY, PLAYER, WANTED, WEAPONS, phaseAt } from './config.js';
import { createCity } from './city.js';
import { ACTION_ENTER } from './input.js';
import { stepPlayer } from './player.js';
import { stepVehicles, spawnTrafficCar, spawnPoliceCar, damageCar } from './vehicles.js';
import { stepPeds, spawnPed } from './peds.js';
import { stepPolice, spawnCopOnFoot, wantedStars } from './police.js';
import { startMission, updateMission, MISSIONS } from './missions.js';
import { stepActivities, startTaxiFare } from './activities.js';

export function createWorld(random) {
  const city = createCity(random);
  let state = null;
  let nextCarId = 1;

  function freshState() {
    return {
      time: 0, clockMin: 9 * 60, dayPhase: 'day', money: ECONOMY.startMoney, rep: 0,
      wanted: 0, lastSeen: -999, bustTimer: 0, wantedFlash: 0, roadblockCd: 0,
      player: {
        x: city.places.garage.x, y: city.places.garage.y, angle: -Math.PI / 2,
        vx: 0, vy: 0, onFoot: true, car: null,
        health: PLAYER.healthMax, armor: 0, weapon: 'fists', owned: ['fists'],
        ammo: { pistol: 24, smg: 64, shotgun: 12 }, mag: 0, reloading: 0,
        punchCd: 0, shootCd: 0, dead: false,
        stamina: PLAYER.staminaMax, runLocked: false, combo: 0, comboTimer: 0,
        magCache: {}, lastHurtAt: -999,
      },
      cars: [], peds: [], cops: [], guards: [], bullets: [], particles: [], pickups: [], skids: [],
      mission: { index: 0, step: 0, state: 'idle', data: {}, text: '', target: null, timer: 0, elapsed: 0 },
      taxi: null, race: null, taxiCooldown: 0, raceCooldown: 0, taxiChain: 0, pickupRespawnT: 0,
      packages: { spots: [], collected: 0, total: 12 },
      stats: { carsStolen: 0, shotsFired: 0, missionsDone: 0, earned: 0, pedsHit: 0, playSeconds: 0, faresDone: 0, racesWon: 0, bestRaceMs: 0 },
      banner: null, gameOver: null, shopOpen: null, radio: 0, muted: false,
    };
  }

  function banner(text, sub, dur) {
    state.banner = { text, sub: sub || '', until: state.time + (dur || 3) };
  }

  function addHeat(n, events) {
    const before = wantedStars(state.wanted);
    state.wanted = Math.min(WANTED.maxStars, state.wanted + n);
    if (state.wanted >= 1 && state.lastSeen < 0) state.lastSeen = state.time;
    // A fresh star flashes the screen edge red.
    if (wantedStars(state.wanted) > before) state.wantedFlash = 1;
  }

  function addMoney(n) {
    state.money += n;
    state.stats.earned += Math.max(0, n);
  }

  function addRep(n) {
    state.rep = Math.max(0, state.rep + n);
  }

  function heatLevel() { return wantedStars(state.wanted); }

  function spawnParticles(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      const a = random.next() * Math.PI * 2;
      const s = random.range(20, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random.range(life * 0.5, life), maxLife: life, color, size: random.range(size * 0.5, size) });
    }
  }

  function spawnExplosion(x, y, events) {
    spawnParticles(x, y, 26, '#ff9f1c', 260, 0.7, 7);
    spawnParticles(x, y, 16, '#3a3f4a', 140, 1.1, 10);
    spawnParticles(x, y, 10, '#ffe14d', 320, 0.4, 5);
    events.push('explosion');
    addHeat(0.4, events);
  }

  function spawnPickup(kind, x, y) {
    state.pickups.push({ x, y, kind, amount: 50, bob: 0 });
  }

  function damagePlayer(n, events) {
    const p = state.player;
    if (p.dead || state.gameOver) return;
    p.lastHurtAt = state.time;
    let left = n;
    if (p.armor > 0) { const absorbed = Math.min(p.armor, left); p.armor -= absorbed; left -= absorbed; }
    p.health -= left;
    events.push('hurt');
    if (p.health <= 0) {
      p.health = 0; p.dead = true; state.gameOver = 'wasted';
      spawnParticles(p.x, p.y, 18, '#c0392b', 160, 0.8, 6);
      events.push('wasted');
    }
  }

  function bustPlayer(events) {
    const p = state.player;
    p.dead = true; state.gameOver = 'busted';
    // The fine comes out of the wallet, not the void: 10% of the cash, $50 min.
    const fine = Math.min(state.money, Math.max(50, Math.floor(state.money * 0.1)));
    state.money = Math.max(0, state.money - fine);
    state.wanted = 0;
    events.push('busted');
  }

  function respawn(events) {
    const p = state.player;
    p.x = city.places.hospital.x; p.y = city.places.hospital.y;
    p.health = 60; p.armor = 0; p.dead = false; p.onFoot = true; p.car = null;
    p.weapon = 'fists'; p.mag = 0;
    p.stamina = PLAYER.staminaMax; p.runLocked = false; p.combo = 0; p.magCache = {};
    state.gameOver = null; state.wanted = 0; state.bustTimer = 0;
    state.cops = [];
    state.skids = []; state.bullets = [];
    for (const c of state.cars) if (c.driver === 'police') c.driver = 'npc';
    events.push('respawn');
  }

  function spawnCar(model, x, y, angle, driver) {
    const spec = CAR_MODELS[model];
    const car = {
      id: nextCarId++, model, x, y, angle, speed: 0,
      color: random.pick(spec.colors), health: 100, maxHealth: 100,
      driver: driver || null, traffic: null, targetSpeed: 0, stuck: 0, dead: false,
    };
    state.cars.push(car);
    return car;
  }

  function nearestCar(x, y, maxDist, predicate) {
    let best = null; let bestD = maxDist;
    for (const c of state.cars) {
      if (c.dead) continue;
      if (predicate && !predicate(c)) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function nearestPed(x, y, maxDist) {
    let best = null; let bestD = maxDist;
    for (const pd of state.peds) {
      if (pd.state === 'dead') continue;
      const d = Math.hypot(pd.x - x, pd.y - y);
      if (d < bestD) { bestD = d; best = pd; }
    }
    return best;
  }

  function seedPackages() {
    const spots = [];
    const tried = new Set();
    while (spots.length < state.packages.total) {
      const x = random.range(120, city.land - 120);
      const y = random.range(120, city.land - 120);
      const key = `${Math.floor(x / 200)},${Math.floor(y / 200)}`;
      if (tried.has(key) || city.isBlocked(x, y, 10) || city.onRoad(x, y)) continue;
      tried.add(key);
      spots.push({ x, y, got: false });
    }
    state.packages.spots = spots;
  }

  function seedWorld() {
    // Parked cars around the garage and the districts, plus one taxi.
    const spots = [
      ['sedan', 760, 660, 0], ['coupe', 640, 760, Math.PI / 2], ['pickup', 820, 760, -Math.PI / 2],
      ['taxi', 700, 880, 0], ['van', 1500, 1300, Math.PI], ['sport', 1650, 1400, 0],
      ['sedan', 2400, 2500, Math.PI / 2], ['coupe', 2500, 2650, 0], ['pickup', 500, 1500, Math.PI],
    ];
    for (const [model, x, y, a] of spots) spawnCar(model, x, y, a, null);
    for (let i = 0; i < 13; i += 1) spawnTrafficCar(world, random);
    for (let i = 0; i < 22; i += 1) spawnPed(world, random);
    spawnPickup('health', 760, 620);
    spawnPickup('armor', 1420, 1050);
    seedPackages();
  }

  function reset() {
    state = freshState();
    nextCarId = 1;
    seedWorld();
  }

  function maintainPopulation() {
    const p = state.player;
    // Traffic: keep the roads busy near the player, busier downtown.
    const target = Math.round(14 * (city.trafficFactor(p.x, p.y) || 1));
    let traffic = 0;
    for (const c of state.cars) if (c.driver === 'npc' && c.traffic) traffic += 1;
    state.cars = state.cars.filter((c) => {
      if (c.dead) return false;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (c.driver === 'npc' && c.traffic && d > 1500) return false;
      return true;
    });
    while (traffic < target && state.cars.length < 60) {
      const car = spawnTrafficCar(world, random);
      if (!car) break;
      traffic += 1;
    }
    // Pedestrians: keep ~22 near the player.
    state.peds = state.peds.filter((pd) => Math.hypot(pd.x - p.x, pd.y - p.y) < 1400 && pd.state !== 'dead');
    while (state.peds.length < 22) spawnPed(world, random);
    // Police cars follow the wanted level.
    const stars = wantedStars(state.wanted);
    let copCars = 0;
    for (const c of state.cars) if (c.driver === 'police') copCars += 1;
    if (stars >= 1 && copCars < WANTED.copsPerStar[stars]) spawnPoliceCar(world, random);
    if (stars === 0) for (const c of state.cars) if (c.driver === 'police') c.driver = 'npc';
  }

  function stepClock(dt) {
    state.time += dt;
    state.stats.playSeconds += dt;
    state.clockMin += dt * 0.5; // a game hour every 2 real minutes
    if (state.clockMin >= 1440) state.clockMin -= 1440;
    state.dayPhase = phaseAt(state.clockMin);
    if (state.banner && state.time > state.banner.until) state.banner = null;
    state.wantedFlash = Math.max(0, state.wantedFlash - dt * 1.5);
  }

  function stepEntities(dt, input, events, actions) {
    // ENTER is one press, not two: if Dario was on foot and just got into a car,
    // the same press must not throw him straight back out of it.
    const wasOnFoot = state.player.onFoot;
    stepPlayer(world, dt, input, events, actions);
    stepVehicles(world, dt, input, events, wasOnFoot ? (actions & ~ACTION_ENTER) : actions);
    // In a car, Dario is where the car is — the camera, the minimap and the
    // wanted logic all read the player's position.
    if (!state.player.onFoot && state.player.car) {
      state.player.x = state.player.car.x;
      state.player.y = state.player.car.y;
      state.player.angle = state.player.car.angle;
    }
    stepPeds(world, dt, events);
    stepPolice(world, dt, events);
    updateMission(world, dt, events);
    stepActivities(world, dt, input, events, actions);
    maintainPopulation();
  }

  function stepProjectiles(dt, events) {
    // Bullets fly and hit cars, peds, cops and the player.
    for (const b of state.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      const hit = checkBulletHit(b, events);
      if (hit) b.life = 0;
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    // Particles fade; skid marks fade slower.
    for (const pt of state.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.96; pt.vy *= 0.96; pt.life -= dt; }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
  }

  function stepPickups(dt, events) {
    const p = state.player;
    // Pickups bob; walking over one collects it.
    for (const pk of state.pickups) {
      pk.bob += dt;
      if (p.onFoot && Math.hypot(pk.x - p.x, pk.y - p.y) < 26) {
        if (pk.kind === 'health') p.health = Math.min(PLAYER.healthMax, p.health + pk.amount);
        if (pk.kind === 'armor') p.armor = Math.min(PLAYER.armorMax, p.armor + pk.amount);
        if (pk.kind === 'ammo') { p.ammo.pistol += 24; p.ammo.smg += 64; p.ammo.shotgun += 12; }
        events.push('pickup');
        pk.taken = true;
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.taken);
    // Pickups respawn: every 45 s a fresh one appears near the player, so the
    // map never runs dry of health, armor and ammo.
    state.pickupRespawnT += dt;
    if (state.pickupRespawnT > 45 && state.pickups.length < 3) {
      state.pickupRespawnT = 0;
      const spot = city.randomSidewalkSpot();
      spawnPickup(random.pick(['health', 'armor', 'ammo']), spot.x, spot.y);
    }
    // Hidden packages.
    for (const s of state.packages.spots) {
      if (!s.got && Math.hypot(s.x - p.x, s.y - p.y) < 30) {
        s.got = true; state.packages.collected += 1;
        addMoney(ECONOMY.packageReward);
        state.rep += 2;
        banner('Hidden package!', `+$${ECONOMY.packageReward}  (${state.packages.collected}/12)`);
        events.push('cash');
      }
    }
  }

  function stepWanted(dt) {
    // Wanted decay: hide from every cop for a while and the heat cools off.
    if (state.wanted > 0) {
      const p = state.player;
      const anySees = state.cops.some((c) => c.seesPlayer) || state.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 520);
      if (!anySees) {
        if (state.time - state.lastSeen > WANTED.decayDelay) state.wanted = Math.max(0, state.wanted - WANTED.decayRate * dt);
      } else state.lastSeen = state.time;
    }
  }

  function step(dt, input, actions) {
    const events = [];
    if (!state || state.gameOver || state.shopOpen) return events;
    stepClock(dt);
    stepEntities(dt, input, events, actions);
    stepProjectiles(dt, events);
    stepPickups(dt, events);
    stepWanted(dt);
    return events;
  }

  function checkBulletHit(b, events) {
    const p = state.player;
    if (b.from !== 'player' && p.onFoot && !p.dead && Math.hypot(b.x - p.x, b.y - p.y) < 14) {
      damagePlayer(b.damage, events);
      spawnParticles(b.x, b.y, 5, '#c0392b', 120, 0.4, 4);
      return true;
    }
    for (const c of state.cars) {
      if (c.dead) continue;
      const spec = CAR_MODELS[c.model];
      const dx = b.x - c.x; const dy = b.y - c.y;
      const ca = Math.cos(-c.angle); const sa = Math.sin(-c.angle);
      const lx = dx * ca - dy * sa; const ly = dx * sa + dy * ca;
      if (Math.abs(lx) < spec.w / 2 + 4 && Math.abs(ly) < spec.h / 2 + 4) {
        if (b.from === 'player') damageCar(world, c, b.damage, events);
        spawnParticles(b.x, b.y, 4, '#f39c12', 140, 0.3, 4);
        return true;
      }
    }
    for (const pd of state.peds) {
      if (pd.state === 'dead') continue;
      if (Math.hypot(b.x - pd.x, pd.y - pd.y) < 13) {
        pd.state = 'dead'; pd.deadAt = state.time;
        spawnParticles(pd.x, pd.y, 8, '#c0392b', 130, 0.5, 5);
        if (b.from === 'player') { addHeat(WANTED.heatPerPedHit, events); state.stats.pedsHit += 1; }
        return true;
      }
    }
    for (const cp of state.cops) {
      if (Math.hypot(b.x - cp.x, b.y - cp.y) < 13) {
        cp.health -= b.damage;
        spawnParticles(b.x, b.y, 5, '#c0392b', 130, 0.4, 4);
        if (cp.health <= 0) {
          cp.dead = true;
          if (b.from === 'player') {
            addHeat(WANTED.heatPerCopKill, events);
            events.push('backup'); // killing a cop brings more cops
          }
        }
        return true;
      }
    }
    for (const g of state.guards) {
      if (g.dead) continue;
      if (Math.hypot(b.x - g.x, b.y - g.y) < 13) {
        g.health -= b.damage;
        spawnParticles(b.x, b.y, 5, '#c0392b', 130, 0.4, 4);
        if (g.health <= 0) { g.dead = true; if (b.from === 'player') addHeat(WANTED.heatPerGuardKill, events); }
        return true;
      }
    }
    if (city.buildingAt(b.x, b.y, 2)) { spawnParticles(b.x, b.y, 3, '#b8a88f', 90, 0.25, 3); return true; }
    return false;
  }

  const world = {
    city, random, get state() { return state; },
    reset, step, banner, addHeat, addMoney, addRep, heatLevel, damagePlayer, bustPlayer, respawn,
    spawnParticles, spawnExplosion, spawnPickup, spawnCar, nearestCar, nearestPed,
    startMission: (i) => startMission(world, i),
    startTaxi: () => startTaxiFare(world),
    get missions() { return MISSIONS; },
  };
  reset();
  return world;
}
