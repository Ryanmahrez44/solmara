// missions.js: Dario's story — six jobs for Mara Solis against Sal Ferrante's
// port crew. Each mission is a list of steps; a step is done when its check
// passes, and the mission pays out on the last one. Guards are armed men who
// shoot back — and strafe while they do; Ferrante himself fights harder once
// hurt. The wanted level is part of the job, not a punishment for it.
// Finish under the par time for a bonus, finish clean for another.
import { ECONOMY } from './config.js';

function at(world, x, y, r) {
  const p = world.state.player;
  return Math.hypot(p.x - x, p.y - y) < r;
}

function spawnGuards(world, x, y, n, hp) {
  for (let i = 0; i < n; i += 1) {
    // Guards stand in the open: inside a building they could neither be shot
    // nor shoot out.
    let gx = x; let gy = y;
    for (let tries = 0; tries < 20; tries += 1) {
      gx = x + world.random.range(-110, 110);
      gy = y + world.random.range(-110, 110);
      if (!world.city.isBlocked(gx, gy, 12)) break;
    }
    world.state.guards.push({
      x: gx, y: gy,
      angle: 0, health: hp || 50, shootCd: world.random.range(0.5, 1.5), dead: false,
      strafeDir: world.random.chance(0.5) ? 1 : -1, strafeT: world.random.range(0.5, 1.5),
    });
  }
}

function stepGuards(world, dt, events) {
  const { state, city } = world;
  const p = state.player;
  for (const g of state.guards) {
    if (g.dead) continue;
    // Ferrante enrages under half health: faster trigger, faster feet.
    if (g.boss && !g.enraged && g.health < 80) {
      g.enraged = true;
      g.shootCd = 0.3;
      events.push('bossEnrage');
    }
    // Ferrante calls in backup when he is nearly done: two more crew appear.
    if (g.boss && !g.reinforced && g.health < 40) {
      g.reinforced = true;
      spawnGuards(world, g.x, g.y, 2, 60);
      world.banner('Backup!', 'Ferrante called in more crew', 2.5);
      events.push('backup');
    }
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d < 480 && !p.dead) {
      g.angle = Math.atan2(p.y - g.y, p.x - g.x);
      g.shootCd -= dt;
      if (g.shootCd <= 0 && d > 60) {
        g.shootCd = (g.enraged ? 0.55 : 1.1) + Math.random() * 0.7;
        const a = g.angle + (Math.random() - 0.5) * 0.24;
        state.bullets.push({ x: g.x + Math.cos(a) * 20, y: g.y + Math.sin(a) * 20, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 0.7, damage: 7, from: 'guard' });
        events.push('enemyShoot');
      }
      // Close in from afar, strafe sideways up close.
      const approach = g.enraged ? 150 : 110;
      if (d > 130) {
        const nx = g.x + Math.cos(g.angle) * approach * dt;
        const ny = g.y + Math.sin(g.angle) * approach * dt;
        if (!city.isBlocked(nx, g.y, 11)) g.x = nx;
        if (!city.isBlocked(g.x, ny, 11)) g.y = ny;
      } else {
        g.strafeT -= dt;
        if (g.strafeT <= 0) { g.strafeT = world.random.range(0.8, 1.6); g.strafeDir = -g.strafeDir; }
        const sx = g.x + Math.cos(g.angle + Math.PI / 2) * g.strafeDir * 60 * dt;
        const sy = g.y + Math.sin(g.angle + Math.PI / 2) * g.strafeDir * 60 * dt;
        if (!city.isBlocked(sx, g.y, 11)) g.x = sx;
        if (!city.isBlocked(g.x, sy, 11)) g.y = sy;
      }
    }
  }
  state.guards = state.guards.filter((g) => !g.dead);
}

// Step kinds: what "done" means for one step of a mission.
const STEP_KINDS = {
  goto: { label: 'Drive there' },
  enter: { label: 'Get in' },
  kill: { label: 'Clear them out' },
  timed: { label: 'Beat the clock' },
  escape: { label: 'Lose the heat' },
};

