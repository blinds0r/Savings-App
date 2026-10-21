import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Atlas, Canvas, Circle, Group, Line, LinearGradient, Oval, Path, RadialGradient, Rect, Skia,
  drawAsImage, rect, useColorBuffer, useRSXformBuffer, vec,
} from "@shopify/react-native-skia";
import type { SkImage, SkPath } from "@shopify/react-native-skia";
import { Easing, cancelAnimation, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withTiming , ReduceMotion } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import { fitBox } from "../contract";
import type { VisualState } from "../../model/types";

/* Galaxy: port of visuals/galaxy.js (idle "Shooting stars", add "Ripple", milestone "Nebula and supernova"). */
const BOX = { x: 0, y: 0, w: 346, h: 260 };
const DEG = Math.PI / 180;
const N = 150, ND = 260, NF = 40, NSAT = 60;
const TILT = -12.6 * DEG, SQUASH = 0.55;

/* ---------- data (same seeded sequence as the prototype) ---------- */
const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const STX: number[] = [], STY: number[] = [], STR: number[] = [], STS: number[] = [], STG: number[] = []; // glow kind: 0 warm, 1 pink, 2 violet
const DX: number[] = [], DY: number[] = [], DR: number[] = [], DA: number[] = [];
const FX: number[] = [], FY: number[] = [], FR: number[] = [], FA: number[] = [];
{
  const rand = seeded(23);
  for (let i = 0; i < N; i++) {
    const arm = i % 2, k = Math.floor(i / 2) / 74;
    const th = 0.6 + k * Math.PI * 2.6 + arm * Math.PI + (rand() - 0.5) * 0.35;
    const r = 8 + Math.pow(k, 0.9) * 150 + (rand() - 0.5) * (6 + 20 * k);
    const core = k < 0.12;
    STX.push(r * Math.cos(th)); STY.push(r * Math.sin(th)); STR.push(Math.abs(r)); STS.push(1 + rand() * 1.2 + (core ? 0.6 : 0)); STG.push(core ? 0 : arm ? 1 : 2);
  }
  for (let i = 0; i < ND; i++) {
    const arm = i % 2, k = rand();
    const th = 0.6 + k * Math.PI * 2.6 + arm * Math.PI + (rand() - 0.5) * 0.7;
    const r = 6 + Math.pow(k, 0.9) * 154 + (rand() - 0.5) * (10 + 30 * k);
    DX.push(r * Math.cos(th)); DY.push(r * Math.sin(th)); DR.push(0.5 + rand() * 0.5); DA.push(0.22 + rand() * 0.35);
  }
  for (let i = 0; i < 120; i++) { rand(); rand(); rand(); rand(); } // dust2 (unused by the chosen idle) keeps the sequence aligned
  for (let i = 0; i < NF; i++) { FX.push(rand() * 340); FY.push(rand() * 254); FR.push(0.5 + rand() * 0.4); FA.push(0.15 + rand() * 0.35); }
}
const count = (st: VisualState) => (st.pct > 0 ? Math.max(1, Math.round(Math.min(st.pct, 1) * N)) : 0);
const per = (st: VisualState) => st.goal / N;
function clamp(v: number, a: number, b: number) { "worklet"; return Math.max(a, Math.min(b, v)); }

/* ---------- worklet helpers ---------- */
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

const PATHS: Record<string, SkPath> = {};
function P(key: string, svg: string): SkPath {
  if (!PATHS[key]) PATHS[key] = Skia.Path.MakeFromSVGString(svg)!;
  return PATHS[key];
}
const SPARK = (s: number) => `M0 ${-s} L${s * 0.27} ${-s * 0.27} L${s} 0 L${s * 0.27} ${s * 0.27} L0 ${s} L${-s * 0.27} ${s * 0.27} L${-s} 0 L${-s * 0.27} ${-s * 0.27} Z`;

/* ---------- sprite sheet (Q = 10 px per unit for stars, 4 for sparkles) ----------
   cells: 0 dust (24) | 1 dim star (24) | 2-4 lit star warm/pink/violet (72) | 5 field star (24) | 6-7 sparkle warm/pink (48) | 8 twinkle (72) */
