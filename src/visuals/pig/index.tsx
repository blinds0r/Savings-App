/* Glass pig: a translucent pig holding a heap of realistic coins (port of the prototype's visuals/pig.js).
 * Chosen options: idle "Content pig", add "Shake and pour", milestone "Glow and fireworks". */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Atlas, Canvas, Circle, Group, LinearGradient, Oval, Path, Picture, RadialGradient, Rect, RoundedRect, Skia, PaintStyle, StrokeCap, createPicture, useColorBuffer, useRSXformBuffer, vec, type SkCanvas, type SkPicture, type SkRect } from "@shopify/react-native-skia";
import { cancelAnimation, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withTiming, Easing, type SharedValue , ReduceMotion } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import { fitBox } from "../contract";
import type { VisualState } from "../../model/types";
import { bezier, clamp, cycleAt, ease, easeInOut, easeOut, hash, intervals, kf, rad, seeded } from "../shared/anim";
import { coinKey, coinPicture, drawCoin, drawStar, goldOrSilver, heap, heapPicture, type Coin } from "../shared/coins";
import { hide, makeSheet, place, type Sheet } from "../shared/sprites";

const BOX = { x: 0, y: -40, w: 346, h: 286 };
const PLAIN = "#E2EEE7";

/* ---------- heap geometry (identical to the prototype) ---------- */
const inside = (x: number, y: number) => ((x - 168) / 108) ** 2 + ((y - 128) / 70) ** 2 <= 1;
const heapOf = (n: number) => heap(n, { seed: 17, r: 9, left: 60, right: 276, bottom: 199, top: 56, inside });
const CAP = heapOf(100000).length;
const countOf = (s: VisualState) => (s.pct > 0 ? Math.max(1, Math.round(Math.min(s.pct, 1) * CAP)) : 0);
const perCoin = (s: VisualState) => s.goal / CAP;
const kFor = (s: VisualState, amount: number) => clamp(Math.round(amount / perCoin(s)), 1, 8);
function newCoins(s: VisualState, k: number): Coin[] {
  const n = countOf(s), have = new Set(heapOf(n).map(coinKey));
  const fresh = heapOf(Math.min(n + k, CAP)).filter((c) => !have.has(coinKey(c))).sort((a, b) => b.y - a.y);
  while (fresh.length < k) fresh.push({ x: 140 + Math.random() * 56, y: 56 + Math.random() * 8, r: 9, sq: 0.5, rot: (Math.random() - 0.5) * 40 });
  return fresh.slice(0, k);
}

/* ---------- idle schedules ("every a..b s" as fixed irregular cycles) ---------- */
const SWEEP = intervals(1, 7, 5.5, 8), TWK = intervals(2, 9, 1.4, 2.6), TAIL = intervals(3, 7, 2.2, 4.8), EAR = intervals(4, 7, 3, 6.5), BLINK = intervals(5, 7, 3.2, 6);

/* ---------- add timing (ms) ---------- */
const A_START = 220, A_GAP = 85, A_FLY = 560, A_LAND = 360, A_SQ = 460;
const addDurFor = (k: number) => A_START + (k - 1) * A_GAP + A_FLY + A_LAND + A_SQ;

