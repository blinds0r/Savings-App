# Porting a visual from the web prototype to Skia

Source of truth for geometry, colours and the chosen animations: the web modules in
`/tmp/claude-0/-home-claude/0725d69e-7f04-55ce-a646-830dfffd6aa3/scratchpad/review/visuals/<key>.js`
(and `.../backgrounds/<key>.js` for the chosen background). The app only needs the CHOSEN options:

| key (skin) | module | idle | add | milestone | background |
|---|---|---|---|---|---|
| glass | pig.js | 2 Content pig | 1 Shake and pour | 1 Glow and fireworks | none |
| crow | crow.js | 2 Admiring | 0 Arc away | 2 Victory caw + crown | backgrounds/crow.js [3] Dusty attic |
| summit | summit.js | 1 Weather and breather | 0 Steady hike | 0 Plant a flag | backgrounds/summit.js [3] Misty valley |
| firefly | firefly.js | 1 Waves | 1 Net catch | 2 Release and spell | none |
| tree | tree.js | 2 Resident bird | 0 Sprout | 2 Fruit | backgrounds/tree.js [2] Garden |
| galaxy | galaxy.js | 1 Shooting stars | 2 Ripple | 2 Nebula and supernova | none |

Match the prototype's look as closely as you can (same shapes, colours, coin style via the heap/coin helpers, same timing). Simplify only where Skia needs it.

## Contract
`src/visuals/contract.ts`. Export `export const DEF: VisualDef` from `src/visuals/<key>/index.tsx` (the placeholder there re-exports the probe; replace it). `box` = the prototype's SVG viewBox. The Scene scales its box into `width x height` with `fitBox` (see `src/visuals/probe/index.tsx` for the whole pattern: clock, addT/msT, playAdd/playMilestone promises, cancel).

## Skia 2.x notes (this project uses @shopify/react-native-skia 2.14 — APIs changed from older versions)
- Paths: `Skia.Path.MakeFromSVGString("M…Z")` for anything that was an SVG path/polyline; build paths with `Skia.PathBuilder.Make()` → `moveTo/lineTo/quadTo/cubicTo/close` → `.build()`. There is no `Skia.Path.Make().moveTo`.
- Components: `Canvas, Group, Rect, RoundedRect, Circle, Oval, Path, Line, Text, Atlas, Picture, LinearGradient, RadialGradient, Shadow, Blur, Mask, Paint`. Gradients go INSIDE the shape as children. `Group` takes `transform`, `clip` (rect/rrect/path), `opacity`, `origin`.
- Transforms are arrays: `[{ translateX }, { translateY }, { scale }, { rotate: radians }]` (rotate is in RADIANS). Use `origin={{x,y}}` on Group to rotate/scale around a point.
- Animation: Reanimated shared values bind straight to Skia props and to `transform` via `useDerivedValue`. Drive everything from three values: `clock` (seconds, advanced by `useFrameCallback`), `addT` and `msT` (0→1 via `withTiming`). Compute positions as pure functions of those; never `setState` per frame.
- Many sprites (coins in a heap, 150 stars, 300 leaves/fireflies): draw them with ONE `<Atlas>` (sprite image via `drawAsImage` or `Skia.Surface`), with `useRSXformBuffer` / `useRectBuffer` producing the per-sprite transforms from the shared values; or, for static heaps, build a `Picture` once with `createPicture` and redraw it only when `state` changes. Never mount hundreds of `<Circle>`s driven by hundreds of derived values.
- Text (summit labels, the jar's tag): `useFont(require("@expo-google-fonts/figtree/500Medium/Figtree_500Medium.ttf"), size)` and `<Text font={font} …>`; render nothing until the font is non-null.
- Blur/glow: `<Blur blur={n}/>` as a child, or draw a soft radial gradient; prefer gradients (cheaper).
- Web (the harness) and native share the same code; keep per-frame work light so cheap Android phones keep 60 fps.

## Background scenes
Implement the chosen background inside the same Scene, behind the subject, when `background === "<name>"` (names: crow "attic", summit "valley", tree "garden"). It is drawn in the same coordinate box, bleeding past the box on all sides (the host shows the page colour outside; set `backgrounds[name].page`). Keep its ambient motion subtle.

## Verify (required before you finish)
```
cd /home/claude/skipped-it
npx tsc --noEmit -p .                                  # must be clean
DIST=dist-<key> npx expo export --platform web --output-dir dist-<key>
mkdir -p shots-<key> && DIST=dist-<key> SHOTS=shots-<key> NODE_PATH=$(npm root -g) node e2e-web.js <skinKey> 0.42
DIST=dist-<key> SHOTS=shots-<key> NODE_PATH=$(npm root -g) node e2e-web.js <skinKey> 1 <bgName>   # over-goal state (pass surplus via pct=1; the harness sets surplus=0 — the 5th argument is surplus dollars, e.g. `… <skinKey> 1 <bgName> 900`)
```
The harness prints `{add:"done", ms:"done", errors:[]}`: both must be "done" (promises resolve) and errors empty. Look at the three PNGs it writes once per run (Read tool) and fix what's visibly wrong; two rounds at most. Then run `npx tsc --noEmit -p .` again.
