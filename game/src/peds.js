// peds.js: Solmara's pedestrians. They stroll the sidewalks, cross at corners,
// and flee from gunfire, explosions and speeding cars. A dead ped stays down
// for a while, then the city quietly replaces them. Peds come in archetypes —
// tourists, workers, joggers, beachgoers, gang members — each with its own pace
// and nerve, and panic spreads: one fleeing ped scares the ones around them.
import { PLAYER } from './config.js';

// Archetype: speed range, shirt palette, nerve (1 = bolts at once, lower = holds).
const ARCHETYPES = {
  tourist: { speed: [26, 45], shirts: ['#e74c3c', '#f39c12', '#fd79a8', '#fdcb6e'], nerve: 1 },
  worker: { speed: [35, 55], shirts: ['#3498db', '#2c3e50', '#5d6d7e', '#95a5a6'], nerve: 1 },
  jogger: { speed: [90, 130], shirts: ['#2ecc71', '#00cec9', '#1abc9c'], nerve: 0.6 },
  beachgoer: { speed: [24, 40], shirts: ['#ffe14d', '#ff9f1c', '#e8a87c'], nerve: 1 },
  ganger: { speed: [30, 48], shirts: ['#1c2430', '#8e44ad', '#6c3483'], nerve: 0.4 },
};

function pickArchetype(world, random) {
  const { city, state } = world;
  const p = state.player;
  if (city.isBeach(p.x, p.y)) return 'beachgoer';
  const d = city.districtAt(p.x, p.y).name;
  if (d === 'Portside') return random.weighted([['ganger', 3], ['worker', 5], ['tourist', 2]]);
  if (d === 'Marina Bay') return random.weighted([['tourist', 4], ['beachgoer', 3], ['jogger', 2], ['worker', 2]]);
  if (d === 'Neon Row' || d === 'The Strip') return random.weighted([['tourist', 3], ['worker', 3], ['jogger', 2], ['ganger', 1]]);
  return random.weighted([['worker', 4], ['tourist', 3], ['jogger', 2]]);
}

export function spawnPed(world, random) {
  const { state, city } = world;
  const p = state.player;
  // Near the player but off the road: on a sidewalk beside a road.
  const spot = city.randomSidewalkSpot();
  let { x, y } = spot;
  if (Math.hypot(x - p.x, y - p.y) < 200 || city.isBlocked(x, y, 10)) {
    x = p.x + random.range(-500, 500);
    y = p.y + random.range(-500, 500);
    if (city.isBlocked(x, y, 10)) return;
  }
  const kind = pickArchetype(world, random);
  const arch = ARCHETYPES[kind];
  const shirt = random.pick(arch.shirts);
  state.peds.push({
    x, y, angle: random.next() * Math.PI * 2, speed: random.range(arch.speed[0], arch.speed[1]),
    state: 'walk', kind, color: shirt, shirt,
    walkPhase: random.next() * 10, fleeX: 0, fleeY: 0, screamCd: 0, panic: 0,
  });
}