/* ---------- milestone timing (ms) and the pre-rolled randomness ---------- */
const MS_DUR = 2700;
const FW_DELAY = [120, 480, 860, 1180], FW_X0 = [60, 290, 170, 110], FW_Y0 = [150, 150, 60, 160], FW_X1 = [70, 270, 172, 120], FW_Y1 = [-6, -14, -26, 14];
const PAL = ["#FFD34E", "#FFF6D2", "#FFFFFF", "#FF7AA8", "#6EE0B5"];
const FW_COL = [[0, 1, 2], [3, 2, 0], [4, 2, 0], [0, 3, 4]];
const R = seeded(99);
const FWA: number[] = [], FWD: number[] = [];
for (let f = 0; f < 4; f++) for (let j = 0; j < 18; j++) { const n = 16 + (f % 2) * 2; FWA.push((j / n) * 360 + R() * 10); FWD.push(34 + R() * 22); }
const LSA: number[] = [], LSD: number[] = [], LSS: number[] = [], LST: number[] = [];
for (let i = 0; i < 24; i++) { LSA.push(R() * Math.PI * 2); LSD.push(10 + R() * 12); LSS.push(0.6 + R() * 0.8); LST.push(700 + R() * 450); }
const MSA: number[] = [], MSD: number[] = [], MSS: number[] = [], MST: number[] = [];
for (let i = 0; i < 14; i++) { MSA.push(R() * Math.PI * 2); MSD.push(10 + R() * 120); MSS.push(0.6 + R() * 0.8); MST.push(700 + R() * 450); }
const CFX: number[] = [], CFR: number[] = [], CFS: number[] = [], CFDL: number[] = [], CFT: number[] = [];
for (let i = 0; i < 22; i++) { CFX.push(20 + R() * 306); CFR.push((R() - 0.5) * 60); CFS.push(360 + R() * 540); CFDL.push(R() * 500); CFT.push(1500 + R() * 700); }

/* Atlas slot layout */
const S_TW = 0, S_LS = 2, S_FC = 26, S_FW = 34, S_MS = 114, S_CF = 128, N_FX = 150;
/* Sprite cells */
const SP_TW = 0, SP_LS = 1, SP_MS = 2, SP_FLASH = 3, SP_RISE = 4, SP_PART = 5, SP_CFG = 10, SP_CFS = 11, SP_FLY = 12;
function spriteFor(i: number) {
  if (i < S_LS) return SP_TW;
  if (i < S_FC) return SP_LS;
  if (i < S_FW) return SP_FLY;
  if (i < S_MS) { const f = Math.floor((i - S_FW) / 20), j = (i - S_FW) % 20; return j === 0 ? SP_RISE : j === 1 ? SP_FLASH : SP_PART + FW_COL[f][(j - 2) % 3]; }
  if (i < S_CF) return SP_MS;
  return (i - S_CF) % 5 === 2 ? SP_CFS : SP_CFG;
}

