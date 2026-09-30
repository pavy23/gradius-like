# NOVA LANCER — stage authoring guide

NOVA LANCER is a browser side-scrolling shooter (256x224 logical pixels, 60 Hz fixed step, Canvas 2D,
plain JavaScript, **no build step, no modules**). Every file is a *classic* `<script>`; top-level
`const`/`class` declarations are visible to all later scripts. All art and sound is generated in code.

```
js/core.js        constants (W=256,H=224), math helpers, makeRng, Store, Input
js/font.js        PixFont (5x7 and 3x5 bitmap fonts)
js/sprites.js     PAL palette, Sprites (def/painted/recolor/draw), Painter
js/art.js         shared sprites: ship, shots, capsule, explosions, generic enemies
js/terrain.js     Terrain.build(def)  (mask-based solid scenery + skins)
js/background.js  Backgrounds.make([...layers])
js/audio.js       Sound.sfx(name)      js/music.js  Music.play(name)
js/player.js      Player class (weapons, power meter, options, shield)
js/game.js        G (game object), StageBuilder, MODES, HUD
js/enemies.js     ENEMIES registry: spinner wave diver bug turret walker hatch rocket
js/bosses.js      ENEMIES.bigcore ("Guardian Core", stages 1-5 boss) — the reference boss
js/stages/stageN.js   one file per stage (self-contained; see stage1.js as the reference)
js/debug.js       G.lint(stageIndex), G.gallery(prefix)
```

## 1. Game rules you are designing for

* The camera scrolls automatically. Touching **terrain or any enemy body** kills the player instantly
  (one hit = death). Enemy bullets kill too. Death = lose *all* upgrades and restart at the last
  checkpoint (Gradius-style "recovery" difficulty).
* Power meter: capsules (dropped by enemies with `carry:true`, drawn red/orange) advance a highlight over
  `SPEED UP, MISSILE, DOUBLE, LASER, OPTION, ?(shield)`; pressing POWER activates the highlighted slot.
  Up to 4 options. A basic un-upgraded ship must still be able to clear the stage with skill.
* Stage = scripted list of events keyed by **camera x** (world pixels scrolled so far, `G.camX`). The
  camera stops at the boss. Screen space is 256x224; world x of a screen x is `G.camX + x`.

## 2. Stage definition (`STAGES.push({...})`)

```js
STAGES.push({
  id: 3, name: 'MOAI', sub: 'ISLE OF STONE GIANTS',   // shown on the intro card
  music: 'stage3', bossMusic: 'boss',                  // see "Sound"
  scroll: 0.6,                                         // px per frame (0.5-0.9 is comfortable)
  scrollMap: [[1500, 0.9], [2200, 0.6]],               // optional: [camX, speed] changes
  bossX: 3600,                                         // camX where the boss sequence starts (scroll stops)
  checkpoints: [0, 900, 1800, 2700, 3400],             // camX values; last one <= bossX - 150
  terrain: () => ({ length, floor:[...], ceil:[...], shapes(g,T){}, decorate(g,T){}, skin:{...} }),
  background: () => Backgrounds.make([...]),
  script(S) { ...events... },
  onReset(G) {},   // optional: called after every (re)start at a checkpoint
});
```

Rules: total playtime to the boss trigger 80-110 s (`bossX / scroll / 60`). `terrain.length` must be
at least `bossX + W + 100`. The boss arena (`bossX .. bossX+W`) needs a corridor >= 140 px with flat,
harmless terrain. Checkpoints must be in open space (the player respawns at x=44,y=112 with a 2.5 s
invulnerability, but terrain still kills).

### Stage script (`S` = StageBuilder)

```js
S.wave(x, 'type', {n:5, gap:12, y:64, dy:0, carry:'last', ...opts})  // n flying enemies from the right edge
S.ground(wx, 'type', {...opts})   // stands on the floor at WORLD x (spawned when it is about to scroll in)
S.ceil(wx, 'type', {...opts})     // hangs from the ceiling at world x
S.fixed(wx, y, 'type', {...})     // anchored to the world (moves with terrain) at screen y, no snapping
S.at(x, () => {...})              // run any code when the camera reaches x (G.spawn, G.camTarget = ..., ...)
S.boss(bossX, 'bigcore', {level:3})   // must appear exactly once, at st.bossX
S.banner(x, ['LINE1','LINE2'])
```
`carry`: `'last' | 'first' | 'all' | index` → those members drop a power capsule when killed.
`each:(i)=>({y:..., phase:...})` gives per-member overrides. All other opts arrive as `e.o` in `init`.

