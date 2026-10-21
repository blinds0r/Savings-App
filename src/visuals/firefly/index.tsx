import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { Atlas, Canvas, Circle, Group, Oval, Path, RadialGradient, RoundedRect, Rect, Text, useFont, useRectBuffer, useRSXformBuffer, useTexture, vec } from "@shopify/react-native-skia";
import type { SkFont } from "@shopify/react-native-skia";
import { useSharedValue, withTiming, withRepeat, useDerivedValue, Easing, runOnJS, cancelAnimation , ReduceMotion } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import {
  BOX, CAP, JX, MOUTH_X, MOUTH_Y, FREE0, DOT0, TEMP0, SLOT_N, LEVELS, CELL, GLOW, BASE_SCALE, SLOTS, FREE, JIT, SPARK, SPARKS,
  clamp, clamp01, ph, easeInOut, easeOut, frac, lerp, kf, countOf, freeCount, howMany, textDots, spellPos, svgPath, seeded,
} from "./lib";

/* Firefly jar: one firefly per 1/300th of the goal, caught in a glass jar on a night meadow.
   Idle "Waves", add "Net catch", milestone "Release and spell". Every firefly is one sprite of a single Atlas. */

const FIGTREE = require("@expo-google-fonts/figtree/500Medium/Figtree_500Medium.ttf");
const DEG = Math.PI / 180;
const MS_D = 4500;
const GLOW_COLORS = ["#FFFFF4", "#F8FFC2", "rgba(230,245,122,0.55)", "rgba(230,245,122,0)"], GLOW_POS = [0, 0.26, 0.42, 1];

const GRASS_L = svgPath("M0 380 L0 352 Q20 330 26 352 Q34 320 44 350 Q56 334 62 356 L80 380 Z");
const GRASS_R = svgPath("M346 380 L346 346 Q330 322 322 350 Q312 326 300 352 Q290 336 284 358 L270 380 Z");
const JAR = svgPath("M128 86 L128 106 Q88 122 88 172 L88 330 Q88 360 118 360 L228 360 Q258 360 258 330 L258 172 Q258 122 218 106 L218 86 Z");
const HI1 = svgPath("M102 176 Q102 140 128 126"), HI2 = svgPath("M102 196 L102 318");
const LID_LINES = svgPath("M4 -16 H102 M4 -8 H102");
const STRING1 = svgPath("M128 98 Q173 104 218 98"), STRING2 = svgPath("M218 98 Q236 106 240 122");
const TAG = svgPath("M226 122 L262 116 L268 140 L232 146 Z");
const NET_HANDLE = svgPath("M0 0 L-30 26"), NET_MESH = svgPath("M-6 -4 Q6 10 18 -4 M-2 -12 Q6 6 14 -12 M-9 -8 L21 -8");

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const textW = (font: SkFont, t: string) => font.getGlyphWidths(font.getGlyphIDs(t)).reduce((a, b) => a + b, 0);

interface AddParams { k: number; total: number; dx: number[]; dy: number[]; jx: number[] }
interface MsParams { map: number[]; n: number; tx: number[]; ty: number[] }
const NO_ADD: AddParams = { k: 0, total: 1, dx: [], dy: [], jx: [] };
const NO_MS: MsParams = { map: [], n: 1, tx: [], ty: [] };

