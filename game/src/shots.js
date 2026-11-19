// shots.js: the four screenshot scenes behind ?shot=cover|street|mission|beach.
// Each one plays the real rules forward from a fresh world for a fixed number
// of steps, steered by a simple autopilot, so the frame is what a short game
// really looks like — a chase, a street, a firefight, a beachfront drive.
// Every scene is one entry in the SHOTS table: a setup that places the world,
// then a drive that steers it. The table is the only place scenes live, so a
// new scene is one more entry, not one more branch.
import { STEP } from './config.js';
import { giveWeapon } from './player.js';

function fakeInput(forward, steer, aim, shooting) {
  return {
    move: () => ({ x: steer, y: forward }),
    running: () => false,
    braking: () => false,
    mouse: () => ({ x: 0, y: 0, down: !!shooting, clicked: false }),
    takeActions: () => 0,
    aim: aim || null,
  };
}

function placePoliceChase(world, px, py, angle) {
  const offsets = [-150, -230, -320];
  for (const off of offsets) {
    const car = world.spawnCar('police', px + Math.cos(angle) * off, py + Math.sin(angle) * off, angle, 'police');
    car.traffic = { axis: 'h', line: py, dir: 1, lane: 0, t: px + Math.cos(angle) * off };
    car.targetSpeed = 380;
    car.speed = 330;
    car.siren = true;
  }
}

function driveForward(world, seconds) {
  const input = fakeInput(-1, 0, null, false);
  for (let i = 0; i < seconds / STEP; i += 1) world.step(STEP, input);
}

function walkForward(world, seconds, aim) {
  const input = fakeInput(-1, 0, aim || null, false);
  for (let i = 0; i < seconds / STEP; i += 1) world.step(STEP, input);
}

function clearBanner(world) {
  world.state.banner = null;
  return { screen: 'play' };
}

const SHOTS = {
  // Dario on foot downtown, a taxi and traffic passing by.
  street: (world) => {
    const p = world.state.player;
    p.x = 1600; p.y = 1400; p.angle = 0;
    world.spawnCar('taxi', 1660, 1328, 0, null);
    world.spawnCar('sedan', 1500, 1328, Math.PI, 'npc');
    walkForward(world, 2.5);
    return clearBanner(world);
  },
  // The Portside Heist firefight: guards in the open dock road, SMG out.
  mission: (world) => {
    world.startMission(3); // Portside Heist: guards at the docks
    // Stage the firefight on the open dock road (clear line of sight), not
    // between the warehouses where walls eat every bullet.
    world.state.guards = [];
    for (const [gx, gy] of [[2624, 380], [2660, 450], [2590, 600], [2700, 420]]) {
      world.state.guards.push({ x: gx, y: gy, angle: 0, health: 50, shootCd: 0.8, dead: false, strafeDir: 1, strafeT: 1 });
    }
    const p = world.state.player;
    p.x = 2624; p.y = 560; p.angle = -Math.PI / 2;
    giveWeapon(world, 'smg');
    world.state.wanted = 2;
    const input = fakeInput(0, 0, { x: 2624, y: 380 }, true);
    for (let i = 0; i < 1.2 / STEP; i += 1) {
      const g = world.state.guards.find((gg) => !gg.dead);
      if (g) input.aim = { x: g.x, y: g.y };
      world.step(STEP, input);
    }
    return clearBanner(world);
  },
  // A beachfront drive with a fare aboard, up the coast road.
  beach: (world) => {
    const car = world.spawnCar('coupe', 2948, 2600, -Math.PI / 2, 'player');
    car.speed = 280;
    const p = world.state.player;
    p.car = car; p.onFoot = false;
    world.state.taxi = { state: 'ride', px: 2948, py: 2600, dx: 2948, dy: 1100, fare: 0, riding: true, patience: 75, chain: 0 };
    world.banner('Taxi fare', 'Take the passenger up the beachfront', 10);
    driveForward(world, 2);
    return clearBanner(world);
  },
  // The cover: a 3-star police chase through Neon Row in the Cometa GT.
  cover: (world) => {
    world.startMission(2); // Neon Run: objective marker ahead
    const car = world.spawnCar('sport', 1500, 1328, 0, 'player');
    car.speed = 300;
    const p = world.state.player;
    p.car = car; p.onFoot = false;
    world.state.wanted = 3;
    placePoliceChase(world, 1500, 1328, 0);
    world.spawnCar('sedan', 1900, 1328, 0, 'npc');
    driveForward(world, 2.5);
    return clearBanner(world);
  },
};

/** The scene names ?shot= accepts. */
export function listShots() { return Object.keys(SHOTS); }

/**
 * Set `world` to the named scene and return the screen to draw.
 * cover: a 3-star police chase in Neon Row. street: Dario on foot downtown.
 * mission: the Portside Heist firefight. beach: a beachfront drive, fare aboard.
 * An unknown name falls back to the cover.
 */
export function stageShot(name, world) {
  world.reset();
  const scene = SHOTS[name] || SHOTS.cover;
  return scene(world);
}
