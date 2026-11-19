// vehicles.js: arcade car physics (accelerate, brake, reverse, handbrake drift),
// traffic that follows the road graph, and police interceptors that hunt the
// player along the roads. Cars collide with buildings, each other and the sea.
// A beaten-up car smokes, then burns; a hurt car loses top speed. Traffic
// pulls over for a siren, and the handbrake leaves skid marks on the asphalt.
import { CAR_MODELS, LANE, WANTED } from './config.js';
import { ACTION_ENTER } from './input.js';
import { exitCar } from './player.js';

export function spawnTrafficCar(world, random) {
  const { state, city } = world;
  const spot = city.randomRoadSpot();
  const p = state.player;
  if (Math.hypot(spot.x - p.x, spot.y - p.y) < 420) return null;
  const models = ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'pickup'];
  const model = random.pick(models);
  const car = world.spawnCar(model, spot.x, spot.y, spot.axis === 'h' ? 0 : Math.PI / 2, 'npc');
  car.traffic = { axis: spot.axis, line: spot.line, dir: random.chance(0.5) ? 1 : -1, lane: random.chance(0.5) ? LANE : -LANE, t: spot.axis === 'h' ? spot.x : spot.y };
  car.targetSpeed = random.range(120, 200);
  return car;
}

export function spawnPoliceCar(world, random) {
  const { state, city } = world;
  const p = state.player;
  const spot = city.randomRoadSpot();
  const car = world.spawnCar('police', spot.x, spot.y, spot.axis === 'h' ? 0 : Math.PI / 2, 'police');
  car.traffic = { axis: spot.axis, line: spot.line, dir: 1, lane: 0, t: spot.axis === 'h' ? spot.x : spot.y };
  car.targetSpeed = 380;
  car.siren = true;
  return car;
}

export function damageCar(world, car, n, events) {
  car.health -= n;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
    world.spawnExplosion(car.x, car.y, events);
    // A car bomb hurts everything nearby: other cars take 40 damage (a second
    // explosion does not chain — one blast is enough), peds caught in it die,
    // and the player on foot takes 25.
    for (const other of world.state.cars) {
      if (other === car || other.dead) continue;
      if (Math.hypot(other.x - car.x, other.y - car.y) < 130) {
        other.health -= 40;
        if (other.health <= 0) { other.dead = true; other.speed = 0; world.spawnParticles(other.x, other.y, 10, '#3a3f4a', 120, 0.6, 6); }
      }
    }
    for (const pd of world.state.peds) {
      if (pd.state !== 'dead' && Math.hypot(pd.x - car.x, pd.y - car.y) < 120) { pd.state = 'dead'; pd.deadAt = world.state.time; }
    }
    const pl = world.state.player;
    if (pl.onFoot && !pl.dead && Math.hypot(pl.x - car.x, pl.y - car.y) < 100) world.damagePlayer(25, events);
    if (car.driver === 'player') {
      const p = world.state.player;
      p.car = null; p.onFoot = true; p.health = Math.max(10, p.health - 25);
      events.push('carDestroyed');
    }
  }
}

