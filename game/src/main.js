// main.js: boot and the one loop. The game moves between title, play, paused,
// shop and game-over screens; the world advances in fixed 1/60 s steps.
// ?seed=N fixes the city. ?shot=cover|street|mission|beach stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
// Settings (mute, radio station) persist across sessions; the game autosaves
// once a minute while playing, and the game-over screen reports the run.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MISSION, ACTION_RADIO, ACTION_MUTE } from './input.js';
import { createRenderer, hudText } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, hasSave, loadSettings, saveSettings, readSaveMeta } from './save.js';
import { failMission } from './missions.js';
import { buyItem, ownedWeapons, shopCatalog } from './activities.js';
import { wantedStars } from './police.js';
import { WEAPONS } from './config.js';

const MAX_FRAME = 0.25;
const AUTOSAVE_MS = 60000;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const minimap = document.getElementById('minimap');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
window.__world = world; // debug hook: lets a test read the live state
const renderer = createRenderer(canvas, minimap);
const input = createInput(canvas);
const audio = createAudio();
// Restore the player's settings before the first frame draws the HUD.
const settings = loadSettings();
audio.setMuted(settings.muted);
audio.setStation(settings.station);

const $ = (id) => document.getElementById(id);
const hud = {
  health: $('hud-health'), healthBar: $('hud-health-bar'), armor: $('hud-armor'), armorBar: $('hud-armor-bar'),
  stamina: $('hud-stamina'), staminaBar: $('hud-stamina-bar'),
  money: $('hud-money'), rep: $('hud-rep'), stars: $('hud-stars'), clock: $('hud-clock'),
  district: $('hud-district'), phase: $('hud-phase'), speed: $('hud-speed'), weapon: $('hud-weapon'), ammo: $('hud-ammo'),
  objective: $('hud-objective'), missionTitle: $('hud-mission'), taxi: $('hud-taxi'), race: $('hud-race'),
  banner: $('hud-banner'), bannerSub: $('hud-banner-sub'), radio: $('hud-radio'),
  packages: $('hud-packages'),
};

function announce(message) { status.textContent = message; }

function updateHUD() {
  const t = hudText(world.state, world);
  hud.health.textContent = t.health;
  hud.healthBar.style.width = `${t.health}%`;
  hud.armor.textContent = t.armor;
  hud.armorBar.style.width = `${t.armor}%`;
  hud.stamina.textContent = t.stamina;
  hud.staminaBar.style.width = `${t.stamina}%`;
  hud.money.textContent = `$${t.money.toLocaleString('en-US')}`;
  hud.rep.textContent = `REP ${t.rep}`;
  hud.stars.textContent = '★'.repeat(t.stars) + '☆'.repeat(5 - t.stars);
  hud.stars.className = t.stars > 0 ? 'wanted' : '';
  hud.stars.title = t.wantedLabel;
  hud.clock.textContent = t.clock;
  hud.phase.textContent = t.phase;
  hud.district.textContent = t.district;
  hud.speed.textContent = t.speed > 0 ? `${t.speed} km/h` : '';
  hud.weapon.textContent = t.weapon;
  hud.ammo.textContent = t.ammo;
  hud.missionTitle.textContent = t.missionTitle;
  hud.objective.textContent = t.missionTimer > 0 ? `${t.objective} — ${t.missionTimer}s` : t.objective;
  hud.taxi.textContent = t.taxi;
  hud.race.textContent = t.race;
  hud.packages.textContent = `Packages ${t.packages}`;
  hud.radio.textContent = `${audio.stationName()} — ${audio.stationDesc()}`;
  if (t.banner) {
    hud.banner.textContent = t.banner.text;
    hud.bannerSub.textContent = t.banner.sub;
    $('hud-banner-box').style.display = 'block';
  } else $('hud-banner-box').style.display = 'none';
}

// The last wanted level, so a star gained or lost plays its sting once.
let prevStars = 0;