const Q = 10, SQ = 4;
const CELLS = [
  { x: 0, w: 24 }, { x: 24, w: 24 }, { x: 48, w: 72 }, { x: 120, w: 72 }, { x: 192, w: 72 },
  { x: 264, w: 24 }, { x: 288, w: 48 }, { x: 336, w: 48 }, { x: 384, w: 72 },
];
const SHEET_W = 456, SHEET_H = 72;
const cellRect = (c: number) => rect(CELLS[c].x, 0, CELLS[c].w, CELLS[c].w);
const GLOWS: [string, number][] = [["#FFD9A8", 0.8], ["#FF9EC7", 0.7], ["#B9A8FF", 0.75]];
const withA = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
function Sheet() {
  return (
    <Group>
      <Circle cx={12} cy={12} r={10} color="#B9A8FF" />
      <Circle cx={36} cy={12} r={8.5} color="#4A4482" />
      {GLOWS.map(([c, a], j) => (
        <Group key={c} transform={[{ translateX: CELLS[2 + j].x + 36 }, { translateY: 36 }]}>
          <Circle cx={0} cy={0} r={34}><RadialGradient c={vec(0, 0)} r={34} colors={[withA(c, a), withA(c, 0)]} /></Circle>
          <Circle cx={0} cy={0} r={10} color="#FBF8FF" />
        </Group>
      ))}
      <Circle cx={CELLS[5].x + 12} cy={12} r={7} color="#F3EEFF" />
      {["#FFE7C2", "#FFC7DD"].map((c, j) => (
        <Group key={c} transform={[{ translateX: CELLS[6 + j].x + 24 }, { translateY: 24 }, { scale: SQ }]}><Path path={P("spark", SPARK(5))} color={c} /></Group>
      ))}
      <Group transform={[{ translateX: CELLS[8].x + 36 }, { translateY: 36 }]}>
        <Circle cx={0} cy={0} r={34}><RadialGradient c={vec(0, 0)} r={34} colors={[withA("#B9A8FF", 0.75), withA("#B9A8FF", 0)]} /></Circle>
        <Circle cx={0} cy={0} r={11} color="#FFFFFF" />
      </Group>
    </Group>
  );
}

/* timings */
const D_ADD = 1950, D_MS = 3400, SN0 = 950; // supernova starts at the nebula's peak
const IG_T = [0, 0.45, 1], IG_S = [0, 2.6, 1], IG_A = [0, 1, 1];
const NB_T = [0, 0.35, 0.6, 1], NB_S = [0.3, 1.05, 1.1, 1.15], NB_O = [0, 0.9, 0.9, 0];
const FL_T = [0, 0.35, 1], FL_S = [0.2, 1.8, 2.4], FL_O = [1, 0.55, 0];
const SP_T = [0, 0.6, 1], SP_S = [0, 1.1, 0], SP_D = [0, 1, 1.25];
const TW_T = [0, 0.15, 0.3], TW_S = [0, 1.5, 1];
const N_FX = 50; // 0..13 warm sparkles, 14..23 pink sparkles, 24..49 twinkles
const NEBULA: [number, number, number, number, number, string, string][] = [
  [150, 120, 130, 55, -12, "#9C7BFF99", "#6B4FD82E"], [205, 140, 110, 45, 8, "#FF7FB68C", "#D9488C29"], [175, 128, 160, 70, -20, "#5FC8E073", "#3A8FB81F"],
];

type AddInfo = { on: boolean; n: number; k: number; maxR: number; seed: number };
type MsInfo = { on: boolean; seed: number };
type Shoot = { x0: number; y0: number; ang: number; len: number; t0: number };