export function stepVehicles(world, dt, input, events, actions) {
  const { state, city } = world;
  const p = state.player;
  for (const car of state.cars) {
    if (car.dead) continue;
    const spec = CAR_MODELS[car.model];
    if (car.driver === 'player') drivePlayerCar(world, car, dt, input, events, actions);
    else if (car.driver === 'police') drivePoliceCar(world, car, dt, events);
    else if (car.traffic) driveTrafficCar(world, car, dt);
    else car.speed *= Math.max(0, 1 - 3 * dt); // parked: roll to a stop

    // A beaten-up car smokes; a burning one keeps losing health until it blows.
    if (!car.dead && car.health < 40 && Math.random() < dt * 8) {
      state.particles.push({ x: car.x + (Math.random() - 0.5) * 20, y: car.y + (Math.random() - 0.5) * 20, vx: 0, vy: -30, life: 0.9, maxLife: 0.9, color: '#3a3f4a', size: 7 });
    }
    if (!car.dead && car.health < 20) {
      if (Math.random() < dt * 10) {
        state.particles.push({ x: car.x + (Math.random() - 0.5) * 16, y: car.y + (Math.random() - 0.5) * 16, vx: 0, vy: -20, life: 0.5, maxLife: 0.5, color: '#ff9f1c', size: 6 });
      }
      damageCar(world, car, 2 * dt, events);
      if (car.dead) continue;
    }

    // Integrate with building collision (slide: try x, then y).
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const r = spec.h / 2 + 2;
    let hit = false;
    if (!city.isBlocked(nx, car.y, r)) car.x = nx; else { car.speed *= -0.25; hit = true; }
    if (!city.isBlocked(car.x, ny, r)) car.y = ny; else { car.speed *= -0.25; hit = true; }
    if (hit && Math.abs(car.speed) > 120) {
      world.spawnParticles(car.x, car.y, 5, '#b8a88f', 120, 0.4, 4);
      if (car.driver === 'player') { world.addHeat(WANTED.heatPerCrash, events); events.push('crash'); }
      damageCar(world, car, Math.abs(car.speed) * 0.02, events);
    }
    // Car-car separation: slow push apart.
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      const dx = car.x - other.x; const dy = car.y - other.y;
      const d = Math.hypot(dx, dy);
      const min = 30;
      if (d > 0.01 && d < min) {
        const push = (min - d) * 0.5;
        car.x += (dx / d) * push; car.y += (dy / d) * push;
        if (car.driver === 'player' && Math.abs(car.speed) > 150) {
          world.addHeat(WANTED.heatPerCrash * 0.5, events);
          damageCar(world, other, 2, events);
        }
      }
    }
    // Handbrake skid marks and smoke at speed.
    if (car.driver === 'player' && Math.abs(car.speed) > 240) {
      state.particles.push({ x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, color: '#5d6d7e', size: 3 });
    }
  }
  state.cars = state.cars.filter((c) => !c.dead || c.driver === 'player');
}

function drivePlayerCar(world, car, dt, input, events, actions) {
  const spec = CAR_MODELS[car.model];
  const move = input.move();
  const forward = move.y < 0 ? 1 : move.y > 0 ? -1 : 0;
  const steer = move.x;
  const onSand = (car.x > 2900 || car.y > 2900) && !world.city.onRoad(car.x, car.y); // beach sand is slower; the beachfront road is not
  // Sand costs speed by model: a pickup shrugs it off, a sports car bogs down.
  const sandFactor = onSand ? (0.55 + 0.45 * (spec.offroad || 0.7)) : 1;
  // A hurt car loses top speed.
  const top = spec.top * sandFactor * (car.health < 50 ? 0.85 : 1);
  if (forward !== 0) car.speed += forward * spec.accel * dt;
  else car.speed *= Math.max(0, 1 - 0.8 * dt);
  const drifting = input.braking() && Math.abs(car.speed) > 120;
  if (input.braking()) car.speed *= Math.max(0, 1 - 4 * dt); // handbrake
  car.speed = Math.max(-top * 0.45, Math.min(top, car.speed));
  // The handbrake loosens the rear: sharper turns, skid marks, a skid sound.
  const grip = spec.grip * (Math.abs(car.speed) > 30 ? 1 : 0.4) * (drifting ? 1.7 : 1);
  car.angle += steer * grip * (car.speed / spec.top) * dt * (car.speed < 0 ? -1 : 1);
  if (drifting) {
    car.skidCd = Math.max(0, (car.skidCd || 0) - dt);
    const skids = world.state.skids;
    if (skids.length < 120) {
      skids.push({ x: car.x - Math.cos(car.angle) * 18, y: car.y - Math.sin(car.angle) * 18, angle: car.angle, life: 6 });
    }
    if (car.skidCd <= 0) { car.skidCd = 0.4; events.push('skid'); }
  }
  if ((actions || 0) & ACTION_ENTER) exitCar(world, events);
}

function driveTrafficCar(world, car, dt) {
  const { city, state } = world;
  const t = car.traffic;
  // Traffic pulls over for a siren: slow down and give the chase room.
  const sirenNear = state.cars.some((c) => c.driver === 'police' && c.siren && Math.hypot(c.x - car.x, c.y - car.y) < 300);
  const speed = car.targetSpeed * (sirenNear ? 0.35 : 1);
  car.speed += (speed - car.speed) * Math.min(1, 2 * dt);
  // A blocked lane: slow down, wait a beat, then change lanes to overtake.
  const blockedBy = carAhead(world, car, 110);
  if (blockedBy) {
    car.blockedT = (car.blockedT || 0) + dt;
    car.speed = Math.min(car.speed, car.targetSpeed * 0.3);
    if (car.blockedT > 2.5) { t.lane = -t.lane; car.blockedT = 0; }
  } else car.blockedT = 0;
  // Follow the centreline with a lane offset; at an intersection maybe turn.
  const pos = trafficPosition(city, t);
  car.x = pos.x; car.y = pos.y;
  car.angle = pos.angle;
  t.t += car.speed * t.dir * dt;
  maybeTurn(world, car, t);
}