const HIDDEN: [number, number, number, number, number] = [0, 0, 0, 0, 0];
/** Where sprite i is right now: [x, y, scale, rotation(rad), alpha]; scale 0 = hidden. */
function fxAt(i: number, t: number, addMs: number, msMs: number, k: number, tgt: number[], twk: number[]): [number, number, number, number, number] {
  "worklet";
  if (i < S_LS) {
    const ev = cycleAt(t, 1.0, TWK.list, TWK.total);
    if (ev.i < 0 || ev.i % 2 !== i || ev.local > 0.7) return HIDDEN;
    const m = twk.length / 2;
    if (m === 0) return HIDDEN;
    const ci = hash(ev.i, 11) % m, e = easeInOut(ev.local / 0.7);
    return [twk[ci * 2], twk[ci * 2 + 1], kf(e, [0, 0.5, 1], [0, 1.2, 0]), rad(kf(e, [0, 0.5, 1], [0, 45, 90])), 1];
  }
  if (i < S_FC) {
    const q = i - S_LS, c = Math.floor(q / 3);
    if (c >= k) return HIDDEN;
    const p = (addMs - (A_START + c * A_GAP + A_FLY + A_LAND)) / LST[q];
    if (p < 0 || p > 1) return HIDDEN;
    const e = easeOut(p), d = kf(e, [0, 0.6, 1], [0, LSD[q], LSD[q] * 1.25]);
    return [tgt[c * 2] + Math.cos(LSA[q]) * d, tgt[c * 2 + 1] - 4 + Math.sin(LSA[q]) * d, kf(e, [0, 0.6, 1], [0, 1.1, 0.2]) * LSS[q], 0, kf(e, [0, 0.6, 1], [1, 1, 0])];
  }
  if (i < S_FW) {
    const c = i - S_FC;
    if (c >= k) return HIDDEN;
    const p = (addMs - (A_START + c * A_GAP)) / A_FLY;
    if (p < 0 || p > 1) return HIDDEN;
    const e = bezier(0.3, 0.1, 0.6, 1, p), o = [0, 0.3, 0.68, 1];
    return [kf(e, o, [380, 300, 214, 166]), kf(e, o, [-40, -62, -28, 48]), 1, rad(kf(e, o, [0, 180, 380, 540])), 1];
  }
  if (i < S_MS) {
    const f = Math.floor((i - S_FW) / 20), j = (i - S_FW) % 20, d = FW_DELAY[f];
    if (j === 0) {
      const p = (msMs - d) / 420;
      if (p < 0 || p > 1) return HIDDEN;
      const e = bezier(0.2, 0.7, 0.4, 1, p);
      return [FW_X0[f] + (FW_X1[f] - FW_X0[f]) * e, FW_Y0[f] + (FW_Y1[f] - FW_Y0[f]) * e, 1, 0, 1];
    }
    if (j === 1) {
      const p = (msMs - d - 420) / 280;
      if (p < 0 || p > 1) return HIDDEN;
      const e = easeOut(p);
      return [FW_X1[f], FW_Y1[f], 0.4 + 1.8 * e, 0, 0.9 * (1 - e)];
    }
    const q = j - 2, n = 16 + (f % 2) * 2;
    if (q >= n) return HIDDEN;
    const p = (msMs - d - 420) / 950;
    if (p < 0 || p > 1) return HIDDEN;
    const e = bezier(0.15, 0.8, 0.4, 1, p), g = bezier(0.5, 0, 1, 1, p) * 16, a = rad(FWA[f * 18 + q]), D = FWD[f * 18 + q];
    const tx = kf(e, [0, 0.35, 1], [0, D * 0.8, D]);
    return [FW_X1[f] + Math.cos(a) * tx, FW_Y1[f] + Math.sin(a) * tx + g, kf(e, [0, 0.35, 1], [0.5, 1, 0.35]), a, kf(e, [0, 0.35, 1], [1, 1, 0])];
  }
  if (i < S_CF) {
    const q = i - S_MS, p = msMs / MST[q];
    if (p < 0 || p > 1) return HIDDEN;
    const e = easeOut(p), d = kf(e, [0, 0.6, 1], [0, MSD[q], MSD[q] * 1.25]);
    return [168 + Math.cos(MSA[q]) * d, 120 + Math.sin(MSA[q]) * d, kf(e, [0, 0.6, 1], [0, 1.1, 0.2]) * MSS[q], 0, kf(e, [0, 0.6, 1], [1, 1, 0])];
  }
  const q = i - S_CF, p = (msMs - CFDL[q]) / CFT[q];
  if (p < 0 || p > 1) return HIDDEN;
  const e = bezier(0.4, 0.1, 0.7, 1, p);
  return [CFX[q] + CFR[q] * e, -44 + 280 * e, 1, rad(CFS[q] * e), 1 - 0.8 * e];
}