export const MISSIONS = [
  {
    id: 'm1', title: 'Welcome Back', giver: 'Mara Solis',
    brief: 'Dario is back in Solmara after five years away. Mara needs a driver she can trust: take her coupe to the pier and hear the job.',
    reward: 400, rep: 10, par: 150,
    steps: [
      { kind: 'enter', text: 'Get in the coupe outside the garage', check: (w) => !w.state.player.onFoot, target: null },
      { kind: 'goto', text: 'Drive to Solmara Pier', target: (w) => w.city.places.pier, radius: 90, check: (w) => at(w, w.city.places.pier.x, w.city.places.pier.y, 90) },
      { kind: 'goto', text: 'Meet Mara at the pier', target: (w) => ({ x: w.city.places.pier.x, y: w.city.places.pier.y - 60 }), radius: 60, check: (w) => w.state.player.onFoot && at(w, w.city.places.pier.x, w.city.places.pier.y - 60, 60) },
    ],
  },
  {
    id: 'm2', title: 'Beachfront Pickup', giver: 'Mara Solis',
    brief: 'A package is buried by the lifeguard hut on Marina Beach. Grab it — and expect Ferrante’s boys to call the cops on you.',
    reward: 800, rep: 15, par: 240,
    steps: [
      { kind: 'goto', text: 'Find the package on Marina Beach', target: (w) => ({ x: 2950, y: 2650 }), radius: 70, check: (w) => at(w, 2950, 2650, 70) },
      { kind: 'escape', text: 'Lose the cops, then bring the package to the garage', target: (w) => w.city.places.garage, radius: 90, heat: 2, check: (w) => w.state.wanted < 1 && at(w, w.city.places.garage.x, w.city.places.garage.y, 90) },
    ],
  },
  {
    id: 'm3', title: 'Neon Run', giver: 'Mara Solis',
    brief: 'Three drops across Neon Row, ninety seconds, no excuses. The city’s fastest courier gets the keys to the Cometa GT.',
    reward: 1200, rep: 20, par: 95,
    steps: [
      { kind: 'timed', text: 'Drop 1: Neon Row north', target: (w) => ({ x: 1600, y: 1000 }), radius: 80, time: 95, check: (w) => at(w, 1600, 1000, 80) },
      { kind: 'timed', text: 'Drop 2: The Strip', target: (w) => ({ x: 1600, y: 2050 }), radius: 80, time: 95, check: (w) => at(w, 1600, 2050, 80) },
      { kind: 'timed', text: 'Drop 3: Marina Hotel', target: (w) => w.city.places.hotel, radius: 80, time: 95, check: (w) => at(w, w.city.places.hotel.x, w.city.places.hotel.y, 80) },
    ],
  },
  {
    id: 'm4', title: 'Portside Heist', giver: 'Mara Solis',
    brief: 'Ferrante’s hauler truck is sitting in the docks, guarded. Take it — loudly if you have to — and bring it to the garage.',
    reward: 1800, rep: 25, par: 300,
    steps: [
      { kind: 'kill', text: 'Clear the dock guards (0/4)', target: (w) => w.city.places.port, radius: 120, count: 4, onEnter: (w) => spawnGuards(w, w.city.places.port.x, w.city.places.port.y, 4, 50), check: (w) => w.state.guards.length === 0 },
      { kind: 'enter', text: 'Steal the hauler truck', target: (w) => w.city.places.port, radius: 100, check: (w) => w.state.player.car && w.state.player.car.model === 'truck', onEnter: (w) => { const c = w.spawnCar('truck', w.city.places.port.x + 40, w.city.places.port.y, 0, null); } },
      { kind: 'goto', text: 'Drive the truck to the garage', target: (w) => w.city.places.garage, radius: 100, check: (w) => w.state.player.car && w.state.player.car.model === 'truck' && at(w, w.city.places.garage.x, w.city.places.garage.y, 100) },
    ],
  },
  {
    id: 'm5', title: "The Gulls' Nest", giver: 'Mara Solis',
    brief: 'Ferrante keeps his ledger in the Hillside mansion. Get in, take it, get out. The Gulls will not wave you through.',
    reward: 2400, rep: 30, par: 360,
    steps: [
      { kind: 'kill', text: 'Clear the mansion guards (0/6)', target: (w) => w.city.places.mansion, radius: 140, count: 6, onEnter: (w) => spawnGuards(w, w.city.places.mansion.x, w.city.places.mansion.y, 6, 55), check: (w) => w.state.guards.length === 0 },
      { kind: 'goto', text: 'Take the ledger from the mansion', target: (w) => w.city.places.mansion, radius: 60, check: (w) => at(w, w.city.places.mansion.x, w.city.places.mansion.y, 60) },
      { kind: 'escape', text: 'Escape to Old Town Market', target: (w) => w.city.places.market, radius: 90, heat: 3, check: (w) => w.state.wanted < 1 && at(w, w.city.places.market.x, w.city.places.market.y, 90) },
    ],
  },
  {
    id: 'm6', title: 'Golden Hour', giver: 'Mara Solis',
    brief: 'The finale. Ferrante himself is at the Marina Hotel with his whole crew. End it at golden hour — and be at the pier when the boat leaves.',
    reward: 4000, rep: 50, par: 420,
    steps: [
      { kind: 'kill', text: 'Take down Ferrante’s crew (0/5)', target: (w) => w.city.places.hotel, radius: 150, count: 5, onEnter: (w) => { spawnGuards(w, w.city.places.hotel.x, w.city.places.hotel.y, 4, 60); w.state.guards.push({ x: w.city.places.hotel.x + 60, y: w.city.places.hotel.y, angle: 0, health: 160, shootCd: 1, dead: false, boss: true, strafeDir: 1, strafeT: 1 }); }, check: (w) => w.state.guards.length === 0 },
      { kind: 'escape', text: 'Escape the heat — get to Solmara Pier', target: (w) => w.city.places.pier, radius: 100, heat: 4, check: (w) => w.state.wanted < 1 && at(w, w.city.places.pier.x, w.city.places.pier.y, 100) },
    ],
  },
];