## 3. Enemies (`ENEMIES.name = {...}`)

```js
ENEMIES.s3_thing = {
  w: 12, h: 12, hp: 2, score: 200,      // hit box (centered on e.x,e.y), hit points, score
  spr: 's3_thing' | (e) => name,        // sprite name; animation: fps = frames per anim step, else e.frame
  fps: 6, expl: 's'|'m'|'l'|'xl',       // explosion size on death
  attach: 'floor'|'ceil',               // default anchoring for terrain enemies
  sink: 1,                              // px the sprite is pushed into the terrain
  invuln: false,                        // deflects every shot (acts as a moving solid obstacle)
  harmless: false, ghost: false,        // harmless: no contact damage; ghost: not hit by shots
  keep: false,                          // true = never culled off-screen (bosses)
  init(e, o) {}, update(e) {}, draw(e, ctx) {}, onDeath(e) {}, onHurt(e, dmg) {},
};
```
* `e` fields: `x,y` (screen center), `vx,vy` (engine adds them after `update` for free fliers), `t` (age in
  frames), `hp`, `carry`, `o` (spawn opts), `flipX/flipY`, `flash` (hit flash frames), `dead`.
* Terrain-anchored enemies (`e.attach`) **move by changing `e.wx`** (world x); the engine sets
  `e.x = e.wx - G.camX` after `update`. To turn one into a free flier set `e.attach = null` (see `rocket`).
* HP is scaled by difficulty/loop automatically. Spawn positions may be off-screen; culling happens far
  outside the screen.
* Multi-part enemies (bosses, big stone heads, tentacles): `e.parts = [{name, ox, oy, w, h, hp, max,
  vuln, solid, harmless, expl, score}]` — offsets are relative to `e.x,e.y`, tested in list order (put the
  front-most part first). A part with `vuln:false` absorbs and deflects shots; `solid:false` lets shots pass.
  Callbacks: `onPartHurt(e,p,dmg)`, `onPartDeath(e,p)`. The enemy itself only dies when *you* call
  `G.kill(e)` (usually from `onPartDeath`).

### Game helpers you may call

```js
G.spawn(type, {x,y,vx,vy,carry,hp,attach,wx,...})    G.later(frames, fn)      // delayed action
G.ebullet(x, y, vx, vy, {spr:'ebullet', w:3, h:3, hp:0, ax, ay, solid:true, anim:6, life, custom:(b)=>{}, quiet})
   // vx/vy are BASE speeds: difficulty/rank scale them. hp>0 makes the bullet shootable (rings, mines).
G.aim(x, y, speed, spread) -> [vx, vy]      G.fan(x,y,n,spread,speed,opts)     G.radial(x,y,n,speed,phase,opts)
G.canFire(e)    // false when the shooter is off-screen or the player is dead — ALWAYS check before shooting
G.fireDelay(baseFrames)                     // scales shooting interval by difficulty/rank
G.explode(x,y,'s'|'m'|'l'|'xl',{quiet})     G.spark(x,y)     G.debris(x,y,n)     G.dropCapsule(x,y)
G.hurt(e,dmg)  G.kill(e)  G.addScore(n)     G.showBanner(['TEXT'])
G.player (x,y,alive,...)  G.camX  G.camSpeed  G.camTarget  G.terrain  G.frame  G.loop  G.diff
G.terrain.solid(worldX,y) .rect(worldX,y,w,h) .floorTop(worldX) .ceilBottom(worldX)
sfx('name', params)     // safe sound wrapper; see "Sound"
```
Enemy bullets die on terrain (`solid:false` to pass through). Player shots die on terrain.

### Bosses

A boss is an enemy def with `keep:true` spawned by `S.boss(bossX, 'type', opts)`. Sequence handled by the
engine: scroll stops, WARNING banner, boss music, spawn at `x = W+60,y = 112` (your `init` moves it in), fight,
then on `G.bossDefeated(e)` all other enemies/bullets are wiped, an explosion chain plays and the next stage
starts. Requirements:

* `onDeath(e){ G.bossDefeated(e); }` and `silentDeath:true` (the engine already plays the chain).
  To keep the wreck visible during the chain push a `fx` of kind `'fn'` (see `bosses.js` `drawWreck`).
* `gauge(e) -> 0..1` remaining health for the HUD bar.
* Attacks must stop when `!G.player.alive`; use `G.canFire`. Provide 2-3 distinct attack patterns and a
  clear vulnerable window. Fight length for a basic ship ~35-60 s, for a fully powered ship ~15-25 s.
