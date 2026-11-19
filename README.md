# SOLMARA — Streets of the Sun

A 2D top-down open-world crime game in the spirit of GTA 1/2, built for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01). 100% original
assets — no commercial GTA content. Playable offline in desktop Chrome, no
build step, no network loads.

## Play

Open `game/index.html` in a desktop browser, or serve the folder:

```sh
npx serve .
```

- **Move** — WASD / arrows
- **Enter / exit car** — E
- **Punch / shoot** — Space / mouse
- **Switch weapon** — C
- **Pause** — P / Esc

## The game

You are **Dario Cruz**, new in the city of **Solmara** — 7 districts from Marina
Bay to Neon Row. On foot or behind the wheel, carjack traffic, outrun the
police, and climb the wanted ladder from 0 to 5 stars.

- **6 story missions** with par times, clean bonuses, and boss encounters
- **Side work**: taxi fares, street races, 12 hidden packages, gun shop, hospital
- **Combat**: fists, P9 Pistol, VK-9 SMG, M12 Scattergun
- **Police**: patrol, chase, roadblocks, busted / wasted
- **Systems**: stamina, health regen, wanted heat, day phases (dawn / day /
  dusk / night), full HUD + minimap, 4 procedural radio stations, localStorage
  saves, autosave

## Tech

- Plain HTML/CSS/JS, no dependencies, no build step
- `main.ts` builds the submission dossier (`out/dossier.json`)
- `vendor/makefun-game.ts` is the make.fun kit file, copied unchanged

## Version

v1.1.0 — revision pass: ~42% of lines rewritten across all 18 files, 2 bugs
fixed (bust fine never deducted money; race double-finish guard).