/** one slot of the atlas at time t (seconds): position, opacity and radius (box units) */
function slotAt(i: number, t: number, addT: number, ap: AddParams, msT: number, mp: MsParams, n: number, m: number) {
  "worklet";
  const j = JIT[i], tms = t * 1000;
  if (i < CAP) {
    const hx = SLOTS[i][0], hy = SLOTS[i][1];
    if (i >= n) {
      // a firefly the net is tipping in
      const idx = i - n;
      if (addT <= 0 || idx >= ap.k) return { x: 0, y: 0, op: 0, r: 7 };
      const ms = addT * ap.total;
      if (addT < 1 && ms < 2500) return { x: 0, y: 0, op: 0, r: 7 };
      const k = easeOut(ph(ms, 2500, 900 + idx * 90)), o = [0, 0.4, 1];
      return { x: kf(k, o, [MOUTH_X, MOUTH_X + ap.jx[idx], hx], false), y: kf(k, o, [MOUTH_Y - 14, MOUTH_Y + 30, hy], false), op: kf(k, o, [0.4, 1, 1], false), r: 7 };
    }
    if (msT > 0 && msT < 1) {
      const pi = mp.map[i];
      if (pi >= 0) { const s = spellPos(clamp01((msT * MS_D - pi * 10) / MS_D), hx, hy, (pi / mp.n) * Math.PI * 2, mp.tx[pi], mp.ty[pi], false); return { x: s.x, y: s.y, op: s.op, r: 7 }; }
    }
    // idle: waves of light travelling up the jar, with a tiny wander
    const u = frac((tms + 4200 - ((360 - hy) / 230) * 1700) / 4200);
    const op = kf(u, [0, 0.3, 0.45, 0.68, 1], [0.22, 0.22, 1, 0.22, 0.22]);
    return { x: hx + 2.5 * Math.sin((t / j.w1) * Math.PI * 2 + j.p1), y: hy + 2.5 * Math.sin((t / j.w2) * Math.PI * 2 + j.p2), op, r: 7 };
  }
  if (i < DOT0) {
    // free fireflies outside the jar (surplus): wander and blink
    const f = i - FREE0;
    if (f >= m) return { x: 0, y: 0, op: 0, r: 5.5 };
    const op = kf(frac(t / j.bd + j.bp), [0, 0.5, 1], [0.3, 1, 0.3]);
    return { x: FREE[f][0] + 11 * Math.sin((t / j.w1) * Math.PI * 2 + j.p1), y: FREE[f][1] + 11 * Math.sin((t / j.w2) * Math.PI * 2 + j.p2), op, r: 5.5 };
  }
  if (i < TEMP0) {
    // glowing dots in the meadow that the net sweeps up
    const d = i - DOT0;
    if (addT <= 0 || addT >= 1 || d >= ap.k) return { x: 0, y: 0, op: 0, r: 6 };
    const ms = addT * ap.total, tc = 300 + 1300 * ((ap.dx[d] - 8 + 40) / 136);
    const op = ms < tc ? ph(ms, 0, 400) : ms < 1600 ? 1 - ph(ms, tc, 220) : 0;
    return { x: ap.dx[d], y: ap.dy[d], op, r: 6 };
  }
  // temporary fireflies that help spell the milestone
  if (msT <= 0 || msT >= 1) return { x: 0, y: 0, op: 0, r: 7 };
  const pi = mp.map[i];
  if (pi < 0) return { x: 0, y: 0, op: 0, r: 7 };
  const s = spellPos(clamp01((msT * MS_D - pi * 10) / MS_D), MOUTH_X, MOUTH_Y + 8, (pi / mp.n) * Math.PI * 2, mp.tx[pi], mp.ty[pi], true);
  return { x: s.x, y: s.y, op: s.op, r: 7 };
}

/* ---------- the net (add "Net catch") ---------- */
function Net({ addT, addP }: { addT: SharedValue<number>; addP: SharedValue<AddParams> }) {
  const pose = useDerivedValue(() => {
    const t = addT.value, ms = t * addP.value.total;
    if (t <= 0 || t >= 1) return { x: -40, y: 346, r: -20, o: 0 };
    if (ms < 300) return { x: -40, y: 346, r: -20, o: 1 };
    if (ms < 1600) { const k = (ms - 300) / 1300; return { x: -40 + k * 136, y: 342 + Math.sin(k * Math.PI * 2) * 7, r: -20 + Math.sin(k * Math.PI * 2) * 6, o: 1 }; }
    if (ms < 2500) { const k = easeInOut((ms - 1600) / 900), u = 1 - k; return { x: u * u * 96 + 2 * u * k * 40 + k * k * 168, y: u * u * 342 + 2 * u * k * 150 + k * k * 58, r: -20 + k * 150, o: 1 }; }
    const k = ph(ms, 2500, 700);
    return { x: 168 + k * 140, y: 58 - k * 70, r: 130 + k * 40, o: 1 - k };
  });
  const tr = useDerivedValue(() => [{ translateX: pose.value.x }, { translateY: pose.value.y }, { rotate: pose.value.r * DEG }]);
  const op = useDerivedValue(() => pose.value.o);
  return (
    <Group transform={tr} opacity={op}>
      <Path path={NET_HANDLE} color="#B59A63" style="stroke" strokeWidth={2.4} strokeCap="round" />
      <Oval x={-9} y={-15} width={30} height={18} color="rgba(233,223,200,0.14)" />
      <Oval x={-9} y={-15} width={30} height={18} color="#D9CBA7" style="stroke" strokeWidth={1.8} />
      <Path path={NET_MESH} color="#D9CBA7" style="stroke" strokeWidth={0.7} opacity={0.7} />
    </Group>
  );
}

