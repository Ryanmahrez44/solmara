// player.js: Dario Cruz on foot — run, punch, aim and shoot, and steal cars.
// Entering a car: E near any parked or driven car. Stealing an occupied car
// pulls its driver out (a crime: the wanted level jumps). Exiting parks the
// player beside the car. On foot the player collides with buildings; in a car
// the vehicle module owns the movement.
//
// Revision pass 1.1: sprinting drains stamina (and locks out until it recovers),
// health creeps back after a calm stretch, punches chain into a three-hit combo,
// and C cycles through owned weapons, each keeping its own magazine.
import { CAR_MODELS, PLAYER, WANTED, WEAPONS, WEAPON_ORDER } from './config.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_RELOAD, ACTION_WEAPON } from './input.js';

function ensureFields(p) {
  if (p.stamina === undefined) p.stamina = PLAYER.staminaMax;
  if (p.runLocked === undefined) p.runLocked = false;
  if (p.combo === undefined) p.combo = 0;
  if (p.comboTimer === undefined) p.comboTimer = 0;
  if (p.magCache === undefined) p.magCache = {};
  if (p.lastHurtAt === undefined) p.lastHurtAt = -999;
}

export function stepPlayer(world, dt, input, events, actions) {
  const { state, city } = world;
  const p = state.player;
  if (p.dead) return;
  ensureFields(p);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.comboTimer = Math.max(0, p.comboTimer - dt);
  if (p.comboTimer <= 0) p.combo = 0;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const w = WEAPONS[p.weapon];
      const need = w.mag - p.mag;
      const take = Math.min(need, p.ammo[p.weapon] || 0);
      p.ammo[p.weapon] -= take; p.mag += take;
    }
  }
  // Health creeps back after a calm stretch (armor never does).
  if (!p.dead && p.health < PLAYER.healthMax && state.time - p.lastHurtAt > PLAYER.healthRegenDelay) {
    p.health = Math.min(PLAYER.healthMax, p.health + PLAYER.healthRegenRate * dt);
  }

  if (!p.onFoot) return; // driving is the vehicle module's job
  const move = input.move();
  const moving = !!(move.x || move.y);
  // Sprinting drains stamina; empty locks sprint until it recovers a little.
  const wantRun = input.running() && moving;
  if (wantRun && !p.runLocked) {
    p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * dt);
    if (p.stamina <= 0) p.runLocked = true;
  } else {
    p.stamina = Math.min(PLAYER.staminaMax, p.stamina + PLAYER.staminaRegen * dt);
    if (p.runLocked && p.stamina >= PLAYER.staminaRunLock) p.runLocked = false;
  }
  const sprinting = wantRun && !p.runLocked && p.stamina > 0;
  const len = Math.hypot(move.x, move.y) || 1;
  const speed = sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const tx = (move.x / len) * speed * (moving ? 1 : 0);
  const ty = (move.y / len) * speed * (moving ? 1 : 0);
  p.vx += (tx - p.vx) * Math.min(1, PLAYER.accel * dt / speed);
  p.vy += (ty - p.vy) * Math.min(1, PLAYER.accel * dt / speed);
  if (moving) p.angle = Math.atan2(p.vy, p.vx);

  // Move with building collision (slide along walls).
  const nx = p.x + p.vx * dt;
  if (!city.isBlocked(nx, p.y, PLAYER.radius)) p.x = nx; else p.vx = 0;
  const ny = p.y + p.vy * dt;
  if (!city.isBlocked(p.x, ny, PLAYER.radius)) p.y = ny; else p.vy = 0;

  const acts = actions || 0;
  if (acts & ACTION_ENTER) tryEnterCar(world, events);
  if (acts & ACTION_PUNCH) punch(world, events);
  if (acts & ACTION_RELOAD) reloadWeapon(world);
  if (acts & ACTION_WEAPON) cycleWeapon(world);

  // Shooting: mouse aims, click (or hold for automatics) fires.
  const w = WEAPONS[p.weapon];
  const aim = input.aim;
  if (aim) p.angle = Math.atan2(aim.y - p.y, aim.x - p.x);
  const wantShoot = input.mouse().down && (w.auto || input.mouse().clicked);
  if (wantShoot && p.weapon !== 'fists' && p.shootCd <= 0 && p.reloading <= 0) shoot(world, events);
  if (p.weapon !== 'fists' && p.mag === 0 && (p.ammo[p.weapon] || 0) > 0 && p.reloading <= 0) reloadWeapon(world);
}

function tryEnterCar(world, events) {
  const { state } = world;
  const p = state.player;
  const car = world.nearestCar(p.x, p.y, 64, (c) => !c.dead);
  if (!car) return;
  if (car.driver === 'npc' || car.driver === 'police') {
    // Steal it: the driver is pulled out onto the sidewalk.
    if (car.driver === 'npc') {
      world.spawnParticles(car.x, car.y, 6, '#f39c12', 120, 0.4, 4);
      state.peds.push({ x: car.x + 30, y: car.y + 30, angle: 0, speed: 0, state: 'flee', kind: 'worker', color: '#e67e22', shirt: '#e67e22', fleeX: car.x + 200, fleeY: car.y + 200, screamCd: 0, panic: 1 });
    }
    // The car alarm goes off: nearby pedestrians panic and run.
    for (const pd of state.peds) {
      if (pd.state !== 'dead' && Math.hypot(pd.x - car.x, pd.y - car.y) < 200) {
        pd.state = 'flee'; pd.panic = 1;
        pd.fleeX = pd.x + (pd.x - car.x) * 2; pd.fleeY = pd.y + (pd.y - car.y) * 2;
      }
    }
    world.addHeat(WANTED.heatPerCarTheft, events);
    state.stats.carsStolen += 1;
    events.push('steal');
  }
  car.driver = 'player';
  car.traffic = null;
  p.car = car;
  p.onFoot = false;
  p.vx = 0; p.vy = 0;
  events.push('enterCar');
}