function playEvents(events) {
  const p = world.state.player;
  for (const e of events) {
    if (e === 'shoot') audio.shoot(p.weapon);
    else if (e === 'punch') audio.punch();
    else if (e === 'pickup' || e === 'missionStep') audio.pickup();
    else if (e === 'cash') audio.cash();
    else if (e === 'crash') audio.crash();
    else if (e === 'explosion') audio.explosion();
    else if (e === 'skid') audio.skid();
    else if (e === 'scream') audio.scream();
    else if (e === 'hurt') audio.hit();
    else if (e === 'enterCar' || e === 'exitCar') audio.doorSlam();
    else if (e === 'bossEnrage' || e === 'backup') audio.sirenSting();
    else if (e === 'missionComplete') { audio.jingle(); saveGame(world); }
    else if (e === 'wasted' || e === 'busted') audio.fail();
    else if (e === 'steal') audio.sirenSting();
    else if (e === 'shopOpen') audio.jingle();
    else if (e === 'respawn') audio.jingle();
  }
  const stars = wantedStars(world.state.wanted);
  if (stars > prevStars) audio.wantedUp();
  else if (stars < prevStars) audio.wantedDown();
  prevStars = stars;
  const anySiren = world.state.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 700);
  audio.setSiren(anySiren);
  audio.setEngine(p.car ? Math.abs(p.car.speed) / 430 : 0, !!p.car);
}

function showOnly(id) {
  for (const el of ['title-screen', 'pause-screen', 'over-screen', 'shop-screen']) {
    $(el).style.display = el === id ? 'flex' : 'none';
  }
  $('hud').style.display = id === null ? 'block' : 'none';
}

function startPlay(fresh) {
  if (fresh) world.reset();
  showOnly(null);
  announce('Playing. WASD to move and drive, E to enter a car, T for the next job.');
}

function openShop() {
  const kind = world.state.shopOpen;
  const items = shopCatalog(world);
  $('shop-title').textContent = kind === 'arms' ? 'SOLMARA ARMS' : 'SOLMARA GENERAL';
  $('shop-money').textContent = `$${world.state.money}`;
  const list = $('shop-list');
  list.innerHTML = '';
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const name = document.createElement('span');
    name.textContent = it.label;
    const btn = document.createElement('button');
    btn.textContent = it.locked ? 'Locked' : it.price === 0 ? 'Equip' : `$${it.price}`;
    btn.disabled = !!it.locked;
    btn.onclick = () => {
      if (it.price === 0) {
        world.state.player.weapon = it.key;
        world.state.player.mag = WEAPONS[it.key].mag;
        world.state.player.magCache[it.key] = WEAPONS[it.key].mag;
      } else if (buyItem(world, it.key)) audio.cash();
      openShop();
    };
    row.append(name, btn);
    list.append(row);
  }
  showOnly('shop-screen');
}

