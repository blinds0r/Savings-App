/* Summit helpers: worklet-safe geometry, easing and keyframe maths shared by the scene. */
import { Skia } from "@shopify/react-native-skia";

export const BOX = { x: 0, y: -96, w: 346, h: 458 };
export const TRAIL: number[][] = [[120, 350], [200, 318], [150, 286], [222, 250], [170, 214], [232, 178], [186, 140], [226, 104], [196, 72], [206, 40]];
export const CAMPS = [1 / 12, 1 / 6, 1 / 3, 1 / 2, 2 / 3];
export const ORANGE = "#F26B3A", INK = "#1D2A3A";

/* cumulative trail length (for the done-trail trim) */
const CUM: number[] = [0];
for (let i = 1; i < TRAIL.length; i++) CUM.push(CUM[i - 1] + Math.hypot(TRAIL[i][0] - TRAIL[i - 1][0], TRAIL[i][1] - TRAIL[i - 1][1]));
export const TRAIL_LEN = CUM[CUM.length - 1];

export function clamp(v: number, a: number, b: number) { "worklet"; return v < a ? a : v > b ? b : v; }
export function clamp01(v: number) { "worklet"; return v < 0 ? 0 : v > 1 ? 1 : v; }
/** 0..1 progress of a phase starting at `start` ms and lasting `dur` ms */
export function ph(ms: number, start: number, dur: number) { "worklet"; return clamp01((ms - start) / dur); }
export function easeInOut(k: number) { "worklet"; return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
export function easeOut(k: number) { "worklet"; return 1 - Math.pow(1 - k, 3); }
export function easeOutQ(k: number) { "worklet"; return 1 - (1 - k) * (1 - k); }
/** positive fractional part */
export function frac(v: number) { "worklet"; return v - Math.floor(v); }
/** triangle wave 0→1→0 for u in "half cycles" (CSS alternate) */
export function tri(u: number) { "worklet"; const f = u - 2 * Math.floor(u / 2); return f < 1 ? f : 2 - f; }
export function lerp(a: number, b: number, k: number) { "worklet"; return a + (b - a) * k; }
/** piecewise keyframes: offsets (ascending, first 0 last 1) and values; each segment eased in-out */
export function kf(t: number, offs: number[], vals: number[], ease: boolean = true) {
  "worklet";
  if (t <= offs[0]) return vals[0];
  for (let i = 1; i < offs.length; i++) {
    if (t <= offs[i]) {
      const k = (t - offs[i - 1]) / (offs[i] - offs[i - 1]);
      return lerp(vals[i - 1], vals[i], ease ? easeInOut(k) : k);
    }
  }
  return vals[vals.length - 1];
}
export function fmtInt(n: number) { "worklet"; const s = String(Math.round(n)); return s.length > 3 ? s.slice(0, -3) + "," + s.slice(-3) : s; }
export function altTxt(p: number) { "worklet"; return fmtInt(clamp01(p) * 3000) + " m"; }

export interface TrailPt { i: number; x: number; y: number; dir: number }
export function trailAt(p: number): TrailPt {
  "worklet";
  const y = 350 - 310 * clamp01(p);
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const a = TRAIL[i], b = TRAIL[i + 1];
    if (y <= a[1] && y >= b[1]) {
      const k = a[1] === b[1] ? 0 : (a[1] - y) / (a[1] - b[1]);
      const dx = b[0] - a[0];
      return { i, x: a[0] + dx * k, y, dir: dx < 0 ? -1 : 1 };
    }
  }
  const l = TRAIL[TRAIL.length - 1];
  return { i: TRAIL.length - 2, x: l[0], y: l[1], dir: 1 };
}
/** fraction of the whole trail length covered at progress p (for Path end=) */
export function trailFrac(p: number) {
  "worklet";
  const q = trailAt(p);
  const a = TRAIL[q.i];
  return (CUM[q.i] + Math.hypot(q.x - a[0], q.y - a[1])) / TRAIL_LEN;
}

/* ---------- camera (the prototype's viewBox zoom, done on the fitted transform) ---------- */
export type VB = [number, number, number, number];
export const BASE_VB: VB = [BOX.x, BOX.y, BOX.w, BOX.h];
export function frameBox(cx: number, cy: number, w: number): VB {
  const asp = BOX.w / BOX.h;
  w = clamp(w, 90, BOX.w);
  const h = w / asp;
  return [clamp(cx - w / 2, BOX.x, BOX.x + BOX.w - w), clamp(cy - h / 2, BOX.y, BOX.y + BOX.h - h), w, h];
}
/** zoom box for the hike from p0 to p1 (mode A of the prototype) */
export function hikeBox(p0: number, p1: number): VB {
  const asp = BOX.w / BOX.h;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i <= 12; i++) {
    const q = trailAt(p0 + (p1 - p0) * i / 12);
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
  }
  const w = Math.max(130, maxX - minX + 90, (maxY - minY + 90) * asp);
  return frameBox((maxX + minX) / 2, (maxY + minY) / 2 - 8, w);
}
/** fit a view box into width x height (xMidYMid meet) → Skia transform */
export function fitVB(vb: VB, width: number, height: number) {
  "worklet";
  const scale = Math.min(width / vb[2], height / vb[3]);
  return [{ translateX: (width - vb[2] * scale) / 2 - vb[0] * scale }, { translateY: (height - vb[3] * scale) / 2 - vb[1] * scale }, { scale }];
}

/* ---------- static paths ---------- */
export const svgPath = (d: string) => Skia.Path.MakeFromSVGString(d)!;
export const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
export const polyline = (pts: number[][]) => { const b = Skia.PathBuilder.Make(); b.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) b.lineTo(pts[i][0], pts[i][1]); return b.build(); };
/** the misty valley's jagged ranges */
export function rangePath(y0: number, amp: number, seed: number, step: number) {
  const r = seeded(seed); let d = `M-500 ${y0}`;
  for (let x = -500; x <= 846 + step; x += step) d += ` L${x} ${(y0 - amp * (0.35 + r() * 0.65)).toFixed(1)} L${x + step / 2} ${(y0 - amp * r() * 0.35).toFixed(1)}`;
  return svgPath(d + ` L${846 + step} 900 L-500 900 Z`);
}
/** unit 8-point sparkle (s = 1) */
export const SPARK = svgPath("M0 -1 L0.27 -0.27 L1 0 L0.27 0.27 L0 1 L-0.27 0.27 L-1 0 L-0.27 -0.27 Z");

/* ---------- deterministic particle sets ---------- */
export interface Flake { x: number; drift: number; fall: number; r: number; T: number; ph: number }
export const FLAKES: Flake[] = (() => { const r = seeded(91), out: Flake[] = []; for (let i = 0; i < 24; i++) out.push({ x: r() * 346, drift: (r() - 0.5) * 40, fall: 140 + r() * 180, r: 0.9 + r() * 1.1, T: 3.2 + r() * 2.4, ph: r() }); return out; })();
export interface Spark { a: number; d: number; s: number; dur: number }
export const SPARKS: Spark[] = (() => { const r = seeded(37), out: Spark[] = []; for (let i = 0; i < 12; i++) out.push({ a: r() * Math.PI * 2, d: 10 + r() * 46, s: 5 * (0.6 + r() * 0.8), dur: 700 + r() * 450 }); return out; })();