/* ---------- nebula cloud (milestone) ---------- */
function Nebula({ i, msT, ms }: { i: number; msT: SharedValue<number>; ms: SharedValue<MsInfo> }) {
  const [x, y, rx, ry, a, c0, c1] = NEBULA[i];
  const k = useDerivedValue(() => (ms.value.on ? clamp((msT.value * D_MS - i * 120) / 3000, 0, 1) : 0));
  const tr = useDerivedValue(() => [{ translateX: x }, { translateY: y }, { rotate: a * DEG }, { scale: kf(k.value, NB_T, NB_S) }]);
  const op = useDerivedValue(() => (ms.value.on && k.value > 0 && k.value < 1 ? kf(k.value, NB_T, NB_O) : 0));
  return (
    <Group transform={tr} opacity={op}>
      <Oval x={-rx} y={-ry} width={2 * rx} height={2 * ry}>
        <RadialGradient c={vec(0, 0)} r={rx} colors={[c0, c1, c1.slice(0, 7) + "00"]} positions={[0, 0.6, 1]} transform={[{ scaleY: ry / rx }]} origin={vec(0, 0)} />
      </Oval>
    </Group>
  );
}
/* shock ring with a constant stroke width: an ellipse in the tilted (not squashed) frame */
function Shock({ msT, ms, color, w, delay, rMax }: { msT: SharedValue<number>; ms: SharedValue<MsInfo>; color: string; w: number; delay: number; rMax: number }) {
  const k = useDerivedValue(() => { const t = (msT.value * D_MS - SN0 - delay) / 1500; return ms.value.on && t > 0 && t < 1 ? 1 - Math.pow(1 - t, 2.4) : -1; });
  const rr = useDerivedValue(() => { const r = k.value < 0 ? 0 : 16 + (rMax - 16) * k.value; return rect(-r, -r * SQUASH, 2 * r, 2 * r * SQUASH); });
  const op = useDerivedValue(() => (k.value < 0 ? 0 : 0.95 * (1 - k.value)));
  return <Oval rect={rr} color={color} style="stroke" strokeWidth={w} opacity={op} />;
}