function runShot(name) {
  const scene = stageShot(name, world);
  renderer.snapTo(world.state.player.x, world.state.player.y);
  showOnly(null); // the HUD (money, stars, minimap, objective) must show in shots
  updateHUD();
  let painted = 0;
  function paint() {
    renderer.draw(world.state, world, scene.screen, world.state.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let lastSave = performance.now();
  let frames = 0;
  let fpsAt = performance.now();
  const titleInput = { move: () => ({ x: 0, y: 0 }), running: () => false, braking: () => false, mouse: () => ({ down: false, clicked: false }), takeActions: () => 0, aim: null };

  function resize() {
    renderer.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  $('btn-new').onclick = () => { audio.unlock(); startPlay(true); screen = 'play'; };
  $('btn-continue').onclick = () => {
    audio.unlock();
    world.reset();
    loadGame(world);
    startPlay(false); screen = 'play';
  };
  $('btn-help').onclick = () => { $('help').style.display = $('help').style.display === 'block' ? 'none' : 'block'; };
  $('btn-resume').onclick = () => { screen = 'play'; showOnly(null); };
  $('btn-save').onclick = () => { saveGame(world); $('btn-save').textContent = 'Saved!'; setTimeout(() => { $('btn-save').textContent = 'Save game'; }, 1200); };
  $('btn-quit').onclick = () => { screen = 'title'; showOnly('title-screen'); };
  $('btn-respawn').onclick = () => {
    if (world.state.mission.state === 'active') failMission(world, 'The job fell apart.');
    world.respawn([]);
    screen = 'play'; showOnly(null);
  };
  $('btn-shop-close').onclick = () => { world.state.shopOpen = null; showOnly(null); };
  const meta = readSaveMeta();
  $('btn-continue').style.display = hasSave() ? 'block' : 'none';
  if (meta) $('btn-continue').textContent = `Continue — $${meta.money.toLocaleString('en-US')} · ${meta.missionsDone} jobs`;

  function persistSettings() {
    saveSettings({ muted: audio.isMuted(), station: settings.station });
  }

  function handleActions(actions) {
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') { screen = 'paused'; showOnly('pause-screen'); }
      else if (screen === 'paused') { screen = 'play'; showOnly(null); }
      return;
    }
    if (screen === 'title' && (actions & ACTION_CONFIRM)) { audio.unlock(); startPlay(true); screen = 'play'; return; }
    if (screen === 'over' && (actions & ACTION_CONFIRM)) { $('btn-respawn').onclick(); return; }
    if (screen !== 'play') return;
    if (actions & ACTION_RADIO) {
      settings.station = (settings.station + 1) % audio.stationCount();
      audio.nextStation();
      persistSettings();
    }
    if (actions & ACTION_MUTE) {
      const m = audio.toggleMute();
      announce(m ? 'Muted.' : 'Sound on.');
      persistSettings();
    }
    if (actions & ACTION_MISSION) {
      const st = world.state.mission;
      const next = st.state === 'idle' ? st.index : st.index + 1;
      if (st.state === 'active') return;
      if (next < 6) world.startMission(next);
      else announce('Story complete — Solmara is yours.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    frames += 1;
    if (now - fpsAt >= 1000) { window.__fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    const actions = input.takeActions();
    handleActions(actions);
    if (world.state.shopOpen && screen === 'play') { openShop(); screen = 'shop'; }
    if (screen === 'shop' && !world.state.shopOpen) { screen = 'play'; showOnly(null); }
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === 'play') {
      // Aim: mouse screen position into world coordinates.
      const m = input.mouse();
      const cam = renderer.cam;
      input.aim = { x: cam.x + (m.x - canvas.width / 2) / cam.zoom, y: cam.y + (m.y - canvas.height / 2) / cam.zoom };
      // Autosave once a minute while playing.
      if (now - lastSave > AUTOSAVE_MS) { lastSave = now; saveGame(world); }
      while (accumulator >= STEP) {
        const events = world.step(STEP, input, actions);
        playEvents(events);
        accumulator -= STEP;
        if (world.state.gameOver) {
          screen = 'over';
          const st = world.state.stats;
          $('over-title').textContent = world.state.gameOver === 'wasted' ? 'FLATLINED' : 'NABBED';
          $('over-sub').textContent = world.state.gameOver === 'wasted'
            ? 'Dario went down. The hospital patches him up — for a price.'
            : 'The SMPD caught up with Dario. Bail and a fine, then back to the streets.';
          $('over-stats').textContent = `${st.missionsDone} jobs done · $${st.earned.toLocaleString('en-US')} earned · ${st.carsStolen} cars stolen · ${Math.round(st.playSeconds / 60)} min on the streets`;
          showOnly('over-screen');
          break;
        }
      }
    } else if (screen === 'title') {
      while (accumulator >= STEP) { world.step(STEP, titleInput, 0); accumulator -= STEP; }
    } else {
      accumulator = 0;
    }
    // The music ducks under a banner so a mission brief stays readable.
    audio.duck(!!world.state.banner && screen === 'play');
    if (screen === 'title') renderer.draw(world.state, world, 'title', world.state.time);
    else renderer.draw(world.state, world, 'play', world.state.time);
    if (screen === 'play' || screen === 'paused' || screen === 'shop' || screen === 'over') updateHUD();
  }

  showOnly('title-screen');
  announce('Solmara. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
