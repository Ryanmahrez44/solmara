// city.js: builds Solmara, our own sun-soaked coastal city. A road grid with
// named districts, a beach and ocean on the east and south edges, a pier in
// Marina Bay, parks, palms and neon in Neon Row. Traffic drives on the road
// graph (roadsH / roadsV); everything else collides with building boxes.
// Districts tune the city: Neon Row is dense and policed, Hillside is quiet.
// The beach, the water and the sidewalks are queries now, so peds, police and
// the spawn director all ask the city where things belong instead of guessing.
import { BLOCK, CITY_SIZE, COLORS, DISTRICTS, ROAD_W } from './config.js';

const PITCH = BLOCK + ROAD_W; // 324
const LAND = 2920; // land ends here; sand then sea to CITY_SIZE

export function createCity(random) {
  const roadsH = [];
  const roadsV = [];
  for (let i = 0; i < 10; i += 1) {
    const c = ROAD_W / 2 + i * PITCH;
    roadsH.push(c);
    roadsV.push(c);
  }

  const buildings = [];
  const palms = [];
  const parks = [];
  const neons = [];
  // Blocks sit between neighbouring roads; the last row/column is beach.
  for (let bx = 0; bx < 9; bx += 1) {
    for (let by = 0; by < 9; by += 1) {
      const x0 = roadsV[bx] + ROAD_W / 2 + 8;
      const y0 = roadsH[by] + ROAD_W / 2 + 8;
      const x1 = roadsV[bx + 1] - ROAD_W / 2 - 8;
      const y1 = roadsH[by + 1] - ROAD_W / 2 - 8;
      if (x0 >= LAND || y0 >= LAND) continue; // beach blocks stay open
      const district = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      if (random.chance(0.16)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, district });
        for (let p = 0; p < 7; p += 1) {
          palms.push({ x: random.range(x0 + 14, x1 - 14), y: random.range(y0 + 14, y1 - 14), s: random.range(0.8, 1.3) });
        }
        continue;
      }
      const count = random.int(1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = random.range(60, (x1 - x0) / count - 14);
        const h = random.range(60, (y1 - y0) - 14);
        const x = x0 + ((x1 - x0) / count) * b + random.range(4, 14);
        const y = y0 + random.range(4, Math.max(5, y1 - y0 - h - 4));
        const color = random.pick(COLORS.buildingRoof);
        const tall = district.name === 'Neon Row' || district.name === 'Portside' ? random.chance(0.5) : random.chance(0.15);
        // Roof furniture: an AC box or a vent, drawn by the renderer.
        const detail = random.weighted([['ac', 3], ['vent', 2], ['none', 5]]);
        buildings.push({ x, y, w, h, color, tall, detail, district: district.name, pool: district.name === 'Hillside' && random.chance(0.5) });
        if (district.name === 'Neon Row' && random.chance(0.7)) {
          neons.push({ x: x + w / 2, y: y + h + 4, w: random.range(30, 70), color: random.pick([COLORS.neonPink, COLORS.neonCyan, COLORS.neonYellow]) });
        }
      }
    }
  }
  // Palm-lined beach: two rows along the sand.
  for (let i = 0; i < 46; i += 1) {
    palms.push({ x: 2932 + random.range(-6, 6), y: 60 + i * 62 + random.range(-8, 8), s: random.range(0.9, 1.4) });
    palms.push({ x: 60 + i * 62 + random.range(-8, 8), y: 2932 + random.range(-6, 6), s: random.range(0.9, 1.4) });
  }
  // Beach umbrellas: shade on the sand, in the city's own colours.
  const umbrellas = [];
  const umbrellaColors = ['#ff2e88', '#ffe14d', '#2ecc71', '#00e5ff', '#ff6b35'];
  for (let i = 0; i < 14; i += 1) {
    const east = i % 2 === 0;
    umbrellas.push({
      x: east ? random.range(2900, 2945) : random.range(60, 2950),
      y: east ? random.range(60, 2950) : random.range(2900, 2945),
      color: umbrellaColors[i % umbrellaColors.length],
    });
  }

  const places = {
    garage: { name: "Mara's Garage", x: 700, y: 700 },
    pier: { name: 'Solmara Pier', x: 2760, y: 3100 },
    port: { name: 'Portside Docks', x: 2760, y: 500 },
    neon: { name: 'Neon Row', x: 1600, y: 1350 },
    strip: { name: 'The Strip', x: 1600, y: 2050 },
    mansion: { name: 'Ferrante Mansion', x: 500, y: 500 },
    market: { name: 'Old Town Market', x: 500, y: 1600 },
    hotel: { name: 'Marina Hotel', x: 2400, y: 2600 },
    arms: { name: 'Solmara Arms', x: 1350, y: 1000 },
    hospital: { name: 'Solmara General', x: 1000, y: 2400 },
    beachHut: { name: 'Lifeguard Hut', x: 2950, y: 2650 },
    taxiStand: { name: 'City Cab Stand', x: 700, y: 880 },
    raceStart: { name: 'Neon Start Line', x: 1600, y: 680 },
  };

  function districtAt(x, y) {
    for (const d of DISTRICTS) {
      if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
    }
    return DISTRICTS[2];
  }

  /** Traffic density where a point stands (1 = average, higher = busier). */
  function trafficFactor(x, y) { return districtAt(x, y).traffic || 1; }

  /** Police presence where a point stands (1 = average). */
  function policeFactor(x, y) { return districtAt(x, y).police || 1; }

  function buildingAt(x, y, r) {
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }

  // Solid for walking and driving: buildings, the sea, and outside the map.
  function isBlocked(x, y, r) {
    if (x < r || y < r || x > CITY_SIZE - r || y > CITY_SIZE - r) return true;
    if (x > 3020 || y > 3020) return true; // the sea
    return buildingAt(x, y, r) !== null;
  }

  /** True on the sand strips along the east and south edges. */
  function isBeach(x, y) {
    return (x >= 2880 && x <= 2960 && y <= 2960) || (y >= 2880 && y <= 2960 && x <= 2960);
  }

  /** True in the sea, past the sand. */
  function isWater(x, y) { return x > 3020 || y > 3020; }

  function onRoad(x, y) {
    const nearH = roadsH.some((ry) => Math.abs(y - ry) <= ROAD_W / 2);
    const nearV = roadsV.some((rx) => Math.abs(x - rx) <= ROAD_W / 2);
    return nearH || nearV;
  }

  /** The nearest road centreline to a point: {axis 'h'|'v', line, dist}. */
  function nearestRoad(x, y) {
    let best = { axis: 'h', line: roadsH[0], dist: Infinity };
    for (const ry of roadsH) {
      const d = Math.abs(y - ry);
      if (d < best.dist) best = { axis: 'h', line: ry, dist: d };
    }
    for (const rx of roadsV) {
      const d = Math.abs(x - rx);
      if (d < best.dist) best = { axis: 'v', line: rx, dist: d };
    }
    return best;
  }

  // The nearest point on a road centreline (traffic and police use it to rejoin).
  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const ry of roadsH) {
      const d = Math.abs(y - ry);
      if (d < bestD) { bestD = d; best = { x, y: ry, axis: 'h', line: ry }; }
    }
    for (const rx of roadsV) {
      const d = Math.abs(x - rx);
      if (d < bestD) { bestD = d; best = { x: rx, y, axis: 'v', line: rx }; }
    }
    return best;
  }

  function randomRoadSpot() {
    const axis = random.chance(0.5) ? 'h' : 'v';
    if (axis === 'h') { const y = random.pick(roadsH); return { x: random.range(100, LAND - 100), y, axis, line: y }; }
    const x = random.pick(roadsV); return { x, y: random.range(100, LAND - 100), axis, line: x };
  }

  /** A random point on a sidewalk (44 px off a road centreline). */
  function randomSidewalkSpot() {
    const axis = random.chance(0.5) ? 'h' : 'v';
    const side = random.chance(0.5) ? 44 : -44;
    if (axis === 'h') { const y = random.pick(roadsH); return { x: random.range(100, LAND - 100), y: y + side }; }
    const x = random.pick(roadsV); return { x: x + side, y: random.range(100, LAND - 100) };
  }

  return {
    size: CITY_SIZE, land: LAND, roadsH, roadsV, buildings, palms, umbrellas, parks, neons, places,
    districtAt, trafficFactor, policeFactor, buildingAt, isBlocked, isBeach, isWater,
    onRoad, nearestRoad, nearestRoadPoint, randomRoadSpot, randomSidewalkSpot,
  };
}
