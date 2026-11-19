// audio.js: every sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, sirens, gunshots, pickups and four procedural radio stations
// (SOL FM synthwave, PALMA 99 latin, NEON NIGHTS electro, VICE 88 midnight chill)
// that the player cycles with Q and mutes with M. Audio starts on the first
// user gesture. Switching stations restarts the sequencer at the new tempo,
// and the music ducks under banners so a mission brief stays readable.
const STATIONS = [
  { name: 'SOL FM', desc: 'Sunset synthwave', bpm: 96, root: 57, scale: [0, 3, 5, 7, 10], wave: 'sawtooth', bass: 'triangle', riff: [0, 2, 4, 2, 3, 4, 1, 0] },
  { name: 'PALMA 99', desc: 'Solmara latin', bpm: 112, root: 55, scale: [0, 2, 4, 7, 9], wave: 'square', bass: 'sine', riff: [0, 1, 2, 4, 2, 1, 0, 2] },
  { name: 'NEON NIGHTS', desc: 'Electro drive', bpm: 122, root: 50, scale: [0, 2, 3, 7, 8], wave: 'sawtooth', bass: 'sawtooth', riff: [0, 3, 2, 4, 3, 1, 2, 0] },
  { name: 'VICE 88', desc: 'Midnight chill', bpm: 84, root: 53, scale: [0, 3, 5, 7, 10], wave: 'sine', bass: 'sine', riff: [0, 2, 1, 3, 2, 0, 1, 0] },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let muted = false;
  let station = 0;
  let musicTimer = null;
  let step = 0;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let ducked = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
      // Engine: a low sawtooth plus a sub sine an octave down; pitch follows speed.
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineSub = ctx.createOscillator(); engineSub.type = 'sine'; engineSub.frequency.value = 28;
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter); engineSub.connect(engineFilter);
      engineFilter.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); engineSub.start();
      // Siren: two-tone wail on an LFO.
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 780;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator(); sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.55;
      const sirenLfoGain = ctx.createGain(); sirenLfoGain.gain.value = 180;
      sirenLfo.connect(sirenLfoGain); sirenLfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start(); sirenLfo.start();
      startMusic();
      return true;
    } catch {
      return false;
    }
  }

  function note(freq, time, dur, type, gain, dest) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g); g.connect(dest || musicGain);
    o.start(time); o.stop(time + dur + 0.05);
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function startMusic() {
    if (musicTimer) return;
    const st = STATIONS[station];
    const stepDur = 60 / st.bpm / 2;
    musicTimer = setInterval(() => {
      if (!ctx || muted) { step += 1; return; }
      const now = ctx.currentTime;
      const bar = Math.floor(step / 8) % 4;
      const s = step % 8;
      // Bass on beats 0 and 4, root or fifth.
      if (s === 0 || s === 4) note(midiToFreq(st.root - 12 + (s === 4 ? 7 : 0)), now, stepDur * 1.8, st.bass, 0.5);
      // Lead riff: a pentatonic walk that changes per bar; each station has its own.
      const degree = st.scale[(st.riff[s] + bar) % st.scale.length];
      if (s % 2 === 0) note(midiToFreq(st.root + 12 + degree), now, stepDur * 0.9, st.wave, 0.12);
      // Hat tick on off-beats.
      if (s % 2 === 1) note(6000 + s * 100, now, 0.03, 'square', 0.03);
      step += 1;
    }, stepDur * 1000);
  }

  function restartMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    step = 0;
    if (ctx) startMusic();
  }

  function blip(freq, dur, type, gain) {
    if (!ensure()) return;
    note(freq, ctx.currentTime, dur, type || 'sine', gain || 0.3, sfxGain);
  }

  function noise(dur, gain, filterFreq) {
    if (!ensure()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
    const g = ctx.createGain(); g.gain.value = gain || 0.4;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start();
  }

  return {
    unlock() { ensure(); },
    stationName() { return STATIONS[station].name; },
    stationDesc() { return STATIONS[station].desc; },
    stationCount() { return STATIONS.length; },
    nextStation() {
      station = (station + 1) % STATIONS.length;
      restartMusic();
      this.jingle();
      return STATIONS[station].name;
    },
    setStation(i) {
      station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
      restartMusic();
      return STATIONS[station].name;
    },
    setMuted(m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    /** Lower the music under a banner or dialogue, restore it after. */
    duck(on) {
      if (!musicGain || ducked === !!on) return;
      ducked = !!on;
      musicGain.gain.setTargetAtTime(on ? 0.06 : 0.16, ctx.currentTime, 0.1);
    },
    setMusicVolume(v) {
      if (musicGain) musicGain.gain.value = Math.max(0, Math.min(0.4, v));
    },
    setEngine(speed01, on) {
      if (!ctx) return;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.08);
      engineSub.frequency.setTargetAtTime(26 + speed01 * 65, ctx.currentTime, 0.08);
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.15);
    },
    shoot(kind) { noise(0.09, kind === 'shotgun' ? 0.6 : 0.35, kind === 'shotgun' ? 900 : 2400); },
    punch() { noise(0.07, 0.3, 700); },
    hit() { blip(180, 0.12, 'square', 0.25); },
    pickup() { blip(660, 0.08, 'sine', 0.3); setTimeout(() => blip(990, 0.12, 'sine', 0.3), 70); },
    cash() { blip(880, 0.07, 'triangle', 0.3); setTimeout(() => blip(1174, 0.1, 'triangle', 0.3), 60); },
    crash() { noise(0.25, 0.5, 500); },
    skid() { noise(0.15, 0.22, 900); },
    explosion() { noise(0.5, 0.8, 300); blip(55, 0.4, 'sine', 0.5); },
    doorSlam() { noise(0.08, 0.4, 400); },
    reload() { blip(1200, 0.04, 'square', 0.2); setTimeout(() => blip(900, 0.05, 'square', 0.2), 90); },
    heal() { blip(523, 0.1, 'sine', 0.25); setTimeout(() => blip(659, 0.1, 'sine', 0.25), 80); setTimeout(() => blip(784, 0.16, 'sine', 0.25), 160); },
    scream() { blip(880, 0.12, 'sawtooth', 0.14); setTimeout(() => blip(620, 0.18, 'sawtooth', 0.14), 110); },
    wantedUp() { blip(440, 0.1, 'square', 0.22); setTimeout(() => blip(660, 0.16, 'square', 0.22), 110); },
    wantedDown() { blip(660, 0.1, 'square', 0.18); setTimeout(() => blip(440, 0.16, 'square', 0.18), 110); },
    jingle() { blip(523, 0.1, 'triangle', 0.3); setTimeout(() => blip(659, 0.1, 'triangle', 0.3), 90); setTimeout(() => blip(784, 0.18, 'triangle', 0.3), 180); },
    fail() { blip(220, 0.25, 'sawtooth', 0.25); setTimeout(() => blip(165, 0.35, 'sawtooth', 0.25), 160); },
    sirenSting() { blip(780, 0.15, 'sine', 0.2); setTimeout(() => blip(620, 0.2, 'sine', 0.2), 140); },
  };
}