/* ---------- scene ---------- */
const Scene = forwardRef<SceneHandle, SceneProps>(function GalaxyScene({ state, width, height, motion }, ref) {
  const fit = useMemo(() => fitBox(BOX, width, height), [width, height]);
  const n = count(state), pct = Math.min(state.pct, 1);
  const stateRef = useRef(state); useEffect(() => { stateRef.current = state; }, [state]);

  const clock = useSharedValue(0);
  useFrameCallback((f) => { clock.value += Math.min(f.timeSincePreviousFrame ?? 0, 100) / 1000; });
  const addT = useSharedValue(0), msT = useSharedValue(0);
  const add = useSharedValue<AddInfo>({ on: false, n: 0, k: 0, maxR: 60, seed: 0 });
  const ms = useSharedValue<MsInfo>({ on: false, seed: 0 });
  const shoot = useSharedValue<Shoot>({ x0: 0, y0: 0, ang: 0, len: 0, t0: -10 });

  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => {
      const st = stateRef.current, n0 = count(st), k = Math.max(0, Math.min(clamp(Math.round(amount / per(st)), 1, 10), N - n0));
      let maxR = 60; for (let i = n0; i < n0 + k; i++) maxR = Math.max(maxR, STR[i]);
      add.value = { on: true, n: n0, k, maxR: maxR + 25, seed: Math.random() * 1000 };
      addT.value = 0;
      addT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? D_ADD : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    playMilestone: () => new Promise<void>((res) => {
      ms.value = { on: true, seed: Math.random() * 1000 };
      msT.value = 0;
      msT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? D_MS : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    cancel: () => {
      cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0;
      add.value = { on: false, n: 0, k: 0, maxR: 60, seed: 0 }; ms.value = { on: false, seed: 0 };
    },
  }), [motion]);

  /* shooting stars: a JS timer picks the next streak, the clock drives it */
  useEffect(() => {
    if (!motion) return;
    let live = true, t: ReturnType<typeof setTimeout> | null = null;
    const go = (ms: number) => { t = setTimeout(() => {
      if (!live) return;
      shoot.value = { x0: 30 + Math.random() * 200, y0: 8 + Math.random() * 70, ang: (18 + Math.random() * 28) * DEG, len: 110 + Math.random() * 90, t0: clock.value };
      go(2200 + Math.random() * 2300);
    }, ms); };
    go(700);
    return () => { live = false; if (t) clearTimeout(t); };
  }, [motion]);

  /* sprite sheet */
  const [img, setImg] = useState<SkImage | null>(null);
  useEffect(() => {
    let on = true;
    drawAsImage(<Sheet />, { width: SHEET_W, height: SHEET_H }).then((im) => { if (on) setImg(im); });
    return () => { on = false; };
  }, []);

  /* spiral: 260 dust + 150 lit stars + 150 dim stars in one atlas */
  const spinSprites = useMemo(() => [
    ...Array.from({ length: ND }, () => cellRect(0)),
    ...STG.map((g) => cellRect(2 + g)),
    ...Array.from({ length: N }, () => cellRect(1)),
  ], []);
  const spinXf = useRSXformBuffer(ND + 2 * N, (val, i) => {
    "worklet";
    if (i < ND) { const s = DR[i] / Q; val.set(s, 0, DX[i] - s * 12, DY[i] - s * 12); return; }
    const lit = i < ND + N, j = lit ? i - ND : i - ND - N;
    let s = STS[j] / Q, ignited = j < n;
    if (!ignited) {
      const a = add.value;
      if (a.on && j >= a.n && j < a.n + a.k) {
        const kk = clamp(1 - Math.sqrt(Math.max(0, 1 - (STR[j] - 4) / (a.maxR - 4))), 0, 1), tm = addT.value * D_ADD - kk * 1500;
        if (tm > 0) { ignited = true; if (lit) s *= kfo(Math.min(1, tm / 560), IG_T, IG_S); }
      }
    }
    if (lit !== ignited) { val.set(0, 0, 0, 0); return; }
    const half = lit ? 36 : 12;
    val.set(s, 0, STX[j] - s * half, STY[j] - s * half);
  });
  const spinCol = useColorBuffer(ND + 2 * N, (c, i) => {
    "worklet";
    c[0] = 1; c[1] = 1; c[2] = 1;
    if (i < ND) { c[3] = DA[i]; return; }
    if (i >= ND + N) { c[3] = 1; return; }
    const j = i - ND, t = clock.value, d = 2400 + ((j * 97) % 2000), dl = (j * 131) % d;
    let a = 0.775 + 0.225 * Math.sin(((t * 1000 + dl) / d) * Math.PI);
    if (j >= n) {
      const ad = add.value;
      const kk = clamp(1 - Math.sqrt(Math.max(0, 1 - (STR[j] - 4) / (ad.maxR - 4))), 0, 1), tm = addT.value * D_ADD - kk * 1500;
      a *= ad.on ? kfo(Math.min(1, Math.max(0, tm) / 560), IG_T, IG_A) : 0;
    }
    c[3] = a;
  });
  const spinT = useDerivedValue(() => [{ rotate: (clock.value * Math.PI * 2) / 150 }]);

  /* background field */
  const fieldSprites = useMemo(() => Array.from({ length: NF }, () => cellRect(5)), []);
  const fieldXf = useRSXformBuffer(NF, (val, i) => { "worklet"; const s = FR[i] / 7; val.set(s, 0, FX[i] - s * 12, FY[i] - s * 12); });
  const fieldCol = useColorBuffer(NF, (c, i) => {
    "worklet";
    c[0] = 1; c[1] = 1; c[2] = 1;
    if (i % 3) { c[3] = FA[i]; return; }
    const d = 1400 + ((i * 211) % 1800), dl = (i * 97) % d;
    c[3] = 0.5 + 0.4 * Math.sin(((clock.value * 1000 + dl) / d) * Math.PI);
  });

  /* satellite galaxy (surplus) */
  const ratio = clamp(state.surplus / state.goal, 0, 1);
  const satN = state.surplus > 0 ? Math.min(NSAT, Math.ceil(state.surplus / per(state))) : 0;
  const sat = useMemo(() => {
    const rand = seeded(41), xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < NSAT; i++) {
      const arm = i % 2, k = Math.floor(i / 2) / 29, th = 0.4 + k * Math.PI * 2.2 + arm * Math.PI + (rand() - 0.5) * 0.4, r = 3 + k * (18 + 22 * ratio);
      xs.push(r * Math.cos(th)); ys.push(r * Math.sin(th));
    }
    return { xs, ys };
  }, [ratio]);
  const satSprites = useMemo(() => Array.from({ length: NSAT }, () => cellRect(2)), []);
  const satXf = useRSXformBuffer(NSAT, (val, i) => {
    "worklet";
    if (i >= satN) { val.set(0, 0, 0, 0); return; }
    const s = 4 / 34;
    val.set(s, 0, sat.xs[i] - s * 36, sat.ys[i] - s * 36);
  });
  const satT = useDerivedValue(() => [{ rotate: (-clock.value * Math.PI * 2) / 60 }]);

  /* milestone sparkles + twinkles */
  const fxSprites = useMemo(() => Array.from({ length: N_FX }, (_, e) => cellRect(e < 14 ? 6 : e < 24 ? 7 : 8)), []);
  const fxXf = useRSXformBuffer(N_FX, (val, e) => {
    "worklet";
    const m = ms.value;
    if (!m.on) { val.set(0, 0, 0, 0); return; }
    const tm = msT.value * D_MS;
    if (e < 24) {
      const warm = e < 14, start = warm ? SN0 : 0, spread = warm ? 120 : 90, size = warm ? 5 : 4;
      const dur = 700 + hash(e * 4, m.seed) * 450, t = tm - start;
      if (t <= 0 || t >= dur) { val.set(0, 0, 0, 0); return; }
      const p = t / dur, ang = hash(e * 4 + 1, m.seed) * Math.PI * 2, dist = 10 + hash(e * 4 + 2, m.seed) * spread, sz = size * (0.6 + hash(e * 4 + 3, m.seed) * 0.8);
      const s = (sz * kfo(p, SP_T, SP_S)) / (5 * SQ), dd = dist * kfo(p, SP_T, SP_D);
      val.set(s, 0, 173 + Math.cos(ang) * dd - s * 24, 130 + Math.sin(ang) * dd - s * 24);
      return;
    }
    const x = 10 + hash(e * 4, m.seed) * 326, y = 8 + hash(e * 4 + 1, m.seed) * 244, t = tm - (300 + hash(e * 4 + 2, m.seed) * 800);
    if (t <= 0 || t >= 2300) { val.set(0, 0, 0, 0); return; }
    const s = kfo(t / 2300, TW_T, TW_S) / Q;
    val.set(s, 0, x - s * 36, y - s * 36);
  });
  const fxCol = useColorBuffer(N_FX, (c, e) => {
    "worklet";
    c[0] = 1; c[1] = 1; c[2] = 1; c[3] = 1;
    if (e < 24 || !ms.value.on) return;
    const t = msT.value * D_MS - (300 + hash(e * 4 + 2, ms.value.seed) * 800), p = t / 2300;
    c[3] = p <= 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) / 0.7);
  });

  /* core, ripple ring, supernova flash + veil */
  const cr = 25 + 95 * pct;
  const coreT = useDerivedValue(() => { const t = (msT.value * D_MS - SN0) / 1500; return [{ scale: ms.value.on && t > 0 && t < 1 ? kfo(t, [0, 0.3, 1], [1, 1.5, 1]) : 1 }]; });
  const rippleK = useDerivedValue(() => { const t = (addT.value * D_ADD) / 1500; return add.value.on && t > 0 && t < 1 ? 1 - Math.pow(1 - t, 2) : -1; });
  const rippleR = useDerivedValue(() => (rippleK.value < 0 ? 0 : 4 + (add.value.maxR - 4) * rippleK.value));
  const rippleO1 = useDerivedValue(() => (rippleK.value < 0 ? 0 : 0.9 * (1 - rippleK.value * 0.8)));
  const rippleO2 = useDerivedValue(() => (rippleK.value < 0 ? 0 : 0.25 * (1 - rippleK.value)));
  const flashK = useDerivedValue(() => { const t = (msT.value * D_MS - SN0) / 1000; return ms.value.on && t > 0 && t < 1 ? t : -1; });
  const flashT = useDerivedValue(() => [{ scale: flashK.value < 0 ? 0 : kfo(flashK.value, FL_T, FL_S) }]);
  const flashO = useDerivedValue(() => (flashK.value < 0 ? 0 : kfo(flashK.value, FL_T, FL_O)));
  const veilO = useDerivedValue(() => { const t = (msT.value * D_MS - SN0) / 600; return ms.value.on && t > 0 && t < 1 ? kf(t, [0, 0.2, 1], [0, 0.3, 0]) : 0; });
  /* shooting star */
  const shootT = useDerivedValue(() => { const s = shoot.value; return [{ translateX: s.x0 }, { translateY: s.y0 }, { rotate: s.ang }]; });
  const shootP = useDerivedValue(() => (clock.value - shoot.value.t0) / 0.9);
  const shootIn = useDerivedValue(() => { const p = clamp(shootP.value, 0, 1); return [{ translateX: shoot.value.len * p * p }]; });
  const shootO = useDerivedValue(() => { const p = shootP.value; return p <= 0 || p >= 1 ? 0 : kf(p, [0, 0.15, 1], [0, 1, 0]); });

  const fitT = useMemo(() => [{ translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.scale }], [fit]);
  const tiltT = useMemo(() => [{ translateX: 173 }, { translateY: 130 }, { rotate: TILT }, { scaleY: SQUASH }], []);
  const satOuter = useMemo(() => [{ translateX: 298 }, { translateY: 214 }, { rotate: -20 * DEG }, { scaleY: 0.5 }], []);

  return (
    <Canvas style={{ width, height }}>
      <Group transform={fitT}>
        <Rect x={-500} y={-500} width={1346} height={1260} color="#0B0A1A" />
        <Atlas image={img} sprites={fieldSprites} transforms={fieldXf} colors={fieldCol} colorBlendMode="modulate" />
        {NEBULA.map((_, i) => <Nebula key={i} i={i} msT={msT} ms={ms} />)}
        <Group transform={tiltT}>
          <Group transform={coreT}>
            <Circle cx={0} cy={0} r={cr} opacity={0.45 + 0.55 * pct}>
              <RadialGradient c={vec(0, 0)} r={cr} colors={["#FFE2BAF2", "#FF9EC759", "#B9A8FF1F", "#B9A8FF00"]} positions={[0, 0.35, 0.6, 0.72]} />
            </Circle>
          </Group>
          <Group transform={spinT}>
            <Atlas image={img} sprites={spinSprites} transforms={spinXf} colors={spinCol} colorBlendMode="modulate" />
          </Group>
          <Circle cx={0} cy={0} r={rippleR} color="#FF9EC7" style="stroke" strokeWidth={6} opacity={rippleO2} />
          <Circle cx={0} cy={0} r={rippleR} color="#FFD9A8" style="stroke" strokeWidth={2.4} opacity={rippleO1} />
          <Group transform={flashT}><Circle cx={0} cy={0} r={30} color="#FFF6E6" opacity={flashO} /></Group>
        </Group>
        <Group transform={[{ translateX: 173 }, { translateY: 130 }, { rotate: TILT }]}>
          <Shock msT={msT} ms={ms} color="#FFD9A8" w={3} delay={0} rMax={170} />
          <Shock msT={msT} ms={ms} color="#FF9EC7" w={2} delay={200} rMax={150} />
        </Group>
        {satN > 0 ? (
          <Group transform={satOuter}>
            <Circle cx={0} cy={0} r={8 + 22 * ratio} opacity={0.85}>
              <RadialGradient c={vec(0, 0)} r={8 + 22 * ratio} colors={["#FFE2BAF2", "#FF9EC759", "#B9A8FF1F", "#B9A8FF00"]} positions={[0, 0.35, 0.6, 0.72]} />
            </Circle>
            <Group transform={satT}><Atlas image={img} sprites={satSprites} transforms={satXf} /></Group>
          </Group>
        ) : null}
        <Rect x={0} y={0} width={346} height={260} color="#FFFFFF" opacity={veilO} />
        <Atlas image={img} sprites={fxSprites} transforms={fxXf} colors={fxCol} colorBlendMode="modulate" />
        <Group transform={shootT} opacity={shootO}>
          <Group transform={shootIn}>
            <Line p1={vec(-46, 0)} p2={vec(0, 0)} strokeWidth={1.6} strokeCap="round">
              <LinearGradient start={vec(-46, 0)} end={vec(0, 0)} colors={["#FFFFFF00", "#FFFFFF"]} />
            </Line>
            <Circle cx={0} cy={0} r={1.7} color="#FFFFFF" />
          </Group>
        </Group>
      </Group>
    </Canvas>
  );
});

export const DEF: VisualDef = { key: "galaxy", box: BOX, plain: "#0B0A1A", backgrounds: {}, Scene };