/* ---------- static Skia objects (built once the component mounts, i.e. after Skia is loaded) ---------- */
function useStatics() {
  return useMemo(() => {
    const P = (d: string) => Skia.Path.MakeFromSVGString(d)!;
    const sheet = makeSheet([
      { w: 12, h: 12, draw: (c) => drawStar(c, 4.5, "#FFFFFF") },
      { w: 10, h: 10, draw: (c) => drawStar(c, 3.5, "#FFF6D2") },
      { w: 16, h: 16, draw: (c) => drawStar(c, 6, "#FFFFFF") },
      { w: 20, h: 20, draw: (c) => { const p = Skia.Paint(); p.setAntiAlias(true); p.setColor(Skia.Color("#FFFFFF")); c.drawCircle(0, 0, 9, p); } },
      { w: 8, h: 16, ax: 4, ay: 3, draw: (c) => { const p = Skia.Paint(); p.setAntiAlias(true); p.setColor(Skia.Color("#FFF6D2")); p.setAlphaf(0.7); p.setStrokeWidth(2); p.setStrokeCap(StrokeCap.Round); p.setStyle(PaintStyle.Stroke); c.drawLine(0, 0, 0, 10, p); p.setStyle(PaintStyle.Fill); p.setAlphaf(1); p.setColor(Skia.Color("#FFFFFF")); c.drawCircle(0, 0, 2.4, p); } },
      ...PAL.map((col) => ({ w: 18, h: 6, ax: 15, ay: 3, draw: (c: SkCanvas) => { const p = Skia.Paint(); p.setAntiAlias(true); p.setColor(Skia.Color(col)); p.setStrokeWidth(2.2); p.setStrokeCap(StrokeCap.Round); p.setStyle(PaintStyle.Stroke); c.drawLine(-12, 0, 0, 0, p); p.setStyle(PaintStyle.Fill); c.drawCircle(0, 0, 2.2, p); } })),
      { w: 12, h: 12, draw: (c) => drawCoin(c, 0, 0, 4.2, { sq: 0.5 }) },
      { w: 12, h: 12, draw: (c) => drawCoin(c, 0, 0, 4.2, { sq: 0.5, tone: "silver" }) },
      { w: 24, h: 24, draw: (c) => drawCoin(c, 0, 0, 9, { sq: 0.45 }) },
    ]);
    const sprites: SkRect[] = [], ax: number[] = [], ay: number[] = [];
    for (let i = 0; i < N_FX; i++) { const s = spriteFor(i); sprites.push(sheet.rects[s]); ax.push(sheet.ax[s]); ay.push(sheet.ay[s]); }
    const body = Skia.PathBuilder.Make().addOval(Skia.XYWHRect(41, 41, 254, 170)).build();
    const raysEven = Skia.PathBuilder.Make(), raysOdd = Skia.PathBuilder.Make();
    for (let i = 0; i < 12; i++) {
      const a = rad(i * 30), b = i % 2 ? raysOdd : raysEven, rot = (x: number, y: number) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
      const p1 = rot(-11, -190), p2 = rot(11, -190);
      b.moveTo(0, 0); b.lineTo(p1[0], p1[1]); b.lineTo(p2[0], p2[1]); b.close();
    }
    return {
      sheet, sprites, ax, ay, body,
      raysEven: raysEven.build(), raysOdd: raysOdd.build(),
      tail: P("M42 118 C 22 116, 18 94, 32 92 C 44 90, 44 106, 30 106"),
      earBack: P("M226 62 Q232 26 240 20 Q256 40 266 58 Z"),
      ear: P("M248 68 Q258 30 268 26 Q282 50 288 72 Z"),
      earIn: P("M256 60 Q262 40 268 36 Q276 52 280 66 Z"),
      gl1: P("M58 200 C 100 142, 166 104, 266 90"), gl2: P("M82 210 C 124 156, 188 122, 274 112"),
      hl1: P("M66 98 C 84 66, 128 48, 176 46"), hl2: P("M86 178 C 118 202, 196 210, 242 192"),
    };
  }, []);
}

interface Plan { k: number; targets: Coin[]; pics: SkPicture[] }