export function startMission(world, index) {
  const m = MISSIONS[index];
  if (!m) return;
  const st = world.state.mission;
  st.index = index; st.step = 0; st.state = 'active'; st.data = {}; st.timer = 0; st.elapsed = 0;
  st.text = m.steps[0].text;
  st.target = null;
  world.banner(`${m.title}`, `${m.giver} — ${m.brief}`, 5);
  enterStep(world);
}

function enterStep(world) {
  const st = world.state.mission;
  const m = MISSIONS[st.index];
  const step = m.steps[st.step];
  st.text = step.text;
  st.timer = step.time || 0;
  st.target = step.target ? step.target(world) : null;
  if (step.onEnter) step.onEnter(world);
  if (step.heat) world.addHeat(step.heat, []);
  if (step.kind === 'kill' && step.count) st.data.toKill = step.count;
}

export function updateMission(world, dt, events) {
  const { state } = world;
  const st = state.mission;
  if (st.state !== 'active') return;
  st.elapsed = (st.elapsed || 0) + dt;
  stepGuards(world, dt, events);
  const m = MISSIONS[st.index];
  const step = m.steps[st.step];
  if (step.kind === 'kill' && step.count) {
    st.text = step.text.replace(/\(\d+\/\d+\)/, `(${step.count - state.guards.length}/${step.count})`);
  }
  if (step.time) {
    st.timer -= dt;
    if (st.timer <= 0) {
      failMission(world, 'Out of time.');
      return;
    }
  }
  if (step.check(world)) {
    st.step += 1;
    if (st.step >= m.steps.length) {
      completeMission(world, events);
      return;
    }
    enterStep(world);
    events.push('missionStep');
  }
}

function completeMission(world, events) {
  const { state } = world;
  const st = state.mission;
  const m = MISSIONS[st.index];
  state.stats.missionsDone += 1;
  // Bonuses: under par time pays +25%, finishing with no heat at all pays flat.
  const parBonus = (m.par && (st.elapsed || 0) <= m.par) ? Math.round(m.reward * ECONOMY.parBonusPct) : 0;
  const cleanBonus = state.wanted < 1 ? ECONOMY.cleanBonus : 0;
  const payout = m.reward + parBonus + cleanBonus;
  world.addMoney(payout);
  state.rep += m.rep;
  const bonusText = [
    parBonus > 0 ? `par +$${parBonus}` : null,
    cleanBonus > 0 ? `clean +$${cleanBonus}` : null,
  ].filter(Boolean).join(', ');
  world.banner('Mission complete!', `${m.title} — +$${payout}${bonusText ? ` (${bonusText})` : ''}, +${m.rep} rep`, 4);
  events.push('missionComplete');
  st.state = 'done';
  st.text = '';
  st.target = null;
  if (st.index === MISSIONS.length - 1) {
    world.banner('SOLMARA LEGEND', 'You finished the story. The city is yours, Dario.', 6);
    state.rep += 50;
  }
}

function failMission(world, reason) {
  const { state } = world;
  const st = state.mission;
  world.banner('Mission failed', reason, 4);
  st.state = 'idle';
  st.text = '';
  st.target = null;
  state.guards = [];
}

export { failMission, STEP_KINDS };