export function exitCar(world, events) {
  const { state, city } = world;
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 34, y: car.y + Math.sin(car.angle + Math.PI / 2) * 34 };
  if (city.isBlocked(side.x, side.y, PLAYER.radius)) {
    side.x = car.x - Math.cos(car.angle + Math.PI / 2) * 34;
    side.y = car.y - Math.sin(car.angle + Math.PI / 2) * 34;
  }
  p.x = side.x; p.y = side.y;
  p.angle = car.angle;
  p.car = null;
  p.onFoot = true;
  events.push('exitCar');
}

/** C cycles to the next owned weapon; each weapon keeps its own magazine. */
function cycleWeapon(world) {
  const p = world.state.player;
  ensureFields(p);
  const owned = WEAPON_ORDER.filter((k) => (p.owned || ['fists']).includes(k));
  if (owned.length < 2) return;
  const at = owned.indexOf(p.weapon);
  const next = owned[(at + 1) % owned.length];
  if (next === p.weapon) return;
  if (p.weapon !== 'fists') p.magCache[p.weapon] = p.mag;
  p.weapon = next;
  p.reloading = 0;
  const w = WEAPONS[next];
  p.mag = next === 'fists' ? Infinity : (p.magCache[next] ?? w.mag);
}

function punch(world, events) {
  const { state } = world;
  const p = state.player;
  if (p.punchCd > 0) return;
  ensureFields(p);
  p.punchCd = WEAPONS.fists.interval;
  // A combo chains inside 0.9 s; the third punch hits harder and lunges.
  p.combo = p.comboTimer > 0 ? p.combo + 1 : 1;
  p.comboTimer = 0.9;
  const finisher = p.combo >= 3;
  if (finisher) {
    p.combo = 0;
    p.vx += Math.cos(p.angle) * 220;
    p.vy += Math.sin(p.angle) * 220;
  }
  const damage = PLAYER.punchDamage + (finisher ? PLAYER.punchComboBonus : 0);
  events.push('punch');
  const reach = PLAYER.punchRange + 14;
  const hx = p.x + Math.cos(p.angle) * reach;
  const hy = p.y + Math.sin(p.angle) * reach;
  for (const pd of state.peds) {
    if (pd.state !== 'dead' && Math.hypot(pd.x - hx, pd.y - hy) < 22) {
      pd.state = 'dead'; pd.deadAt = state.time;
      world.addHeat(WANTED.heatPerPedHit, events);
      world.spawnParticles(pd.x, pd.y, 6, '#c0392b', 120, 0.4, 4);
      return;
    }
  }
  for (const cp of state.cops) {
    if (!cp.dead && Math.hypot(cp.x - hx, cp.y - hy) < 22) {
      cp.health -= damage;
      if (cp.health <= 0) { cp.dead = true; world.addHeat(WANTED.heatPerCopKill, events); }
      return;
    }
  }
  for (const g of state.guards) {
    if (!g.dead && Math.hypot(g.x - hx, g.y - hy) < 22) {
      g.health -= damage;
      if (g.health <= 0) g.dead = true;
      return;
    }
  }
}

function reloadWeapon(world) {
  const p = world.state.player;
  const w = WEAPONS[p.weapon];
  if (p.weapon === 'fists' || p.mag >= w.mag || (p.ammo[p.weapon] || 0) <= 0 || p.reloading > 0) return;
  p.reloading = w.reload;
}

function shoot(world, events) {
  const { state } = world;
  const p = state.player;
  const w = WEAPONS[p.weapon];
  if (p.mag <= 0) { reloadWeapon(world); return; }
  p.mag -= 1;
  p.shootCd = w.interval;
  state.stats.shotsFired += 1;
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i += 1) {
    const a = p.angle + (Math.random() - 0.5) * 2 * w.spread;
    state.bullets.push({
      x: p.x + Math.cos(p.angle) * 20, y: p.y + Math.sin(p.angle) * 20,
      vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
      life: w.range / w.speed, damage: w.damage, from: 'player',
    });
  }
  world.spawnParticles(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, 3, '#ffe14d', 160, 0.15, 4);
  world.addHeat(WANTED.heatPerShot, events);
  events.push('shoot');
}

export function giveWeapon(world, kind) {
  const p = world.state.player;
  ensureFields(p);
  p.weapon = kind;
  if (!p.owned.includes(kind)) p.owned.push(kind);
  const w = WEAPONS[kind];
  p.mag = w.mag;
  p.magCache[kind] = w.mag;
  if (kind === 'pistol') p.ammo.pistol = Math.max(p.ammo.pistol, 24);
  if (kind === 'smg') p.ammo.smg = Math.max(p.ammo.smg, 64);
  if (kind === 'shotgun') p.ammo.shotgun = Math.max(p.ammo.shotgun, 12);
}
