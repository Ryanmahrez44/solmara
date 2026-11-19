// random.js: a small seeded generator (mulberry32) so the city, traffic and every
// staged screenshot are deterministic for a given seed. Every helper below draws
// from the same stream, so a fixed seed still reproduces the same city —
// shuffle a list, weight a pick, or roll a bell curve, and the seed still holds.
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) { return min + this.next() * (max - min); },
    int(min, max) { return Math.floor(this.range(min, max + 1)); },
    pick(list) { return list[Math.floor(this.next() * list.length)]; },
    chance(p) { return this.next() < p; },
    sign() { return this.next() < 0.5 ? -1 : 1; },
    // Fisher–Yates over a copy; the input list is never mutated.
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.next() * (i + 1));
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }
      return out;
    },
    // Pick one entry of [[value, weight], ...] by weight.
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) total += w;
      let roll = this.next() * total;
      for (const [value, w] of entries) {
        roll -= w;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    // Roughly normal value around `mean` with spread `spread`, clamped to range.
    gauss(mean, spread, min, max) {
      const v = mean + ((this.next() + this.next() + this.next()) / 3 - 0.5) * 2 * spread;
      return Math.max(min, Math.min(max, v));
    },
  };
}

// A stable seed from any short string (a district name, a mission id): FNV-1a.
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A short id for runtime entities that never need to be stable across runs.
export function uid(prefix) {
  return `${prefix || 'id'}-${Math.floor(Math.random() * 36 ** 6).toString(36)}`;
}
