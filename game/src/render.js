// render.js: paints everything — the sun-soaked city, the sea and beach, cars
// and people, muzzle flashes and smoke, and the HUD: health, wanted stars,
// money, the mission line and the minimap. The camera follows Dario (or his
// car) and pulls back a little at speed so the road ahead stays readable.
// The light changes with the clock: dusk warms the city, night darkens it and
// headlights and neon take over. A fresh wanted star flashes the screen red.
import { CAR_MODELS, COLORS, ROAD_W, WEAPONS } from './config.js';
import { wantedStars, wantedLabel } from './police.js';

export function createRenderer(canvas, minimap) {
  const ctx = canvas.getContext('2d');
  const mctx = minimap ? minimap.getContext('2d') : null;
  const cam = { x: 0, y: 0, zoom: 1 };

  function resize(w, h) {
    canvas.width = w; canvas.height = h;
    if (minimap) { minimap.width = 190; minimap.height = 190; }
  }

  function draw(state, world, screen, time) {
    const w = canvas.width; const h = canvas.height;
    const p = state.player;
    const targetZoom = p.onFoot ? 1 : 0.82;
    cam.zoom += (targetZoom - cam.zoom) * 0.05;
    const lookX = p.onFoot ? 0 : Math.cos(p.angle) * 40;
    const lookY = p.onFoot ? 0 : Math.sin(p.angle) * 40;
    cam.x += ((p.x + lookX) - cam.x) * 0.08;
    cam.y += ((p.y + lookY) - cam.y) * 0.08;
    ctx.save();
    ctx.fillStyle = '#0f7fa8';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawCity(ctx, world, time);
    drawSkids(ctx, state);
    drawPickups(ctx, state, time);
    drawCars(ctx, state, time);
    drawSpeedLines(ctx, state);
    drawPeds(ctx, state, time);
    drawGuards(ctx, state, time);
    drawCops(ctx, state, time);
    drawPlayer(ctx, state, time);
    drawBullets(ctx, state);
    drawParticles(ctx, state);
    drawMissionMarker(ctx, state, time);
    drawDayTint(ctx, state, w, h);
    ctx.restore();
    if (screen === 'play') drawMinimap(state, world);
    if (screen === 'play') drawEdgeArrow(state, w, h);
    // A fresh wanted star flashes the screen edge red.
    if (state.wantedFlash > 0) {
      ctx.strokeStyle = `rgba(255,46,46,${(state.wantedFlash * 0.55).toFixed(2)})`;
      ctx.lineWidth = 26;
      ctx.strokeRect(0, 0, w, h);
    }
    void time;
  }

  // Warm at dusk, dark at night — with headlight cones cutting through it.
  function drawDayTint(ctx, state, w, h) {
    const phase = state.dayPhase;
    if (phase !== 'dusk' && phase !== 'night') return;
    const vw = w / cam.zoom; const vh = h / cam.zoom;
    const x0 = cam.x - vw / 2; const y0 = cam.y - vh / 2;
    ctx.fillStyle = phase === 'dusk' ? COLORS.duskTint : COLORS.nightTint;
    ctx.fillRect(x0, y0, vw, vh);
    if (phase === 'night') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const car of state.cars) {
        if (car.dead || !car.driver) continue;
        const fx = Math.cos(car.angle); const fy = Math.sin(car.angle);
        const grad = ctx.createRadialGradient(car.x, car.y, 10, car.x + fx * 90, car.y + fy * 90, 120);
        grad.addColorStop(0, 'rgba(255,240,180,0.20)');
        grad.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(car.x + fx * 20, car.y + fy * 20);
        ctx.lineTo(car.x + fx * 120 - fy * 34, car.y + fy * 120 + fx * 34);
        ctx.lineTo(car.x + fx * 120 + fy * 34, car.y + fy * 120 - fx * 34);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawCity(ctx, world, time) {
    drawGround(ctx, world, time);
    drawRoads(ctx, world);
    drawProps(ctx, world);
  }

  function drawGround(ctx, world, time) {
    const { city } = world;
    const S = city.size;
    // Sea and sand.
    ctx.fillStyle = COLORS.seaDeep; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(2960, 0, S - 2960, S);
    ctx.fillRect(0, 2960, S, S - 2960);
    // Animated wave line where sea meets sand.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = 0; y <= S; y += 40) ctx.lineTo(3004 + Math.sin(y / 90 + time * 0.8) * 5, y);
    ctx.stroke();
    ctx.beginPath();
    for (let x = 0; x <= S; x += 40) ctx.lineTo(x, 3004 + Math.sin(x / 90 + time * 0.8) * 5);
    ctx.stroke();
    // Land: warm pavement inside every block, so the city reads as a city.
    ctx.fillStyle = '#c9b18c';
    ctx.fillRect(0, 0, 2960, 2960);
    for (let bx = 0; bx < 9; bx += 1) {
      for (let by = 0; by < 9; by += 1) {
        const x0 = city.roadsV[bx] + ROAD_W / 2 + 2;
        const y0 = city.roadsH[by] + ROAD_W / 2 + 2;
        const x1 = city.roadsV[bx + 1] - ROAD_W / 2 - 2;
        const y1 = city.roadsH[by + 1] - ROAD_W / 2 - 2;
        if (x0 >= 2920 || y0 >= 2920) continue;
        ctx.fillStyle = (bx + by) % 2 === 0 ? '#bfae8e' : '#b5a586';
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    // Sand beach.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(2880, 0, 80, 2960);
    ctx.fillRect(0, 2880, 2960, 80);
    // Parks.
    for (const pk of city.parks) {
      ctx.fillStyle = COLORS.park;
      ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(pk.x + 8, pk.y + 8, pk.w - 16, 4);
    }
  }

  function drawRoads(ctx, world) {
    const { city } = world;
    // Sidewalks then asphalt.
    for (const ry of city.roadsH) {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(0, ry - 32, 2960, 64);
      ctx.fillStyle = COLORS.asphalt;
      ctx.fillRect(0, ry - 24, 2960, 48);
    }
    for (const rx of city.roadsV) {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(rx - 32, 0, 64, 2960);
      ctx.fillStyle = COLORS.asphalt;
      ctx.fillRect(rx - 24, 0, 48, 2960);
    }
    // Lane dashes.
    ctx.fillStyle = COLORS.lane;
    for (const ry of city.roadsH) {
      for (let x = 20; x < 2960; x += 56) ctx.fillRect(x, ry - 2, 28, 4);
    }
    for (const rx of city.roadsV) {
      for (let y = 20; y < 2960; y += 56) ctx.fillRect(rx - 2, y, 4, 28);
    }
  }

  function drawProps(ctx, world) {
    const { city } = world;
    // Pier into the sea at Marina Bay.
    ctx.fillStyle = '#8a6d4b';
    ctx.fillRect(2740, 2960, 90, 150);
    ctx.fillStyle = '#a67c52';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(2740, 2980 + i * 28, 90, 6);
    // Buildings with roofs, shade, roof furniture and the odd pool.
    for (const b of city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 8, b.y + b.h - 12, b.w - 16, 5);
      if (b.detail === 'ac') {
        ctx.fillStyle = '#5d6d7e';
        ctx.fillRect(b.x + 8, b.y + 8, 12, 9);
      } else if (b.detail === 'vent') {
        ctx.fillStyle = '#7b7d7d';
        ctx.fillRect(b.x + b.w - 20, b.y + 8, 10, 10);
      }
      if (b.pool) {
        ctx.fillStyle = '#35c4e8';
        ctx.fillRect(b.x + b.w - 34, b.y + 10, 24, 16);
      }
      if (b.tall) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(b.x + b.w / 2 - 3, b.y - 16, 6, 16);
      }
    }
    // Neon signs glow in Neon Row (brighter after dark).
    const night = world.state.dayPhase === 'night';
    for (const n of city.neons) {
      ctx.save();
      ctx.shadowColor = n.color; ctx.shadowBlur = night ? 22 : 14;
      ctx.fillStyle = n.color;
      ctx.fillRect(n.x - n.w / 2, n.y, n.w, 6);
      ctx.restore();
    }
    // Palms.
    for (const pl of city.palms) drawPalm(ctx, pl.x, pl.y, pl.s);
    // Beach umbrellas.
    for (const u of city.umbrellas || []) {
      ctx.strokeStyle = '#8a6d4b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x, u.y - 12); ctx.stroke();
      ctx.fillStyle = u.color;
      ctx.beginPath(); ctx.arc(u.x, u.y - 12, 11, Math.PI, 0); ctx.fill();
    }
  }

  function drawPalm(ctx, x, y, s) {
    ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3 * s, y - 12 * s); ctx.stroke();
    ctx.fillStyle = '#2f9e44';
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(x + 3 * s + Math.cos(a) * 8 * s, y - 12 * s + Math.sin(a) * 5 * s, 9 * s, 3.5 * s, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSkids(ctx, state) {
    ctx.save();
    ctx.strokeStyle = 'rgba(20,20,24,0.55)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const s of state.skids) {
      ctx.globalAlpha = Math.min(0.6, s.life / 6);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 10, s.y - Math.sin(s.angle) * 10);
      ctx.lineTo(s.x + Math.cos(s.angle) * 10, s.y + Math.sin(s.angle) * 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPickups(ctx, state, time) {
    for (const pk of state.pickups) {
      const bob = Math.sin(time * 3 + pk.bob) * 3;
      ctx.save();
      ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 10;
      ctx.fillStyle = pk.kind === 'health' ? '#ff5b5b' : pk.kind === 'armor' ? '#4d96ff' : '#ffe14d';
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'armor' ? 'A' : '»', pk.x, pk.y + bob);
    }
    for (const s of state.packages.spots) {
      if (s.got) continue;
      ctx.save();
      ctx.shadowColor = COLORS.neonPink; ctx.shadowBlur = 12;
      ctx.fillStyle = COLORS.neonPink;
      ctx.fillRect(s.x - 8, s.y - 8 + Math.sin(time * 2 + s.x) * 2, 16, 16);
      ctx.restore();
    }
  }

  function drawCarShape(ctx, car, time) {
    const spec = CAR_MODELS[car.model];
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-spec.w / 2 + 3, -spec.h / 2 + 4, spec.w, spec.h);
    ctx.fillStyle = car.color;
    roundRect(ctx, -spec.w / 2, -spec.h / 2, spec.w, spec.h, 7);
    ctx.fill();
    if (car.model === 'police') {
      ctx.fillStyle = COLORS.policeBlack;
      ctx.fillRect(-spec.w / 2 + 4, -spec.h / 2, spec.w - 8, 5);
      ctx.fillRect(-spec.w / 2 + 4, spec.h / 2 - 5, spec.w - 8, 5);
      const flash = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e7bff';
      ctx.fillRect(-6, -spec.h / 2 - 2, 12, 5);
      ctx.fillStyle = flash ? '#2e7bff' : '#ff2e2e';
      ctx.fillRect(-6, spec.h / 2 - 3, 12, 5);
    }
    if (car.model === 'taxi') {
      ctx.fillStyle = '#1c2430';
      ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    ctx.fillStyle = '#bfe8ff';
    ctx.fillRect(spec.w * 0.08, -spec.h / 2 + 3, spec.w * 0.22, spec.h - 6);
    // A beaten-up player car shows a cracked windshield.
    if (car.driver === 'player' && car.health < 40) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(spec.w * 0.08, 0);
      ctx.lineTo(spec.w * 0.2, -spec.h / 2 + 4);
      ctx.moveTo(spec.w * 0.08, 0);
      ctx.lineTo(spec.w * 0.22, spec.h / 2 - 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#1c2430';
    ctx.fillRect(-spec.w / 2 + 4, -spec.h / 2 - 2, 6, 4);
    ctx.fillRect(-spec.w / 2 + 4, spec.h / 2 - 2, 6, 4);
    ctx.fillRect(spec.w / 2 - 10, -spec.h / 2 - 2, 6, 4);
    ctx.fillRect(spec.w / 2 - 10, spec.h / 2 - 2, 6, 4);
    if (car.health < 55) {
      ctx.fillStyle = 'rgba(60,60,60,0.7)';
      ctx.beginPath(); ctx.arc(-spec.w / 4, 0, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCars(ctx, state, time) {
    for (const car of state.cars) {
      if (car.dead) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        drawCarShape(ctx, car, time);
        ctx.restore();
        continue;
      }
      drawCarShape(ctx, car, time);
    }
  }

  function drawPerson(ctx, x, y, angle, shirt, pants, phase, scale) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const bob = Math.sin(phase) * 2;
    ctx.fillStyle = pants || '#2c3e50';
    ctx.fillRect(-4 * s, -3 * s + bob, 8 * s, 6 * s);
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(0, 0, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(9 * s, 0, 4.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPeds(ctx, state, time) {
    for (const pd of state.peds) {
      if (pd.state === 'dead') {
        ctx.save();
        ctx.translate(pd.x, pd.y);
        ctx.rotate(1.2);
        ctx.fillStyle = pd.shirt;
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        continue;
      }
      drawPerson(ctx, pd.x, pd.y, pd.angle, pd.shirt, '#2c3e50', pd.walkPhase, 1);
    }
  }

  function drawGuards(ctx, state, time) {
    for (const g of state.guards) {
      drawPerson(ctx, g.x, g.y, g.angle, g.boss ? '#8e44ad' : '#1c2430', '#1c2430', time * 6, g.boss ? 1.25 : 1);
      ctx.fillStyle = g.boss ? '#ff2e88' : '#ff5b5b';
      ctx.fillRect(g.x - 12, g.y - 18, 24 * Math.max(0, g.health / (g.boss ? 160 : 60)), 3);
    }
  }

  function drawCops(ctx, state, time) {
    for (const cp of state.cops) {
      drawPerson(ctx, cp.x, cp.y, cp.angle, '#1f4e79', '#141414', time * 7, 1.05);
      ctx.fillStyle = '#1f4e79';
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 9, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawPlayer(ctx, state, time) {
    const p = state.player;
    if (p.dead) return;
    if (!p.onFoot) return; // the car is the player
    drawPerson(ctx, p.x, p.y, p.angle, '#ff6b35', '#2e4053', time * 8, 1.1);
    // Aim line while armed.
    if (p.weapon !== 'fists') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18);
      ctx.lineTo(p.x + Math.cos(p.angle) * 60, p.y + Math.sin(p.angle) * 60);
      ctx.stroke();
    }
  }

  function drawBullets(ctx, state) {
    ctx.fillStyle = '#ffe14d';
    for (const b of state.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawParticles(ctx, state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMissionMarker(ctx, state, time) {
    const st = state.mission;
    const targets = [];
    if (st.state === 'active' && st.target) targets.push({ x: st.target.x, y: st.target.y, color: '#ffe14d' });
    if (state.taxi) {
      const t = state.taxi;
      targets.push({ x: t.state === 'pickup' ? t.px : t.dx, y: t.state === 'pickup' ? t.py : t.dy, color: '#2ecc71' });
    }
    if (state.race) {
      const cp = state.race.checkpoints[state.race.next];
      if (cp) targets.push({ x: cp.x, y: cp.y, color: '#00e5ff' });
    }
    for (const tg of targets) {
      const pulse = 14 + Math.sin(time * 5) * 4;
      ctx.save();
      ctx.strokeStyle = tg.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = tg.color;
      ctx.beginPath();
      ctx.moveTo(tg.x, tg.y - pulse - 14);
      ctx.lineTo(tg.x - 7, tg.y - pulse - 2);
      ctx.lineTo(tg.x + 7, tg.y - pulse - 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawMinimap(state, world) {
    if (!mctx) return;
    const S = world.city.size;
    const k = 190 / S;
    mctx.fillStyle = '#0f2a3a';
    mctx.fillRect(0, 0, 190, 190);
    mctx.fillStyle = '#1fa8c9';
    mctx.fillRect(190 * 2960 / S, 0, 190 - 190 * 2960 / S, 190);
    mctx.fillRect(0, 190 * 2960 / S, 190, 190 - 190 * 2960 / S);
    mctx.fillStyle = '#c9b18c';
    mctx.fillRect(0, 0, 190 * 2960 / S, 190 * 2960 / S);
    mctx.strokeStyle = '#3a3f4a'; mctx.lineWidth = 2;
    for (const ry of world.city.roadsH) { mctx.beginPath(); mctx.moveTo(0, ry * k); mctx.lineTo(190, ry * k); mctx.stroke(); }
    for (const rx of world.city.roadsV) { mctx.beginPath(); mctx.moveTo(rx * k, 0); mctx.lineTo(rx * k, 190); mctx.stroke(); }
    const dot = (x, y, color, r) => { mctx.fillStyle = color; mctx.beginPath(); mctx.arc(x * k, y * k, r || 3, 0, Math.PI * 2); mctx.fill(); };
    for (const c of state.cars) if (c.driver === 'police') dot(c.x, c.y, '#2e7bff', 3.5);
    for (const g of state.guards) dot(g.x, g.y, '#ff5b5b', 2.5);
    for (const s of state.packages.spots) if (!s.got) dot(s.x, s.y, '#ff2e88', 2);
    if (state.mission.state === 'active' && state.mission.target) dot(state.mission.target.x, state.mission.target.y, '#ffe14d', 4);
    if (state.taxi) dot(state.taxi.state === 'pickup' ? state.taxi.px : state.taxi.dx, state.taxi.state === 'pickup' ? state.taxi.py : state.taxi.dy, '#2ecc71', 4);
    if (state.race) {
      const cp = state.race.checkpoints[state.race.next];
      if (cp) dot(cp.x, cp.y, '#00e5ff', 4);
    }
    const p = state.player;
    dot(p.x, p.y, '#fff', 4);
    // Player heading wedge, so the map reads like a compass.
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.moveTo((p.x + Math.cos(p.angle) * 130) * k, (p.y + Math.sin(p.angle) * 130) * k);
    mctx.lineTo((p.x + Math.cos(p.angle + 2.6) * 90) * k, (p.y + Math.sin(p.angle + 2.6) * 90) * k);
    mctx.lineTo((p.x + Math.cos(p.angle - 2.6) * 90) * k, (p.y + Math.sin(p.angle - 2.6) * 90) * k);
    mctx.closePath(); mctx.fill();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(p.x * k, p.y * k, 5.5, 0, Math.PI * 2); mctx.stroke();
  }

  // Speed streaks: at full tilt the world streaks past the car.
  function drawSpeedLines(ctx, state) {
    const p = state.player;
    if (!p.car || Math.abs(p.car.speed) < 300) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const a = p.car.angle + Math.PI + (Math.random() - 0.5) * 0.9;
      const d = 60 + Math.random() * 90;
      const x = p.car.x + Math.cos(a) * d;
      const y = p.car.y + Math.sin(a) * d;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(p.car.angle) * 26, y + Math.sin(p.car.angle) * 26);
      ctx.stroke();
    }
    ctx.restore();
  }

  // When the active objective is off-screen, an arrow at the screen edge points at it.
  function drawEdgeArrow(state, w, h) {
    const st = state.mission;
    let tx = null; let ty = null; let color = '#ffe14d';
    if (st.state === 'active' && st.target) { tx = st.target.x; ty = st.target.y; }
    else if (state.taxi) { const t = state.taxi; tx = t.state === 'pickup' ? t.px : t.dx; ty = t.state === 'pickup' ? t.py : t.dy; color = '#2ecc71'; }
    else if (state.race) { const cp = state.race.checkpoints[state.race.next]; if (cp) { tx = cp.x; ty = cp.y; color = '#00e5ff'; } }
    if (tx === null) return;
    const sx = (tx - cam.x) * cam.zoom + w / 2;
    const sy = (ty - cam.y) * cam.zoom + h / 2;
    if (sx > 40 && sx < w - 40 && sy > 40 && sy < h - 40) return; // on screen already
    const cx = Math.max(40, Math.min(w - 40, sx));
    const cy = Math.max(40, Math.min(h - 40, sy));
    const a = Math.atan2(sy - cy, sx - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function snapTo(x, y) {
    cam.x = x; cam.y = y;
  }

  return { draw, resize, cam, snapTo };
}

export function hudText(state, world) {
  const p = state.player;
  const stars = wantedStars(state.wanted);
  const clockH = Math.floor(state.clockMin / 60) % 24;
  const clockM = Math.floor(state.clockMin % 60);
  const clock = `${String(clockH).padStart(2, '0')}:${String(clockM).padStart(2, '0')}`;
  const speed = p.car ? Math.round(Math.abs(p.car.speed) * 0.36) : 0;
  const w = WEAPONS[p.weapon];
  const ammo = p.weapon === 'fists' ? '—' : `${p.mag}/${p.ammo[p.weapon] || 0}`;
  const st = state.mission;
  const timer = st.state === 'active' && st.timer > 0 ? Math.ceil(st.timer) : 0;
  const race = state.race;
  return {
    health: Math.ceil(p.health), armor: Math.ceil(p.armor),
    stamina: Math.round(p.stamina ?? 100),
    money: state.money, rep: state.rep, stars, wantedLabel: wantedLabel(stars),
    clock, phase: state.dayPhase || 'day', speed,
    weapon: w.name, ammo,
    district: world.city.districtAt(p.x, p.y).name,
    objective: st.state === 'active' ? st.text : '',
    missionTitle: st.state === 'active' ? world.missions[st.index].title : '',
    missionTimer: timer,
    taxi: state.taxi ? (state.taxi.state === 'pickup' ? `Pick up the passenger (${Math.ceil(state.taxi.patience || 0)}s)` : 'Take the passenger to the marker') : '',
    race: race ? (race.countdown > 0 ? `Race: ${race.name} — ${Math.ceil(race.countdown)}…` : `Race: checkpoint ${race.next + 1}/${race.checkpoints.length} — ${Math.ceil(race.timer)}s`) : '',
    banner: state.banner,
    packages: `${state.packages.collected}/${state.packages.total}`,
    fares: state.stats.faresDone || 0,
    racesWon: state.stats.racesWon || 0,
  };
}
