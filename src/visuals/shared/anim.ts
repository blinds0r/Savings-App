/* Small pure helpers usable inside Reanimated worklets (and on the JS thread). */

export function clamp(v: number, a: number, b: number) {
  "worklet";
  return Math.max(a, Math.min(b, v));
}
export function lerp(a: number, b: number, t: number) {
  "worklet";
  return a + (b - a) * t;
}
export function rad(deg: number) {
  "worklet";
  return (deg * Math.PI) / 180;
}
/** CSS cubic-bezier(x1,y1,x2,y2) easing evaluated at t (0..1). */
export function bezier(x1: number, y1: number, x2: number, y2: number, t: number) {
  "worklet";
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let u = t;
  for (let i = 0; i < 6; i++) {
    const uu = 1 - u;
    const x = 3 * uu * uu * u * x1 + 3 * uu * u * u * x2 + u * u * u;
    const dx = 3 * uu * uu * x1 + 6 * uu * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    u -= (x - t) / dx;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
  }
  const uu = 1 - u;
  return 3 * uu * uu * u * y1 + 3 * uu * u * u * y2 + u * u * u;
}
/** The CSS named easings. */
export function ease(t: number) { "worklet"; return bezier(0.25, 0.1, 0.25, 1, t); }
export function easeOut(t: number) { "worklet"; return bezier(0, 0, 0.58, 1, t); }
export function easeIn(t: number) { "worklet"; return bezier(0.42, 0, 1, 1, t); }
export function easeInOut(t: number) { "worklet"; return bezier(0.42, 0, 0.58, 1, t); }
/** Piecewise-linear keyframes: offsets (ascending, 0..1) and the value at each. */
export function kf(t: number, offs: number[], vals: number[]) {
  "worklet";
  if (t <= offs[0]) return vals[0];
  for (let i = 1; i < offs.length; i++) {
    if (t <= offs[i]) {
      const a = offs[i - 1], b = offs[i];
      const k = b > a ? (t - a) / (b - a) : 1;
      return vals[i - 1] + (vals[i] - vals[i - 1]) * k;
    }
  }
  return vals[vals.length - 1];
}
/** Progress 0..1 of a window starting at `start` lasting `dur` (same units as `now`), or -1 outside it. */
export function win(now: number, start: number, dur: number) {
  "worklet";
  const k = (now - start) / dur;
  return k < 0 || k > 1 ? -1 : k;
}
/** Recurring events: the first fires at `first` s, then after each interval in `intervals` (cycled).
 *  Returns the event index (-1 before the first) and the seconds since that event began. */
export function cycleAt(t: number, first: number, intervals: number[], total: number) {
  "worklet";
  if (t < first) return { i: -1, local: 0 };
  let u = t - first;
  const n = Math.floor(u / total);
  u -= n * total;
  let cum = 0;
  for (let i = 0; i < intervals.length; i++) {
    if (u < cum + intervals[i]) return { i: n * intervals.length + i, local: u - cum };
    cum += intervals[i];
  }
  return { i: n * intervals.length + intervals.length - 1, local: u - cum };
}
/** Cheap integer hash for picking "random" things per event index inside a worklet. */
export function hash(i: number, salt: number) {
  "worklet";
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
/** 0..1 pseudo-random for event i. */
export function rnd(i: number, salt: number) {
  "worklet";
  return (hash(i, salt) % 10007) / 10007;
}

/* ---- JS-thread helpers (not worklets) ---- */
export const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
/** A fixed irregular sequence of intervals in [min,max] seconds (the "every 3–5 s" of the prototype). */
export function intervals(seed: number, count: number, min: number, max: number) {
  const r = seeded(seed), out: number[] = [];
  for (let i = 0; i < count; i++) out.push(min + r() * (max - min));
  return { list: out, total: out.reduce((a, b) => a + b, 0) };
}