/* ---------- milestone sparkles above the jar ---------- */
function Sparkles({ msT }: { msT: SharedValue<number> }) {
  const tr = SPARKS.map((sp) => useDerivedValue(() => {
    const ms = msT.value * MS_D, e = easeOut(ph(ms, MS_D * 0.46, sp.dur));
    const d = kf(e, [0, 0.6, 1], [0, sp.d, sp.d * 1.25], false), sc = kf(e, [0, 0.6, 1], [0, 1.1, 0.2], false);
    return [{ translateX: JX + Math.cos(sp.a) * d }, { translateY: 28 + Math.sin(sp.a) * d }, { scale: msT.value > 0 && msT.value < 1 ? sp.s * sc : 0 }];
  }));
  const op = SPARKS.map((sp) => useDerivedValue(() => { const e = easeOut(ph(msT.value * MS_D, MS_D * 0.46, sp.dur)); return e < 0.6 ? 1 : 1 - (e - 0.6) / 0.4; }));
  return <Group>{SPARKS.map((_, i) => <Path key={i} path={SPARK} color="#F4FF9E" transform={tr[i]} opacity={op[i]} />)}</Group>;
}

const Scene = forwardRef<SceneHandle, SceneProps>(function FireflyScene({ state, width, height, motion }, ref) {
  const pct = clamp01(state.pct || 0), surplus = state.surplus || 0, goal = state.goal || 3000;
  const n = countOf(pct), m = freeCount(surplus, goal);
  const fit = useMemo(() => { const s = Math.min(width / BOX.w, height / BOX.h); return [{ translateX: (width - BOX.w * s) / 2 }, { translateY: (height - BOX.h * s) / 2 }, { scale: s }]; }, [width, height]);
  const clock = useSharedValue(0);
  const addT = useSharedValue(0);
  const msT = useSharedValue(0);
  const addP = useSharedValue<AddParams>(NO_ADD);
  const msP = useSharedValue<MsParams>(NO_MS);
  const f10 = useFont(FIGTREE, 9.5);

  useEffect(() => { clock.value = 0; clock.value = withRepeat(withTiming(3600, { reduceMotion: ReduceMotion.Never,  duration: 3600000, easing: Easing.linear }), -1, false, undefined, ReduceMotion.Never); return () => cancelAnimation(clock); }, []);
  useEffect(() => { cancelAnimation(addT); addT.value = 0; }, [n]);
  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => {
      const k = howMany(goal, amount), r = seeded(Math.floor(Math.random() * 1e6) + 1);
      const dx: number[] = [], dy: number[] = [], jx: number[] = [];
      for (let i = 0; i < k; i++) { dx.push(14 + (k > 1 ? i * (62 / (k - 1)) : 30) + (r() - 0.5) * 6); dy.push(326 + r() * 26); jx.push((r() - 0.5) * 20); }
      const total = 2500 + Math.max(900 + (k - 1) * 90, 900);
      addP.value = { k, total, dx, dy, jx };
      addT.value = 0;
      addT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? total : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    playMilestone: (mpct) => new Promise<void>((res) => {
      const dots = textDots(`${Math.round(mpct)}%`, JX, 16, 8);
      // the top-most fireflies spell the number; temporary ones fill in when the jar holds too few
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => SLOTS[a][1] - SLOTS[b][1]).slice(0, dots.length);
      const map = new Array(SLOT_N).fill(-1);
      order.forEach((slot, pi) => { map[slot] = pi; });
      for (let pi = order.length; pi < dots.length; pi++) map[TEMP0 + (pi - order.length)] = pi;
      msP.value = { map, n: dots.length, tx: dots.map((d) => d[0]), ty: dots.map((d) => d[1]) };
      msT.value = 0;
      msT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? MS_D : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    cancel: () => { cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0; },
  }), [motion, n, goal]);

  // one glow sprite at LEVELS opacities; every firefly is one entry of these buffers
  const glow = useTexture(
    <Group>{Array.from({ length: LEVELS }, (_, i) => (
      <Circle key={i} cx={i * CELL + CELL / 2} cy={CELL / 2} r={GLOW} opacity={(i + 1) / LEVELS}>
        <RadialGradient c={vec(i * CELL + CELL / 2, CELL / 2)} r={GLOW} colors={GLOW_COLORS} positions={GLOW_POS} />
      </Circle>
    ))}</Group>,
    { width: CELL * LEVELS, height: CELL },
  );
  const xforms = useRSXformBuffer(SLOT_N, (xf, i) => {
    "worklet";
    const s = slotAt(i, clock.value, addT.value, addP.value, msT.value, msP.value, n, m);
    const sc = Math.round(s.op * LEVELS) <= 0 ? 0 : BASE_SCALE * (s.r / 7);
    xf.set(sc, 0, s.x - sc * (CELL / 2), s.y - sc * (CELL / 2));
  });
  const sprites = useRectBuffer(SLOT_N, (r, i) => {
    "worklet";
    const s = slotAt(i, clock.value, addT.value, addP.value, msT.value, msP.value, n, m);
    const lvl = clamp(Math.round(s.op * LEVELS), 1, LEVELS);
    r.setXYWH((lvl - 1) * CELL, 0, CELL, CELL);
  });

  const haloBase = 0.06 + 0.9 * pct;
  const haloO = useDerivedValue(() => {
    const a = addT.value > 0 && addT.value < 1 ? 0.3 * Math.sin(Math.PI * ph(addT.value * addP.value.total, 2700, 700)) : 0;
    const b = msT.value > 0 && msT.value < 1 ? 0.35 * Math.sin(Math.PI * msT.value) : 0;
    return Math.min(1, haloBase + a + b);
  });
  const jarStroke = useDerivedValue(() => { const a = addT.value > 0 && addT.value < 1 ? 0.25 * Math.sin(Math.PI * ph(addT.value * addP.value.total, 2700, 700)) : 0; return 0.75 + a; });
  const lidT = useDerivedValue(() => [{ translateX: 120 }, { translateY: 88 }, { rotate: (msT.value > 0 && msT.value < 1 ? kf(msT.value, [0, 0.07, 0.9, 1], [0, -48, -48, 0]) : 0) * DEG }]);
  const tagText = fmt(goal), tagW = f10 ? textW(f10, tagText) : 0;

  return (
    <Canvas style={{ width, height }}>
      <Group transform={fit}>
        <Rect x={-500} y={-500} width={1346} height={1400} color="#0D1330" />
        <Circle cx={173} cy={220} r={140} opacity={haloO}>
          <RadialGradient c={vec(173, 220)} r={140} colors={["rgba(230,245,122,0.55)", "rgba(230,245,122,0)"]} positions={[0, 0.68]} />
        </Circle>
        <Path path={GRASS_L} color="#081026" /><Path path={GRASS_R} color="#081026" />
        <Oval x={61} y={356} width={224} height={16} color="#060B1F" />
        <Path path={JAR} color="rgba(159,179,232,0.07)" />
        <Path path={JAR} color="#9FB3E8" style="stroke" strokeWidth={2.5} opacity={jarStroke} />
        <Path path={HI1} color="rgba(255,255,255,0.22)" style="stroke" strokeWidth={5} strokeCap="round" />
        <Path path={HI2} color="rgba(255,255,255,0.16)" style="stroke" strokeWidth={5} strokeCap="round" />
        <Group transform={lidT}>
          <RoundedRect x={0} y={-22} width={106} height={22} r={5} color="#6B5A3E" />
          <Path path={LID_LINES} color="#8C7752" style="stroke" strokeWidth={1.5} />
        </Group>
        <Path path={STRING1} color="#B59A63" style="stroke" strokeWidth={2.5} /><Path path={STRING2} color="#B59A63" style="stroke" strokeWidth={1.5} />
        <Path path={TAG} color="#E9DFC8" /><Circle cx={232} cy={128} r={2} color="#0D1330" />
        {f10 && <Group transform={[{ rotate: -9 * DEG }]} origin={vec(249, 132)}><Text x={249 - tagW / 2} y={135} text={tagText} font={f10} color="#2A2416" /></Group>}
        {/* one Atlas for every firefly: inside, free (surplus), net dots and the milestone's helpers. Above the lid so the spelled number stays readable while it is open. */}
        <Atlas image={glow} sprites={sprites} transforms={xforms} />
        <Net addT={addT} addP={addP} />
        <Sparkles msT={msT} />
      </Group>
    </Canvas>
  );
});

export const DEF: VisualDef = { key: "firefly", box: BOX, plain: "#0D1330", backgrounds: {}, Scene };
