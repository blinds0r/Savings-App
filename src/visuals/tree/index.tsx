import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Atlas, Canvas, Circle, Group, Line, LinearGradient, Oval, Path, RadialGradient, Rect, RoundedRect, Skia, Text,
  drawAsImage, rect, useFont, useRSXformBuffer, vec,
} from "@shopify/react-native-skia";
import type { SkFont, SkImage, SkPath } from "@shopify/react-native-skia";
import { Easing, cancelAnimation, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import { fitBox } from "../contract";
import type { VisualState } from "../../model/types";
import { Coin } from "./coin";

/* Money tree: port of visuals/tree.js (idle "Resident bird", add "Sprout", milestone "Fruit", background "Garden"). */
const BOX = { x: 0, y: 0, w: 346, h: 366 };
const DEG = Math.PI / 180;
const N = 300;

/* ---------- data (pure JS, computed once) ---------- */
const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const BLOBS = [[173, 128, 84], [102, 168, 54], [244, 168, 54]];
const SX: number[] = [], SY: number[] = [], SR: number[] = [], SSC: number[] = [];
{
  const rand = seeded(11); let g = 0;
  while (SX.length < N && g < 40000) {
    g++;
    const x = 36 + rand() * 274, y = 34 + rand() * 200;
    if (!BLOBS.some((b) => (x - b[0]) ** 2 + (y - b[1]) ** 2 <= b[2] * b[2])) continue;
    const r = (Math.atan2(y - 215, x - 173) * 180) / Math.PI + 90 + (rand() - 0.5) * 50;
    SX.push(+x.toFixed(1)); SY.push(+y.toFixed(1)); SR.push(Math.round(r)); SSC.push(+(0.85 + rand() * 0.25).toFixed(2));
  }
}
const FMAX = 50, FX: number[] = [], FY: number[] = [], FR: number[] = [];
{
  const rand = seeded(5);
  for (let i = 0; i < FMAX; i++) {
    const side = i % 2 ? 1 : -1, x = 173 + side * (62 + rand() * 95), y = 344 + rand() * 14, r = Math.round(side * (70 + rand() * 40));
    FX.push(+x.toFixed(1)); FY.push(+y.toFixed(1)); FR.push(r);
  }
}
const SPOTS = [[138, 190], [209, 185], [225, 159], [128, 166], [201, 102], [145, 116]];
const FRUIT_AT = [[118, 140], [232, 132], [128, 92], [216, 80], [66, 146], [282, 144], [170, 52]];
const count = (st: VisualState) => (st.pct > 0 ? Math.max(1, Math.round(Math.min(st.pct, 1) * N)) : 0);
const per = (st: VisualState) => st.goal / N;
const fallenCount = (st: VisualState) => (st.surplus > 0 ? Math.min(FMAX, Math.ceil(st.surplus / per(st))) : 0);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ---------- worklet helpers ---------- */
/** Piecewise keyframes with ease-in-out between keys. */
function kf(t: number, ts: number[], vs: number[]): number {
  "worklet";
  if (t <= ts[0]) return vs[0];
  for (let i = 1; i < ts.length; i++) {
    if (t <= ts[i]) {
      const k = (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return vs[i - 1] + (vs[i] - vs[i - 1]) * e;
    }
  }
  return vs[vs.length - 1];
}
/** Keyframes with ease-out between keys. */
function kfo(t: number, ts: number[], vs: number[]): number {
  "worklet";
  if (t <= ts[0]) return vs[0];
  for (let i = 1; i < ts.length; i++) {
    if (t <= ts[i]) {
      const k = (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
      const e = 1 - Math.pow(1 - k, 3);
      return vs[i - 1] + (vs[i] - vs[i - 1]) * e;
    }
  }
  return vs[vs.length - 1];
}
function hash(i: number, seed: number): number {
  "worklet";
  const x = Math.sin(i * 127.1 + seed * 311.7 + 1.3) * 43758.5453;
  return x - Math.floor(x);
}

/* ---------- paths (built lazily so Skia is loaded) ---------- */
const PATHS: Record<string, SkPath> = {};
function P(key: string, svg: string): SkPath {
  if (!PATHS[key]) PATHS[key] = Skia.Path.MakeFromSVGString(svg)!;
  return PATHS[key];
}
const LEAF = "M0 0 C -6.5 -4, -7 -13, 0 -20 C 6 -14, 6 -4.5, 0 0 Z";
const VEIN = "M0 2.5 L0 -18 M0 -6 L-3.8 -9.5 M0 -6 L3.6 -9 M0 -11.5 L-3 -14.5 M0 -11.5 L2.8 -14";
const SPARK = (s: number) => `M0 ${-s} L${s * 0.27} ${-s * 0.27} L${s} 0 L${s * 0.27} ${s * 0.27} L0 ${s} L${-s * 0.27} ${s * 0.27} L${-s} 0 L${-s * 0.27} ${-s * 0.27} Z`;

/* ---------- leaf sprite sheet: 12 variants, the $ counter-rotated by v*30deg so it stays roughly upright ---------- */
const Q = 4, CW = 18 * Q, CH = 24 * Q, AX = 9 * Q, AY = 21 * Q, NV = 12;
const variantOf = (deg: number) => ((Math.round(deg / 30) % NV) + NV) % NV;
function LeafSheet({ font }: { font: SkFont }) {
  const w = font.measureText("$").width;
  return (
    <Group>
      {Array.from({ length: NV }, (_, v) => (
        <Group key={v} transform={[{ translateX: v * CW + AX }, { translateY: AY }, { scale: Q }]}>
          <Path path={P("leaf", LEAF)}>
            <RadialGradient c={vec(0, -7.6)} r={14.4} colors={["#1F7A3E", "#3EA35C", "#93DC9F"]} positions={[0, 0.55, 1]} transform={[{ scaleX: 0.7 }]} origin={vec(0, -7.6)} />
          </Path>
          <Path path={P("leaf", LEAF)} color="#1F6B3A" style="stroke" strokeWidth={0.7} />
          <Path path={P("vein", VEIN)} color="#1F6B3A" style="stroke" strokeWidth={0.55} opacity={0.6} />
          <Group transform={[{ translateY: -8.5 }, { rotate: -v * 30 * DEG }]}>
            <Text font={font} text="$" x={-w / 2} y={2.3} color="#1F6B3A" style="stroke" strokeWidth={0.6} />
            <Text font={font} text="$" x={-w / 2} y={2.3} color="#F3E58A" />
          </Group>
        </Group>
      ))}
    </Group>
  );
}
/* sparkle sheet: two 48x48 cells (gold #E9C440, pale gold #FFF1B8), star drawn at s=5 scaled by Q */
const SQ = 4, SC = 48, SA = 24;
function SparkSheet() {
  return (
    <Group>
      {["#E9C440", "#FFF1B8"].map((c, i) => (
        <Group key={c} transform={[{ translateX: i * SC + SA }, { translateY: SA }, { scale: SQ }]}><Path path={P("spark", SPARK(5))} color={c} /></Group>
      ))}
    </Group>
  );
}

/* keyframe tables */
const U_T = [0, 0.6, 1], U_S = [0, 1.25, 1], U_R = [-35, 6, 0];
const RU_T = [0, 0.25, 0.5, 0.75, 1], RU_V = [0, 14, -12, 9, 0];
const SH_T = [0, 0.3, 0.65, 1], SH_V = [0, 1.3, -1, 0];
const PK_T = [0, 0.25, 0.45, 0.7, 1], PK_V = [0, 28, 0, 28, 0];
const FR_T = [0, 0.12, 0.24], FR_S = [0, 1.2, 1];
const FW_T = [0.12, 0.24, 0.36, 0.47, 0.57, 0.86], FW_V = [0, 11, -8, 5, -2, 0];
const SP_T = [0, 0.6, 1], SP_S = [0, 1.1, 0], SP_D = [0, 1, 1.25];
const D_MS = 4120;
const N_SPARK = 64; // 0..29 add (10 leaves x 3), 30..57 fruit (7 x 4), 58..61 rustle

type AddInfo = { on: boolean; n: number; k: number; dur: number; seed: number };
type MsInfo = { on: boolean; seed: number };
type Rustle = { i: number; t0: number; seed: number };

/* ---------- the bird ---------- */
function Bird({ motion, clock, rustle, nRef }: { motion: boolean; clock: SharedValue<number>; rustle: SharedValue<Rustle>; nRef: React.MutableRefObject<number> }) {
  const hop = useSharedValue({ x0: SPOTS[0][0], y0: SPOTS[0][1], x1: SPOTS[0][0], y1: SPOTS[0][1], midY: 0 });
  const hopT = useSharedValue(1);
  const face = useSharedValue(1), peckT = useSharedValue(0), sx = useSharedValue(1), sy = useSharedValue(1), wing = useSharedValue(0);
  useEffect(() => {
    let live = true, busy = false, at = Math.floor(Math.random() * SPOTS.length), f = SPOTS[at][0] > 173 ? -1 : 1;
    face.value = f;
    hop.value = { x0: SPOTS[at][0], y0: SPOTS[at][1], x1: SPOTS[at][0], y1: SPOTS[at][1], midY: 0 }; hopT.value = 1;
    if (!motion) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wait = (ms: number) => new Promise<void>((res) => { const t = setTimeout(() => { timers.delete(t); res(); }, ms); timers.add(t); });
    const setFace = async (nf: number, dur = 160) => {
      if (nf === f) return;
      face.value = withSequence(withTiming(0.05, { duration: dur / 2 }), withTiming(nf, { duration: dur / 2 }));
      f = nf; await wait(dur);
    };
    const peck = async () => { peckT.value = 0; peckT.value = withTiming(1, { duration: 700, easing: Easing.linear }); await wait(700); };
    const doHop = async () => {
      if (busy || !live) return; busy = true;
      let to = at; while (to === at) to = Math.floor(Math.random() * SPOTS.length);
      const [x0, y0] = SPOTS[at], [x1, y1] = SPOTS[to], dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy), lift = 22 + Math.min(40, dist * 0.25);
      await setFace(dx >= 0 ? 1 : -1); if (!live) return;
      sx.value = withTiming(1.08, { duration: 140 }); sy.value = withTiming(0.86, { duration: 140 }); await wait(140); if (!live) return;
      const dur = 520 + dist * 1.6;
      hop.value = { x0, y0, x1, y1, midY: Math.min(0, dy) - lift }; hopT.value = 0;
      hopT.value = withTiming(1, { duration: dur, easing: Easing.bezier(0.35, 0.1, 0.55, 1) });
      wing.value = withSequence(withTiming(-40, { duration: 140 }), withTiming(18, { duration: 140 }), withTiming(-30, { duration: 140 }), withTiming(0, { duration: 140 }));
      sx.value = withTiming(1, { duration: 120 }); sy.value = withTiming(1, { duration: 120 });
      await wait(dur); if (!live) return;
      at = to;
      sx.value = withSequence(withTiming(1.1, { duration: 112 }), withTiming(0.97, { duration: 112 }), withTiming(1, { duration: 96 }));
      sy.value = withSequence(withTiming(0.85, { duration: 112 }), withTiming(1.04, { duration: 112 }), withTiming(1, { duration: 96 }));
      await wait(320); busy = false;
    };
    const fidget = async () => {
      if (busy || !live) return; busy = true;
      if (Math.random() < 0.5) await setFace(-f, 200); else await peck();
      busy = false;
    };
    const doRustle = () => {
      const n = nRef.current; if (n <= 0) return;
      rustle.value = { i: Math.floor(Math.random() * n), t0: clock.value, seed: Math.random() * 1000 };
    };
    const loop = (min: number, max: number, fn: () => void | Promise<void>) => {
      const go = async () => { await wait(min + Math.random() * (max - min)); if (!live) return; await fn(); if (live) go(); };
      go();
    };
    loop(4000, 8000, doHop);
    loop(2600, 4600, () => { if (Math.random() < 0.6) return fidget(); });
    loop(3500, 6500, doRustle);
    return () => {
      live = false; timers.forEach((t) => clearTimeout(t)); timers.clear();
      [hopT, face, peckT, sx, sy, wing].forEach((v) => cancelAnimation(v));
    };
  }, [motion]);
  const pos = useDerivedValue(() => {
    const h = hop.value, t = hopT.value, dy = h.y1 - h.y0;
    return [{ translateX: h.x0 + (h.x1 - h.x0) * t }, { translateY: h.y0 + dy * t + (h.midY - dy * 0.5) * 4 * t * (1 - t) }];
  });
  const flipT = useDerivedValue(() => [{ scaleX: face.value }]);
  const tiltT = useDerivedValue(() => [{ rotate: kf(peckT.value, PK_T, PK_V) * DEG }, { scaleX: sx.value }, { scaleY: sy.value }]);
  const wingT = useDerivedValue(() => [{ rotate: wing.value * DEG }]);
  return (
    <Group transform={pos}>
      <Group transform={flipT}>
        <Group transform={tiltT} origin={vec(0, 3.15)}>
          <Group transform={[{ scale: 2.1 }]}>
            <Path path={P("tail", "M-5 -6 L-11 -9 L-10 -4 Z")} color="#3B3F4A" />
            <Oval x={-6} y={-9} width={12} height={8} color="#3B3F4A" />
            <Oval x={-2.6} y={-5.6} width={7.2} height={4} color="#C9705A" />
            <Circle cx={5} cy={-9} r={3.1} color="#3B3F4A" />
            <Path path={P("beak", "M7.5 -9.6 L11 -8.6 L7.6 -7.8 Z")} color="#E9A23B" />
            <Group transform={wingT} origin={vec(-2, -6.3)}><Path path={P("wing", "M-4 -6 Q 0 -12 4 -6.5 Z")} color="#555B68" /></Group>
            <Circle cx={5.9} cy={-9.7} r={1.6} color="#FFFFFF" />
            <Circle cx={6.2} cy={-9.7} r={1} color="#14141A" />
            <Circle cx={6.55} cy={-10.1} r={0.38} color="#FFFFFF" />
            <Path path={P("legs", "M-1 -1.2 L-1 1.5 M2 -1.2 L2 1.5")} color="#3B3F4A" style="stroke" strokeWidth={0.8} />
          </Group>
        </Group>
      </Group>
    </Group>
  );
}

/* ---------- one gold coin-fruit (milestone) ---------- */
function Fruit({ i, msT, ms }: { i: number; msT: SharedValue<number>; ms: SharedValue<MsInfo> }) {
  const [bx, by] = FRUIT_AT[i];
  const tr = useDerivedValue(() => {
    const k = ms.value.on ? clamp((msT.value * D_MS - i * 120) / 3400, 0, 1) : 0;
    return [{ translateX: bx }, { translateY: by }, { scale: kf(k, FR_T, FR_S) }, { rotate: kf(k, FW_T, FW_V) * DEG }];
  });
  const op = useDerivedValue(() => {
    if (!ms.value.on) return 0;
    const k = (msT.value * D_MS - i * 120) / 3400;
    return k <= 0 || k >= 1 ? 0 : kf(k, [0.86, 1], [1, 0]);
  });
  return (
    <Group transform={tr} opacity={op}>
      <Line p1={vec(0, 0)} p2={vec(0, 9)} color="#5A3B26" strokeWidth={1.3} />
      <Path path={P("fleaf", "M0 2 C 3 0, 6 1, 7.5 3 C 4 4.2, 2 3.6, 0 2 Z")} color="#3EA35C" />
      <Group transform={[{ translateY: 17 }]}><Coin r={7.5} sq={0.92} /></Group>
    </Group>
  );
}

/* ---------- garden background ---------- */
function Garden({ clock }: { clock: SharedValue<number> }) {
  const paths = useMemo(() => {
    const fence = Skia.PathBuilder.Make();
    for (let x = -500; x <= 846; x += 22) { fence.moveTo(x, 330); fence.lineTo(x, 268); fence.lineTo(x + 7, 258); fence.lineTo(x + 14, 268); fence.lineTo(x + 14, 330); fence.close(); }
    const hedge = Skia.PathBuilder.Make(), q = seeded(5);
    for (let x = -520; x <= 860; x += 34) hedge.addCircle(x, 250 + q() * 10, 28 + q() * 12);
    const blades = Skia.PathBuilder.Make(), r = seeded(9);
    for (let i = 0; i < 70; i++) { const x = -500 + r() * 1346, y = 370 + r() * 200; blades.moveTo(x, y); blades.lineTo(x + 2, y - 7); blades.lineTo(x + 4, y); }
    return { fence: fence.build(), hedge: hedge.build(), blades: blades.build() };
  }, []);
  const glow = useDerivedValue(() => 0.9 + 0.1 * Math.sin(clock.value * 0.6));
  return (
    <Group>
      <Rect x={-500} y={-500} width={1346} height={1400}>
        <LinearGradient start={vec(0, -500)} end={vec(0, 300)} colors={["#B9DCEB", "#D9ECF0", "#F3EEDB"]} positions={[0, 0.7, 1]} />
      </Rect>
      <Circle cx={300} cy={50} r={200} opacity={glow}>
        <RadialGradient c={vec(300, 50)} r={200} colors={["#FFF4C8D9", "#FFF4C800"]} />
      </Circle>
      <Circle cx={300} cy={50} r={22} color="#FFF3C4" opacity={0.9} />
      <Path path={paths.hedge} color="#A9C99A" />
      <Rect x={-500} y={250} width={1346} height={90} color="#A9C99A" />
      <Rect x={-500} y={280} width={1346} height={8} color="#F1EEE6" />
      <Rect x={-500} y={312} width={1346} height={8} color="#F1EEE6" />
      <Path path={paths.fence} color="#F8F5EE" />
      <Rect x={-500} y={330} width={1346} height={570}>
        <LinearGradient start={vec(0, 330)} end={vec(0, 700)} colors={["#A8CF8C", "#85B46A"]} />
      </Rect>
      <Path path={paths.blades} color="#79A65E" style="stroke" strokeWidth={1.2} opacity={0.6} />
    </Group>
  );
}

/* ---------- scene ---------- */
const Scene = forwardRef<SceneHandle, SceneProps>(function TreeScene({ state, width, height, motion, background }, ref) {
  const fit = useMemo(() => fitBox(BOX, width, height), [width, height]);
  const n = count(state), m = fallenCount(state);
  const nRef = useRef(n), stateRef = useRef(state);
  useEffect(() => { nRef.current = n; stateRef.current = state; }, [n, state]);

  const clock = useSharedValue(0);
  useFrameCallback((f) => { clock.value += Math.min(f.timeSincePreviousFrame ?? 0, 100) / 1000; });
  const addT = useSharedValue(0), msT = useSharedValue(0);
  const add = useSharedValue<AddInfo>({ on: false, n: 0, k: 1, dur: 1, seed: 0 });
  const ms = useSharedValue<MsInfo>({ on: false, seed: 0 });
  const rustle = useSharedValue<Rustle>({ i: -1, t0: 0, seed: 0 });

  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => {
      const st = stateRef.current, n0 = count(st);
      let k = clamp(Math.round(amount / per(st)), 1, 10), nn = n0;
      if (n0 >= N) { nn = N - 1; k = 1; } else k = Math.min(k, N - n0);
      const dur = 140 * k + 600;
      add.value = { on: true, n: nn, k, dur, seed: Math.random() * 1000 };
      addT.value = 0;
      addT.value = withTiming(1, { duration: motion ? dur : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    playMilestone: () => new Promise<void>((res) => {
      ms.value = { on: true, seed: Math.random() * 1000 };
      msT.value = 0;
      msT.value = withTiming(1, { duration: motion ? D_MS : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    cancel: () => {
      cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0;
      add.value = { on: false, n: 0, k: 1, dur: 1, seed: 0 }; ms.value = { on: false, seed: 0 };
    },
  }), [motion]);

  /* sprite sheets */
  const font = useFont(require("@expo-google-fonts/figtree/800ExtraBold/Figtree_800ExtraBold.ttf"), 6.4);
  const [leafImg, setLeafImg] = useState<SkImage | null>(null);
  const [sparkImg, setSparkImg] = useState<SkImage | null>(null);
  useEffect(() => {
    if (!font) return;
    let on = true;
    drawAsImage(<LeafSheet font={font} />, { width: NV * CW, height: CH }).then((img) => { if (on) setLeafImg(img); });
    return () => { on = false; };
  }, [font]);
  useEffect(() => {
    let on = true;
    drawAsImage(<SparkSheet />, { width: 2 * SC, height: SC }).then((img) => { if (on) setSparkImg(img); });
    return () => { on = false; };
  }, []);

  /* canopy leaves: every slot has a sprite; unlit slots get scale 0 */
  const leafSprites = useMemo(() => SR.map((r) => rect(variantOf(r) * CW, 0, CW, CH)), []);
  const leafXf = useRSXformBuffer(N, (val, i) => {
    "worklet";
    const t = clock.value;
    const x = SX[i], y = SY[i];
    let rot = SR[i] * DEG, sc = 0;
    if (i < n) sc = SSC[i];
    else {
      const a = add.value;
      if (a.on && i >= a.n && i < a.n + a.k) {
        const tm = addT.value * a.dur - (i - a.n) * 140;
        if (tm > 0) { const k = Math.min(1, tm / 560); sc = SSC[i] * kfo(k, U_T, U_S); rot += kfo(k, U_T, U_R) * DEG; }
      }
    }
    if (sc <= 0) { val.set(0, 0, 0, 0); return; }
    const amp = 2 + ((i * 37) % 4) * 0.6, d = 3500 + ((i * 97) % 2500), dl = (i * 131) % d;
    rot += amp * DEG * Math.sin(((t * 1000 + dl) / d) * Math.PI);
    const ru = rustle.value;
    if (ru.i === i) { const rt = (t - ru.t0) / 0.65; if (rt >= 0 && rt <= 1) rot += kf(rt, RU_T, RU_V) * DEG; }
    const s = sc / Q, c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    val.set(c, sn, x - (c * AX - sn * AY), y - (sn * AX + c * AY));
  });
  /* fallen leaves on the ground (surplus) */
  const fallenSprites = useMemo(() => FR.map((r) => rect(variantOf(r) * CW, 0, CW, CH)), []);
  const fallenXf = useRSXformBuffer(FMAX, (val, j) => {
    "worklet";
    if (j >= m) { val.set(0, 0, 0, 0); return; }
    const s = 0.8 / Q, rot = FR[j] * DEG, c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    val.set(c, sn, FX[j] - (c * AX - sn * AY), FY[j] - (sn * AX + c * AY));
  });
  /* sparkles (add, fruit, rustle) */
  const sparkSprites = useMemo(() => Array.from({ length: N_SPARK }, (_, e) => rect(e >= 30 && e < 58 ? SC : 0, 0, SC, SC)), []);
  const sparkXf = useRSXformBuffer(N_SPARK, (val, e) => {
    "worklet";
    let x = 0, y = 0, tm = -1, seed = 0, spread = 16, size = 3;
    if (e < 30) {
      const a = add.value, j = Math.floor(e / 3);
      if (a.on && j < a.k) { x = SX[a.n + j]; y = SY[a.n + j] - 8; tm = addT.value * a.dur - j * 140; seed = a.seed; spread = 16; size = 3; }
    } else if (e < 58) {
      const i = Math.floor((e - 30) / 4);
      if (ms.value.on) { x = FRUIT_AT[i][0]; y = FRUIT_AT[i][1] + 17; tm = msT.value * D_MS - (i * 120 + 450); seed = ms.value.seed; spread = 16; size = 4; }
    } else {
      const ru = rustle.value;
      if (ru.i >= 0) { x = SX[ru.i]; y = SY[ru.i] - 8; tm = (clock.value - ru.t0) * 1000; seed = ru.seed; spread = 14; size = 3.5; }
    }
    const dur = 700 + hash(e * 4, seed) * 450;
    if (tm <= 0 || tm >= dur) { val.set(0, 0, 0, 0); return; }
    const p = tm / dur, ang = hash(e * 4 + 1, seed) * Math.PI * 2, dist = 10 + hash(e * 4 + 2, seed) * spread, sz = size * (0.6 + hash(e * 4 + 3, seed) * 0.8);
    const s = (sz * kfo(p, SP_T, SP_S)) / (5 * SQ), dd = dist * kfo(p, SP_T, SP_D);
    val.set(s, 0, x + Math.cos(ang) * dd - s * SA, y + Math.sin(ang) * dd - s * SA);
  });

  const canopyT = useDerivedValue(() => {
    const a = add.value;
    if (!a.on) return [{ rotate: 0 }];
    const tm = addT.value * a.dur;
    return [{ rotate: tm < 900 ? kf(tm / 900, SH_T, SH_V) * DEG : 0 }];
  });
  const fitT = useMemo(() => [{ translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.scale }], [fit]);
  const garden = background === "garden";

  return (
    <Canvas style={{ width, height }}>
      <Group transform={fitT}>
        {garden ? <Garden clock={clock} /> : (
          <Group color="#ECE6D2"><Circle cx={173} cy={128} r={94} /><Circle cx={102} cy={168} r={62} /><Circle cx={244} cy={168} r={62} /></Group>
        )}
        <Oval x={93} y={355} width={160} height={10} color={garden ? "rgba(40,70,30,0.25)" : "#E4D6C6"} />
        <Group transform={canopyT} origin={vec(173, 300)}>
          <Path path={P("trunk", "M163 300 C 166 262, 161 232, 168 196 L178 196 C 183 232, 179 262, 183 300 Z")}>
            <LinearGradient start={vec(161, 250)} end={vec(183, 250)} colors={["#4E321F", "#7A5236", "#4A2F1D"]} positions={[0, 0.45, 1]} />
          </Path>
          <Path path={P("barkl", "M169 290 C 170 270, 167 250, 171 226 M176 286 C 175 266, 178 242, 175 214 M172 262 C 173 255, 171 248, 172 240")} color="#3E2817" style="stroke" strokeWidth={0.8} opacity={0.55} />
          <Group style="stroke" strokeCap="round">
            <Path path={P("b1", "M173 216 C 150 202, 126 186, 104 170")} color="#5E3F28" strokeWidth={7} />
            <Path path={P("b2", "M173 208 C 196 196, 222 182, 244 168")} color="#5E3F28" strokeWidth={7} />
            <Path path={P("b3", "M173 200 C 172 170, 176 140, 172 100")} color="#5E3F28" strokeWidth={6} />
            <Path path={P("b4", "M140 196 C 132 178, 124 160, 118 140")} color="#6B4A33" strokeWidth={3.5} />
            <Path path={P("b5", "M212 190 C 222 172, 230 152, 232 132")} color="#6B4A33" strokeWidth={3.5} />
            <Path path={P("b6", "M172 142 C 150 128, 136 112, 128 92")} color="#6B4A33" strokeWidth={3} />
            <Path path={P("b7", "M174 128 C 196 114, 210 98, 216 80")} color="#6B4A33" strokeWidth={3} />
            <Path path={P("b8", "M104 170 C 88 164, 76 156, 66 146")} color="#6B4A33" strokeWidth={3} />
            <Path path={P("b9", "M244 168 C 260 162, 272 154, 282 144")} color="#6B4A33" strokeWidth={3} />
            <Path path={P("b10", "M172 100 C 170 84, 174 66, 170 50")} color="#6B4A33" strokeWidth={2.5} />
          </Group>
          <Atlas image={leafImg} sprites={leafSprites} transforms={leafXf} />
          <Bird motion={motion} clock={clock} rustle={rustle} nRef={nRef} />
        </Group>
        <Oval x={123} y={287.5} width={100} height={9} color="#4A3426" />
        <Path path={P("pot", "M126 304 L220 304 L210 358 L136 358 Z")}>
          <LinearGradient start={vec(126, 330)} end={vec(220, 330)} colors={["#255A5E", "#3B8589", "#22555A"]} positions={[0, 0.4, 1]} />
        </Path>
        <RoundedRect x={120} y={292} width={106} height={14} r={4} color="#3F8488" />
        <Line p1={vec(140, 322)} p2={vec(206, 322)} color="#4E9699" strokeWidth={2} />
        <Atlas image={leafImg} sprites={fallenSprites} transforms={fallenXf} />
        {FRUIT_AT.map((_, i) => <Fruit key={i} i={i} msT={msT} ms={ms} />)}
        <Atlas image={sparkImg} sprites={sparkSprites} transforms={sparkXf} />
      </Group>
    </Canvas>
  );
});

export const DEF: VisualDef = {
  key: "tree",
  box: BOX,
  plain: "#F6EDE4",
  backgrounds: { garden: { name: "Garden", page: "#E3EEDC" } },
  Scene,
};