export function stepPeds(world, dt, events) {
  const { state, city } = world;
  const p = state.player;
  for (const pd of state.peds) {
    if (pd.state === 'dead') continue;
    pd.walkPhase += dt * 6;
    pd.screamCd = Math.max(0, (pd.screamCd || 0) - dt);
    pd.panic = Math.max(0, (pd.panic || 0) - dt * 0.5);
    // Flee: gunfire, a car bearing down, an explosion nearby, or a panicking
    // neighbour — panic spreads through a crowd.
    const gunfire = state.bullets.length > 0;
    const blast = state.particles.some((pt) => pt.color === '#ff9f1c' && Math.hypot(pt.x - pd.x, pt.y - pd.y) < 160);
    const carNear = state.cars.some((c) => !c.dead && Math.abs(c.speed) > 120 && Math.hypot(c.x - pd.x, c.y - pd.y) < 90);
    const scaredNeighbour = state.peds.some((o) => o !== pd && o.state === 'flee' && Math.hypot(o.x - pd.x, o.y - pd.y) < 120);
    const arch = ARCHETYPES[pd.kind] || ARCHETYPES.tourist;
    const danger = gunfire || blast || carNear || scaredNeighbour;
    if (danger && pd.state !== 'flee' && Math.random() < arch.nerve) {
      pd.state = 'flee';
      pd.panic = 1;
      const a = Math.atan2(pd.y - p.y, pd.x - p.x) + (Math.random() - 0.5);
      pd.fleeX = pd.x + Math.cos(a) * 300;
      pd.fleeY = pd.y + Math.sin(a) * 300;
      if (Math.hypot(pd.x - p.x, pd.y - p.y) < 260 && pd.screamCd <= 0) {
        pd.screamCd = 8;
        events.push('scream');
      }
    }
    if (pd.state === 'flee') {
      const dx = pd.fleeX - pd.x; const dy = pd.fleeY - pd.y;
      const d = Math.hypot(dx, dy);
      if (d < 20 || Math.hypot(pd.x - p.x, pd.y - p.y) > 500) { pd.state = 'walk'; continue; }
      pd.angle = Math.atan2(dy, dx);
      const sp = 150;
      const nx = pd.x + Math.cos(pd.angle) * sp * dt;
      const ny = pd.y + Math.sin(pd.angle) * sp * dt;
      if (!city.isBlocked(nx, pd.y, 10)) pd.x = nx;
      if (!city.isBlocked(pd.x, ny, 10)) pd.y = ny;
      continue;
    }
    // Stroll: keep walking, drift back to the sidewalk when on the road,
    // turn at walls and intersections.
    const road = city.nearestRoad(pd.x, pd.y);
    if (road.dist < 24) {
      // On the asphalt: steer toward the nearer sidewalk edge.
      const edge = road.axis === 'h'
        ? { x: pd.x, y: road.line + (pd.y >= road.line ? 44 : -44) }
        : { x: road.line + (pd.x >= road.line ? 44 : -44), y: pd.y };
      const want = Math.atan2(edge.y - pd.y, edge.x - pd.x);
      pd.angle += (((want - pd.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, 3 * dt);
    } else {
      pd.angle += (Math.random() - 0.5) * 0.12;
    }
    const nx = pd.x + Math.cos(pd.angle) * pd.speed * dt;
    const ny = pd.y + Math.sin(pd.angle) * pd.speed * dt;
    if (!city.isBlocked(nx, ny, 10)) { pd.x = nx; pd.y = ny; }
    else pd.angle += Math.PI / 2;
    // A speeding car that clips a pedestrian is a crime.
    for (const c of state.cars) {
      if (c.dead || Math.abs(c.speed) < 60) continue;
      if (Math.hypot(c.x - pd.x, c.y - pd.y) < 24) {
        pd.state = 'dead'; pd.deadAt = state.time;
        world.spawnParticles(pd.x, pd.y, 8, '#c0392b', 130, 0.5, 5);
        if (c.driver === 'player') { world.addHeat(0.7, events); state.stats.pedsHit += 1; }
        break;
      }
    }
  }
  // Keep peds from standing inside each other: a slow push apart.
  for (let i = 0; i < state.peds.length; i += 1) {
    const a = state.peds[i];
    if (a.state === 'dead') continue;
    for (let j = i + 1; j < state.peds.length; j += 1) {
      const b = state.peds[j];
      if (b.state === 'dead') continue;
      const dx = a.x - b.x; const dy = a.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 16) {
        const push = (16 - d) * 0.25;
        a.x += (dx / d) * push; a.y += (dy / d) * push;
        b.x -= (dx / d) * push; b.y -= (dy / d) * push;
      }
    }
  }
  // The dead are cleared after a while.
  state.peds = state.peds.filter((pd) => pd.state !== 'dead' || state.time - (pd.deadAt || 0) < 25);
}