* `S.boss(bossX, 'bigcore', {level:1..5})` reuses the Guardian Core (palettes/HP/attacks per level).
* Mid-bosses are ordinary high-HP enemies (`expl:'l'`, `dropCapsule` on death) that do not stop the scroll.

## 4. Terrain (`terrain: () => def`)

```js
{ length: 4200,
  floor: [ {type:'flat',x0,x1,h}, {type:'slope',x0,x1,h0,h1}, {type:'hill',x,w,h,shape:'round'|'tri'|'mesa'|'cos',top},
           {type:'volcano',x,w,h,crater:{w,d}}, {type:'noise',x0,x1,base,amp,scale,seed,edge},
           {type:'steps',x0,x1,h0,dh,stepW}, {type:'pillar',x,w,h}, {type:'fn',x0,x1,fn:(x)=>h} ],
  ceil:  [ ...same, heights measured from the top... ],
  shapes(g, T) { g.fillRect(...); g.beginPath(); ...; g.fill(); },   // extra solid shapes (mask canvas, world coords)
  decorate(g, T) { ...paint on the skinned terrain canvas (world coords), e.g. trees, glows... },
  skin: { kind:'rock'|'brick'|'metal'|'organic'|'cell', pal:[5 css colours dark->light], outline, hi, hi2, lo, seed, ...} }
```
* Features combine with `max` (add `mode:'add'` to add instead). Heights are px; `floorTop(x)` returns the
  y of the floor surface, `ceilBottom(x)` the y of the ceiling surface.
* Keep the free corridor (`floorTop - ceilBottom`) >= 96 px everywhere the player must pass (tighter only for
  short, clearly readable squeezes >= 84 px). Keep floors >= 26 px high so they are not hidden by the HUD
  bar (bottom 14 px) and readable.
* Skin options — `rock`: `crack`, `crackGlow`, `cracks`, `speckle`, `contrast`; `brick`: `bw`,`bh`,`mortar`;
  `metal`: `bw`,`bh`,`light`; `organic`: `vein`; `cell`: `cells`,`membrane`,`nucleus`,`nr`. `TILES` in terrain.js
  shows how tiles are generated; you may register a new kind: `Terrain.TILES.mykind = (sk, rng) => ({w,h,data:Uint32Array})`
  (ABGR little-endian packed colours; `Terrain.rgb32('#rrggbb')`).
* Outline/highlight is applied automatically to every edge (top edges get `hi`, left `hi2`, bottom/right `lo`).

## 5. Backgrounds (`Backgrounds.make([...])`, drawn back to front)

`{kind:'gradient', stops:[[0,'#..'],[1,'#..']], steps:16}` dithered sky ·
`{kind:'stars', n, speed, drift, ymin, ymax, colors, big, seed}` ·
`{kind:'ridge', color, color2, edge, hMin, hMax, speed, seed, jag, top:false, y}` (top:true hangs from the ceiling) ·
`{kind:'clouds', n, speed, y0, y1, colors:[light,mid,dark], seed, period}` ·
`{kind:'strip', build:(period)=>canvas, speed, y, period}` (your own tiling art) ·
`{kind:'custom', draw(ctx, camX, t){}}` (animated things). `speed` is the parallax factor of camX, `drift`
keeps layers moving while the camera is stopped (boss fights).

## 6. Sprites

```js
Sprites.def('s3_head', ['..kk..', '.kWWk.', ...]);                 // text pixel map ('.' transparent); rows must have equal width
Sprites.def('s3_x', [frame0Rows, frame1Rows]);                    // animation
Sprites.painted('s3_y', w, h, nFrames, (d, f) => { d.circle(..); d.poly([[x,y],...],'W'); d.outline('k'); });
Sprites.recolor('src', 'dst', {b:'r', B:'R'});                    // palette swap
Sprites.draw(ctx, name, cx, cy, {frame, flipX, flipY, flash});    // centered; Sprites.drawTL(...) top-left
```
Painter `d`: `px rect hline vline line circle ring ellipse poly dither rows outline mirrorV erase` — colours are palette
letters or `'#rrggbb'`. Palette letters (PAL in sprites.js): `k` outline-black `w` white `W` light `g` mid `G` dark `d` very dark,
`r R` red, `o O` orange, `y Y` yellow, `l n N` lime/green/dark green, `c C` cyan, `b B` blue, `v V` violet,
`p P` pink, `t T` tan/brown, `s S` sand, `e` deep purple, `m M` maroon, `h` pale yellow, `x X` steel.

