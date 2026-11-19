// police.js: the Solmara Police Department. Wanted stars 1-5 drive how many
// interceptors hunt the player and how many officers patrol on foot. Cops see
// the player when close and in the open; hide long enough and the heat cools.
// A cop that reaches the player on foot holds them until busted. From 3 stars
// the SMPD sets roadblocks ahead of the player; at 4+ stars officers sprint.
import { WANTED } from './config.js';

export function wantedStars(wanted) { return Math.min(WANTED.maxStars, Math.floor(wanted)); }

/** What the HUD calls the heat: clean streets, a wanted man, a manhunt, lockdown. */
export function wantedLabel(stars) {
  if (stars <= 0) return 'Clean';
  if (stars <= 2) return 'Wanted';
  if (stars <= 4) return 'Manhunt';
  return 'Lockdown';
}

export function spawnCopOnFoot(world, random) {
  const { state } = world;
  const p = state.player;
  const a = random.next() * Math.PI * 2;
  const d = random.range(300, 420);
  state.cops.push({
    x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
    angle: 0, speed: 0, health: 50, state: 'chase', seesPlayer: false, dead: false,
  });
}

/** Two interceptors across the road ahead of the player, plus one officer. */
export function spawnRoadblock(world) {
  const { state, city } = world;
  const p = state.player;
  const aheadX = p.x + Math.cos(p.angle) * 380;
  const aheadY = p.y + Math.sin(p.angle) * 380;
  const spot = city.nearestRoadPoint(aheadX, aheadY);
  if (!spot) return;
  const across = spot.axis === 'h'
    ? [{ x: spot.x - 34, y: spot.y }, { x: spot.x + 34, y: spot.y }]
    : [{ x: spot.x, y: spot.y - 34 }, { x: spot.x, y: spot.y + 34 }];
  for (const pos of across) {
    if (city.isBlocked(pos.x, pos.y, 24)) continue;
    const car = world.spawnCar('police', pos.x, pos.y, spot.axis === 'h' ? Math.PI / 2 : 0, 'police');
    car.roadblock = true; // holds its ground until the player gets close
    car.traffic = { axis: spot.axis, line: spot.line, dir: 1, lane: 0, t: spot.axis === 'h' ? pos.x : pos.y };
    car.targetSpeed = 0;
    car.siren = true;
  }
  spawnCopOnFoot(world, world.random);
  state.roadblockCd = WANTED.roadblockCooldown;
}

export function stepPolice(world, dt, events) {
  const { state, city } = world;
  const p = state.player;
  const stars = wantedStars(state.wanted);
  // Officers on foot appear from 2 stars up; at 4+ they sprint.
  if (stars >= 2 && state.cops.filter((c) => !c.dead).length < stars - 1) {
    if (Math.random() < dt * 0.5 * (city.policeFactor(p.x, p.y) || 1)) spawnCopOnFoot(world, world.random);
  }
  // Roadblocks from 3 stars up, on a cooldown so the city is not one wall.
  state.roadblockCd = Math.max(0, (state.roadblockCd || 0) - dt);
  if (stars >= WANTED.roadblockStars && state.roadblockCd <= 0 && !p.dead) {
    spawnRoadblock(world);
  }
  const footSpeed = stars >= 4 ? WANTED.copSprintSpeed : WANTED.copFootSpeed;
  for (const cp of state.cops) {
    if (cp.dead) continue;
    const d = Math.hypot(cp.x - p.x, cp.y - p.y);
    cp.seesPlayer = d < 560 && !p.dead;
    const speed = p.onFoot ? footSpeed : 150;
    if (cp.seesPlayer && !p.dead) {
      cp.angle = Math.atan2(p.y - cp.y, p.x - cp.x);
      const nx = cp.x + Math.cos(cp.angle) * speed * dt;
      const ny = cp.y + Math.sin(cp.angle) * speed * dt;
      if (!city.isBlocked(nx, cp.y, 11)) cp.x = nx;
      if (!city.isBlocked(cp.x, ny, 11)) cp.y = ny;
      if (d < WANTED.copCatchRadius && p.onFoot) {
        state.bustTimer += dt;
        if (state.bustTimer > WANTED.bustTime) world.bustPlayer(events);
      }
    } else {
      // Patrol: wander the block.
      cp.angle += (Math.random() - 0.5) * 0.1;
      const nx = cp.x + Math.cos(cp.angle) * 70 * dt;
      const ny = cp.y + Math.sin(cp.angle) * 70 * dt;
      if (!city.isBlocked(nx, ny, 11)) { cp.x = nx; cp.y = ny; }
    }
    // A cop that catches a fleeing player in a slow car pulls them out.
    if (!p.onFoot && p.car && d < 40 && Math.abs(p.car.speed) < 40 && stars >= 1) {
      state.bustTimer += dt;
      if (state.bustTimer > WANTED.bustTime + 1) world.bustPlayer(events);
    }
  }
  if (!state.cops.some((c) => !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 60)) {
    state.bustTimer = Math.max(0, state.bustTimer - dt);
  }
  state.cops = state.cops.filter((c) => !c.dead);
}