// The nearest car ahead of `car` along its lane, if one is close.
function carAhead(world, car, dist) {
  const t = car.traffic;
  let best = null; let bestD = dist;
  for (const other of world.state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x; const dy = other.y - car.y;
    const along = t.axis === 'h' ? dx * t.dir : dy * t.dir;
    const across = Math.abs(t.axis === 'h' ? dy : dx);
    if (along > 0 && along < bestD && across < 26) { bestD = along; best = other; }
  }
  return best;
}

function trafficPosition(city, t) {
  if (t.axis === 'h') return { x: t.t, y: t.line + t.lane, angle: t.dir > 0 ? 0 : Math.PI };
  return { x: t.line + t.lane, y: t.t, angle: t.dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
}

function maybeTurn(world, car, t) {
  const { city } = world;
  const cross = t.axis === 'h' ? city.roadsV : city.roadsH;
  for (const line of cross) {
    const d = t.t - line;
    if (Math.abs(d) < 6 && !t._turnedAt?.has(line)) {
      if (!t._turnedAt) t._turnedAt = new Set();
      t._turnedAt.add(line);
      if (world.random.chance(0.3)) {
        const turnLeft = world.random.chance(0.5);
        const newDir = t.dir > 0 ? (turnLeft ? -1 : 1) : (turnLeft ? 1 : -1);
        if (t.axis === 'h') { t.axis = 'v'; t.line = line; t.t = car.y; t.dir = newDir; }
        else { t.axis = 'h'; t.line = line; t.t = car.x; t.dir = newDir; }
        t.lane = world.random.chance(0.5) ? LANE : -LANE;
      }
      return;
    }
    if (Math.abs(d) > 40) t._turnedAt?.delete(line);
  }
}

function drivePoliceCar(world, car, dt, events) {
  const { state, city } = world;
  const p = state.player;
  // A roadblock car holds its ground until the player gets close, then joins
  // the chase like any other interceptor.
  if (car.roadblock) {
    car.speed *= Math.max(0, 1 - 4 * dt);
    if (Math.hypot(p.x - car.x, p.y - car.y) < 260) car.roadblock = false;
    return;
  }
  // Greedy road chase: at each intersection pick the turn that closes on the player.
  const t = car.traffic;
  car.targetSpeed = 380 + wantedLevel(state) * 12;
  car.speed += (car.targetSpeed - car.speed) * Math.min(1, 2.5 * dt);
  const pos = trafficPosition(city, t);
  car.x = pos.x; car.y = pos.y;
  car.angle = pos.angle;
  t.t += car.speed * t.dir * dt;
  const cross = t.axis === 'h' ? city.roadsV : city.roadsH;
  for (const line of cross) {
    if (Math.abs(t.t - line) < 6 && !t._turnedAt?.has(line)) {
      if (!t._turnedAt) t._turnedAt = new Set();
      t._turnedAt.add(line);
      // Only turn when the player is off this road: chasing straight down the
      // same road is faster than turning away from them.
      const offRoad = t.axis === 'h' ? Math.abs(p.y - car.y) : Math.abs(p.x - car.x);
      if (offRoad > 200 && world.random.chance(0.75)) {
        const want = t.axis === 'h'
          ? (p.y > car.y ? 1 : -1)
          : (p.x > car.x ? 1 : -1);
        if (t.axis === 'h') { t.axis = 'v'; t.line = line; t.t = car.y; t.dir = want; }
        else { t.axis = 'h'; t.line = line; t.t = car.x; t.dir = want; }
        t.lane = 0;
      }
      break;
    }
    if (Math.abs(t.t - line) > 40) t._turnedAt?.delete(line);
  }
  // Ram the player: touch damage, and a slow player on foot gets busted.
  const d = Math.hypot(car.x - p.x, car.y - p.y);
  if (d < 46) {
    if (p.onFoot) {
      state.bustTimer += dt;
      if (state.bustTimer > WANTED.bustTime) world.bustPlayer(events);
    } else if (p.car) {
      damageCar(world, p.car, WANTED.copRamDamage * dt * 10, events);
      events.push('ram');
    }
  } else if (p.onFoot) state.bustTimer = Math.max(0, state.bustTimer - dt);
}

function wantedLevel(state) { return Math.floor(state.wanted); }