Art rules: **original designs only** (no copying of existing games' sprites). Style: 1 px dark outline (`k`),
3-tone shading with light from the top-left, saturated accent colour for the thing that is dangerous/shootable,
enemies clearly distinct from the terrain and from the player's white/blue ship. Bullets that hurt must read
instantly (bright orange/pink/white cores). Sizes: small enemies 10-16 px, mid 20-32 px, bosses 48-110 px.
Prefix **every** new sprite / enemy / global helper with your stage prefix (`s3_`) to avoid name clashes.
Wrap your file in an IIFE. Do not edit shared files (`art.js`, `game.js`, ...): if you find an engine bug,
work around it and describe it in your final report.

## 7. Sound

`sfx('name')` names: `shot laser missile hit deflect explodeS explodeM explodeL explodeXL playerDeath capsule power
shieldHit shieldBreak enemyShot ring eruption warning coreOpen coreClose bossLaser select start extend pause
unpause tentacle cellPop electric stomp warp`. Music tracks: `stage1..stage7`, `boss`, `bossFinal`,
`title`, `clear`, `gameover`, `ending` (set `music`/`bossMusic` in the stage def; the final boss uses
`bossMusic:'bossFinal'`).

## 8. Difficulty & pacing checklist

* First ~5 s of a stage and the first 5 s after every checkpoint must be harmless (respawn is at x=44).
* Waves: 3-8 members, one idea per wave (line, sine, U-turn, dive). Leave escape lanes: never a screen-wide
  unavoidable bullet wall. Base bullet speed 1.2-1.8 px/frame, aimed shots per shooter no more often than
  every ~90 frames (use `G.fireDelay(base)`), <= ~8 enemy bullets visible at once in normal play.
* Capsule carriers: >= 8 per stage, none more than ~600 px apart, and 2-3 in the last 400 px before the boss
  so a player who respawns at the last checkpoint can rebuild. `S.wave(..., {carry:'last'})` is the usual way.
* Vary the rhythm: calm terrain-navigation sections and dense enemy sections alternate; one signature
  mechanic per stage that is introduced safely, then combined.
* The stage must be beatable without upgrades and comfortable with them; the boss must have a readable
  pattern and a punishing-but-fair tempo.

## 9. Testing tools (in the session scratchpad; copy them, don't edit the shared originals)

`SP=/tmp/claude-0/-home-user-gradius-like/f6e45177-51ba-5a36-bde5-8a08ec06bd25/scratchpad`

* `node $SP/make_harness.js N` writes `$SP/stageN/index.html` that loads the engine plus **only** your
  `js/stages/stageN.js` (isolated from other authors' unfinished files) and prints its URL.
  Then `export GAME_URL=file://$SP/stageN/index.html`.
* `node $SP/lint.js 1` dry-runs your stage (`G.lint(0)`) and lists design problems. It must print no ISSUE lines.
* `node $SP/play.js "autostart=1&god=1&stage=1" "600,600,600" myprefix` fast-forwards with a simple bot
  (`god=1` = invulnerable, `nobot` suffix e.g. `"60:nobot"` disables the bot) and saves a screenshot after
  each chunk of frames to `$SP/shots/myprefix_K.png` (view them with the Read tool!). Frame 0 is the start of the
  stage intro (130 frames); the stage starts at frame ~130; `camX` advances `scroll` px/frame.
  Query params: `manual=1` (always added), `autostart=1`, `stage=N` (1-based **index within the registered
  stages**, so with the isolated harness it is always `1`), `god=1`, `debug=1`, `diff=easy|normal|hard`.
* `node $SP/trace.js "autostart=1&stage=1" 9000 300` runs a survival bot without god mode and prints a timeline
  (deaths, respawns, score, boss phase) — useful to see whether fights end.
* In the page: `G.step()` advances one frame (call `G.render()` before a screenshot); `G.camX = 3000` teleports
  the camera (call `G.resetWorld(3000)` to also rebuild what is on screen); `G.spawn(...)`; `G.boss`;
  `G.player.speedLv = 5; G.player.missile = true; ...` to test with upgrades.
  `Input.setVirtual('fire', true)` presses keys.
* Always look at screenshots of every section, of every enemy type, and of each boss phase. Check that
  nothing overlaps the HUD unreadably, hitboxes match sprites, and the stage reads well at 1x scale.