/** One of the (at most 8) coins that lands in the heap during an add. */
function LandCoin({ i, addT, addDur, kSV, tgt, pic }: { i: number; addT: SharedValue<number>; addDur: SharedValue<number>; kSV: SharedValue<number>; tgt: SharedValue<number[]>; pic: SkPicture | null }) {
  const tr = useDerivedValue(() => {
    const ms = addT.value * addDur.value, start = A_START + i * A_GAP + A_FLY, p = clamp((ms - start) / A_LAND, 0, 1), e = bezier(0.45, 0, 0.75, 0.6, p);
    const x = 166 + (tgt.value[i * 2] - 166) * e, y = 56 + (tgt.value[i * 2 + 1] - 56) * e;
    // Group opacity does not apply to a Picture, so hidden coins are parked off-screen instead.
    if (!(i < kSV.value && addT.value > 0 && ms >= start)) return [{ translateX: -9999 }, { translateY: -9999 }];
    return [{ translateX: x }, { translateY: y }, { rotate: rad(-20 * (1 - e)) }];
  });
  if (!pic) return null;
  return <Group transform={tr}><Picture picture={pic} /></Group>;
}

const Scene = forwardRef<SceneHandle, SceneProps>(function PigScene({ state, width, height, motion }, ref) {
  const fit = useMemo(() => fitBox(BOX, width, height), [width, height]);
  const S = useStatics();
  const clock = useSharedValue(0), addT = useSharedValue(0), msT = useSharedValue(0);
  const addDur = useSharedValue(addDurFor(1)), kSV = useSharedValue(0), tgt = useSharedValue<number[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  // Accumulate deltas: timeSinceFirstFrame restarts whenever the callback is re-registered (every re-render).
  useFrameCallback((f) => { clock.value += Math.min(f.timeSincePreviousFrame ?? 0, 100) / 1000; });

  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => {
      const k = kFor(state, amount), targets = newCoins(state, k);
      cancelAnimation(addT); addT.value = 0;
      kSV.value = k; tgt.value = targets.flatMap((c) => [c.x, c.y]); addDur.value = addDurFor(k);
      setPlan({ k, targets, pics: targets.map((c) => coinPicture(c.r, { sq: c.sq, rot: c.rot, tone: goldOrSilver(c) })) });
      addT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? addDurFor(k) : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    playMilestone: () => new Promise<void>((res) => {
      cancelAnimation(msT); msT.value = 0;
      msT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? MS_DUR : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    cancel: () => { cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0; setPlan(null); },
  }), [motion, state]);
  // The host re-renders with the new state once an add resolves: the landed coins are now part of the heap.
  useEffect(() => { cancelAnimation(addT); addT.value = 0; kSV.value = 0; setPlan(null); }, [state.pct, state.surplus, state.goal]);

  /* ---- state-dependent pictures ---- */
  const n = countOf(state);
  const H = useMemo(() => heapOf(n), [n]);
  const heapPic = useMemo(() => heapPicture(H, BOX), [H]);
  const twk = useMemo(() => { const m = Math.min(H.length, Math.max(6, Math.ceil(H.length * 0.45))); const out: number[] = []; for (let i = 0; i < m; i++) out.push(H[i].x - H[i].r * 0.3, H[i].y - H[i].r * 0.35); return out; }, [H]);
  const over = useMemo(() => {
    if (!(state.surplus > 0)) return null;
    const m = Math.min(40, Math.ceil(state.surplus / perCoin(state)));
    const L = heap(Math.ceil(m * 0.45), { seed: 3, r: 8, left: 4, right: 86, bottom: 240, top: 200 });
    const Rr = heap(Math.floor(m * 0.45), { seed: 5, r: 8, left: 264, right: 344, bottom: 240, top: 200 });
    const floor = heapPicture(L.concat(Rr).sort((a, b) => a.y - b.y), BOX);
    const nb = Math.min(5, Math.max(1, Math.floor(m / 7)));
    const back = createPicture((c) => {
      for (let i = 0; i < nb; i++) { const x = 110 + i * 22, y = 126 - 86 * Math.sqrt(1 - ((x - 168) / 128) ** 2) - 2; drawCoin(c, x, y, 8.5, { sq: 0.38, rot: i % 2 ? 6 : -8 }); }
    }, Skia.XYWHRect(BOX.x, BOX.y, BOX.w, BOX.h));
    return { floor, back };
  }, [state.surplus, state.goal]);

  /* ---- derived transforms ---- */
  const root = useMemo(() => [{ translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.scale }], [fit]);
  const pigTr = useDerivedValue(() => {
    const ms = addT.value * addDur.value, p = clamp(ms / 520, 0, 1), e = ease(p);
    return [{ rotate: rad(kf(e, [0, 0.2, 0.45, 0.7, 1], [0, -3, 3, -2, 0])) }];
  });
  const heapTr = useDerivedValue(() => {
    const ms = addT.value * addDur.value, k = Math.max(1, kSV.value), start = A_START + (k - 1) * A_GAP + A_FLY + A_LAND, p = clamp((ms - start) / A_SQ, 0, 1), e = ease(p);
    const sx = kf(e, [0, 0.3, 0.6, 1], [1, 1.02, 0.99, 1]), sy = kf(e, [0, 0.3, 0.6, 1], [1, 0.96, 1.03, 1]);
    return addT.value > 0 ? [{ scaleX: sx }, { scaleY: sy }] : [{ scale: 1 }];
  });
  const sweepTr = useDerivedValue(() => {
    const ev = cycleAt(clock.value, 0.3, SWEEP.list, SWEEP.total), p = ev.i < 0 ? 0 : clamp(ev.local / 2.4, 0, 1);
    return [{ translateX: 430 * easeInOut(p) }, { skewX: rad(-18) }];
  });
  const sweepO = useDerivedValue(() => {
    const ev = cycleAt(clock.value, 0.3, SWEEP.list, SWEEP.total);
    if (ev.i < 0 || ev.local > 2.4) return 0;
    return kf(easeInOut(ev.local / 2.4), [0, 0.2, 0.8, 1], [0, 0.8, 0.8, 0]);
  });
  const tailTr = useDerivedValue(() => {
    const ev = cycleAt(clock.value, 0.5, TAIL.list, TAIL.total);
    if (ev.i < 0 || ev.local > 0.75) return [{ rotate: 0 }];
    const e = easeInOut(ev.local / 0.75);
    return [{ rotate: rad(kf(e, [0, 0.25, 0.5, 0.75, 1], [0, 22, -16, 10, 0])) }];
  });
  const earTr = useDerivedValue(() => {
    const ev = cycleAt(clock.value, 2.0, EAR.list, EAR.total);
    if (ev.i < 0 || ev.local > 0.38) return [{ rotate: 0 }];
    const e = ease(ev.local / 0.38);
    return [{ rotate: rad(kf(e, [0, 0.4, 0.7, 1], [0, -16, 4, 0])) }];
  });
  const eyeTr = useDerivedValue(() => {
    const ev = cycleAt(clock.value, 2.5, BLINK.list, BLINK.total);
    if (ev.i < 0 || ev.local > 0.22) return [{ scaleY: 1 }];
    return [{ scaleY: kf(ease(ev.local / 0.22), [0, 0.5, 1], [1, 0.1, 1]) }];
  });
  const glowO = useDerivedValue(() => { const ms = msT.value * MS_DUR; if (msT.value <= 0 || ms > 1900) return 0; return kf(ease(ms / 1900), [0, 0.25, 0.6, 1], [0, 0.95, 0.7, 0]); });
  const raysTr = useDerivedValue(() => { const ms = msT.value * MS_DUR, e = easeOut(clamp(ms / 2100, 0, 1)); return [{ rotate: rad(55 * e) }, { scale: 0.4 + 0.6 * e }]; });
  const raysO = useDerivedValue(() => { const ms = msT.value * MS_DUR; if (msT.value <= 0 || ms > 2100) return 0; return kf(easeOut(ms / 2100), [0, 0.2, 0.75, 1], [0, 1, 1, 0]); });

  /* ---- fx atlas ---- */
  const { ax, ay, sheet } = S;
  const inv = sheet.inv;
  const xf = useRSXformBuffer(N_FX, (val, i) => {
    "worklet";
    const r = fxAt(i, clock.value, addT.value * addDur.value, msT.value > 0 ? msT.value * MS_DUR : -1, kSV.value, tgt.value, twk);
    if (r[2] <= 0) hide(val); else place(val, r[2], r[3], r[0], r[1], ax[i], ay[i], inv);
  });
  const cols = useColorBuffer(N_FX, (val, i) => {
    "worklet";
    const r = fxAt(i, clock.value, addT.value * addDur.value, msT.value > 0 ? msT.value * MS_DUR : -1, kSV.value, tgt.value, twk);
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = r[4];
  });

  return (
    <Canvas style={{ width, height }}>
      <Group transform={root}>
        <Rect x={-600} y={-600} width={1546} height={1486} color={PLAIN} />
        {/* back: light rays during the milestone */}
        <Group origin={vec(168, 126)} transform={raysTr} opacity={raysO}>
          <Path path={S.raysEven} color="#FFE29A" opacity={0.55} />
          <Path path={S.raysOdd} color="#FFE29A" opacity={0.35} />
        </Group>
        <Oval x={46} y={220} width={252} height={16} color="#C5D9CE" />
        {over && <Picture picture={over.floor} />}
        {/* the pig */}
        <Group origin={vec(171, 224)} transform={pigTr}>
          <Group origin={vec(44, 107)} transform={tailTr}>
            <Path path={S.tail} color="#DD879F" style="stroke" strokeWidth={6} strokeCap="round" />
          </Group>
          <RoundedRect x={82} y={176} width={30} height={46} r={12} color="#E8A0B4" />
          <RoundedRect x={124} y={180} width={30} height={44} r={12} color="#E8A0B4" />
          <RoundedRect x={196} y={180} width={30} height={44} r={12} color="#E8A0B4" />
          <RoundedRect x={238} y={176} width={30} height={46} r={12} color="#E8A0B4" />
          <Group opacity={0.55}>
            <RoundedRect x={82} y={214} width={30} height={8} r={4} color="#D98AA1" />
            <RoundedRect x={124} y={216} width={30} height={8} r={4} color="#D98AA1" />
            <RoundedRect x={196} y={216} width={30} height={8} r={4} color="#D98AA1" />
            <RoundedRect x={238} y={214} width={30} height={8} r={4} color="#D98AA1" />
          </Group>
          <Path path={S.earBack} color="#E28CA4" />
          <Oval x={40} y={40} width={256} height={172}>
            <RadialGradient c={vec(168, 134.6)} r={179.2} colors={["#FFF4F6", "#F7CFD9"]} transform={[{ scaleY: 0.672 }]} origin={vec(168, 134.6)} />
          </Oval>
          <Group clip={S.body}>
            <Group origin={vec(168, 200)} transform={heapTr}>
              <Picture picture={heapPic} />
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <LandCoin key={i} i={i} addT={addT} addDur={addDur} kSV={kSV} tgt={tgt} pic={plan && i < plan.k ? plan.pics[i] : null} />)}
            </Group>
            {/* pane */}
            <Oval x={40} y={40} width={256} height={172} color="#F7A9BF" opacity={0.27} />
            <Oval x={40} y={40} width={256} height={172}>
              <LinearGradient start={vec(0, 40)} end={vec(0, 212)} colors={["rgba(184,90,120,0)", "rgba(184,90,120,0)", "rgba(184,90,120,0.42)"]} positions={[0, 0.6, 1]} />
            </Oval>
            <Oval x={56} y={66} width={132} height={84}>
              <RadialGradient c={vec(122, 108)} r={66} colors={["rgba(255,255,255,0.42)", "rgba(255,255,255,0)"]} transform={[{ scaleY: 0.636 }]} origin={vec(122, 108)} />
            </Oval>
            <Path path={S.gl1} color="#FFFFFF" style="stroke" strokeWidth={22} strokeCap="round" opacity={0.15} />
            <Path path={S.gl2} color="#FFFFFF" style="stroke" strokeWidth={5} strokeCap="round" opacity={0.24} />
            {/* milestone glow from inside */}
            <Oval x={40} y={50} width={256} height={172} opacity={glowO}>
              <RadialGradient c={vec(168, 144.6)} r={153.6} colors={["#FFF1B8", "rgba(247,201,79,0.55)", "rgba(245,196,81,0)"]} positions={[0, 0.6, 1]} transform={[{ scaleY: 0.672 }]} origin={vec(168, 144.6)} />
            </Oval>
            {/* idle shimmer sweep */}
            <Group transform={sweepTr} opacity={sweepO}>
              <Rect x={-70} y={20} width={46} height={230} color="#FFFFFF" opacity={0.45} />
              <Rect x={-14} y={20} width={12} height={230} color="#FFFFFF" opacity={0.35} />
            </Group>
          </Group>
          <Oval x={40} y={40} width={256} height={172}>
            <RadialGradient c={vec(132.2, 88.2)} r={217.6} colors={["rgba(255,242,245,0.5)", "rgba(246,185,201,0.16)", "rgba(229,146,169,0.22)", "rgba(212,124,150,0.55)"]} positions={[0, 0.55, 0.85, 1]} transform={[{ scaleY: 0.672 }]} origin={vec(132.2, 88.2)} />
          </Oval>
          <Oval x={41} y={41} width={254} height={170} color="#C9718C" style="stroke" strokeWidth={3} opacity={0.9} />
          <Oval x={46} y={46} width={244} height={160} color="#FFFFFF" style="stroke" strokeWidth={1.2} opacity={0.45} />
          <Path path={S.hl1} color="#FFFFFF" style="stroke" strokeWidth={8} strokeCap="round" opacity={0.7} />
          <Oval x={191} y={50.4} width={18} height={7.2} color="#FFFFFF" opacity={0.85} />
          <Path path={S.hl2} color="#FFFFFF" style="stroke" strokeWidth={3} strokeCap="round" opacity={0.35} />
          <Group origin={vec(260, 72)} transform={earTr}>
            <Path path={S.ear} color="#F4A8BC" />
            <Path path={S.earIn} color="#E98FA8" opacity={0.6} />
          </Group>
          <Oval x={272} y={111} width={52} height={46} color="#EE9DB2" />
          <Oval x={282} y={121} width={20} height={10} color="#FFFFFF" opacity={0.35} />
          <Oval x={286} y={127} width={8} height={14} color="#C2627E" />
          <Oval x={301} y={127} width={8} height={14} color="#C2627E" />
          <Group origin={vec(256, 104)} transform={eyeTr}>
            <Circle cx={256} cy={104} r={6} color="#2B2330" />
            <Circle cx={258} cy={102} r={2} color="#FFFFFF" />
          </Group>
          <Circle cx={246} cy={140} r={13} color="#EE7F9B" opacity={0.35} />
          <RoundedRect x={136} y={47} width={60} height={9} r={4.5} color="#7A3B52" />
          <RoundedRect x={140} y={48.5} width={52} height={3} r={1.5} color="#4F2032" />
          {over && <Picture picture={over.back} />}
        </Group>
        {/* fx: twinkles, pouring coins, sparkles, fireworks, confetti */}
        {sheet.image && <Atlas image={sheet.image} sprites={S.sprites} transforms={xf} colors={cols} colorBlendMode="modulate" />}
      </Group>
    </Canvas>
  );
});

export const DEF: VisualDef = { key: "glass", box: BOX, plain: PLAIN, backgrounds: {}, Scene };
