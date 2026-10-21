/* Firefly helpers: slot layout for the single Atlas, worklet-safe easing/keyframes, dot font for the milestone. */
import { Skia } from "@shopify/react-native-skia";

export const BOX = { x: 0, y: 0, w: 346, h: 380 };
export const CAP = 300, JX = 173, JY = 240, MOUTH_X = 173, MOUTH_Y = 96;
/* atlas slot ranges: inside flies, free (surplus) flies, net-catch dots, temporary spelling flies */
export const FREE0 = CAP, FREE_MAX = 60, DOT0 = FREE0 + FREE_MAX, DOT_MAX = 8, TEMP0 = DOT0 + DOT_MAX, TEMP_MAX = 52, SLOT_N = TEMP0 + TEMP_MAX;
/* sprite strip: LEVELS cells of CELL px, glow radius GLOW px (drawn at 2x; base scale 0.5 gives the prototype's r = 7) */
export const LEVELS = 16, CELL = 64, GLOW = 28, BASE_SCALE = 0.5;

export const seeded = (s: number) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
export const svgPath = (d: string) => Skia.Path.MakeFromSVGString(d)!;

export function clamp(v: number, a: number, b: number) { "worklet"; return v < a ? a : v > b ? b : v; }
export function clamp01(v: number) { "worklet"; return v < 0 ? 0 : v > 1 ? 1 : v; }
export function ph(ms: number, start: number, dur: number) { "worklet"; return clamp01((ms - start) / dur); }
export function easeInOut(k: number) { "worklet"; return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
export function easeOut(k: number) { "worklet"; return 1 - Math.pow(1 - k, 3); }
export function easeOutQ(k: number) { "worklet"; return 1 - (1 - k) * (1 - k); }
export function frac(v: number) { "worklet"; return v - Math.floor(v); }
export function lerp(a: number, b: number, k: number) { "worklet"; return a + (b - a) * k; }
export function kf(t: number, offs: number[], vals: number[], ease: boolean = true) {
  "worklet";
  if (t <= offs[0]) return vals[0];
  for (let i = 1; i < offs.length; i++) {
    if (t <= offs[i]) { const k = (t - offs[i - 1]) / (offs[i] - offs[i - 1]); return lerp(vals[i - 1], vals[i], ease ? easeInOut(k) : k); }
  }
  return vals[vals.length - 1];
}

/* ---------- homes ---------- */
export const SLOTS: number[][] = (() => {
  const rand = seeded(7), s: number[][] = []; let guard = 0;
  while (s.length < CAP && guard < 20000) {
    guard++;
    const x = 98 + rand() * 150, y = 132 + rand() * 216;
    if (y < 170) { const inset = ((170 - y) / 46) * 34; if (x < 98 + inset || x > 248 - inset) continue; }
    s.push([x, y]);
  }
  return s;
})();
export const FREE: number[][] = (() => {
  const rand = seeded(99), out: number[][] = [];
  for (let i = 0; i < FREE_MAX; i++) { let x = 0, y = 0, g = 0; do { x = 6 + rand() * 334; y = 14 + rand() * 330; g++; } while (x > 78 && x < 268 && y > 54 && g < 50); out.push([x, y]); }
  return out;
})();
export const countOf = (pct: number) => (pct > 0 ? Math.max(1, Math.round(clamp01(pct) * CAP)) : 0);
export const freeCount = (surplus: number, goal: number) => (surplus > 0 ? Math.min(40, Math.ceil(surplus / (goal / CAP))) : 0);
export const howMany = (goal: number, amount: number) => clamp(Math.round(amount / (goal / CAP)), 1, DOT_MAX);

/* per-slot idle randomness: wander periods/phases and blink period/phase */
export interface Jit { w1: number; w2: number; p1: number; p2: number; bd: number; bp: number }
export const JIT: Jit[] = (() => { const r = seeded(32), out: Jit[] = []; for (let i = 0; i < SLOT_N; i++) out.push({ w1: 5 + r() * 5, w2: 5 + r() * 5, p1: r() * Math.PI * 2, p2: r() * Math.PI * 2, bd: 1.8 + r() * 1.7, bp: r() }); return out; })();

/* ---------- milestone dot font ---------- */
const FONT: Record<string, string> = { "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111", "%": "101001010100101" };
export function textDots(txt: string, cx: number, top: number, s: number) {
  const chars = String(txt).split("").filter((ch) => FONT[ch]), w = (chars.length * 4 - 1) * s, x0 = cx - w / 2, out: number[][] = [];
  chars.forEach((ch, ci) => { const g = FONT[ch]; for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) if (g[r * 3 + col] === "1") out.push([x0 + (ci * 4 + col) * s, top + r * s]); });
  return out;
}

/* sparkle (unit 8-point star) and deterministic sparkle set for the milestone */
export const SPARK = svgPath("M0 -1 L0.27 -0.27 L1 0 L0.27 0.27 L0 1 L-0.27 0.27 L-1 0 L-0.27 -0.27 Z");
export interface Spark { a: number; d: number; s: number; dur: number }
export const SPARKS: Spark[] = (() => { const r = seeded(53), out: Spark[] = []; for (let i = 0; i < 10; i++) out.push({ a: r() * Math.PI * 2, d: 10 + r() * 90, s: 5 * (0.6 + r() * 0.8), dur: 700 + r() * 450 }); return out; })();

/* ---------- the milestone flight of one firefly (prototype "Release and spell") ----------
   t: 0..1 local progress; home (hx,hy); th0 ring phase; target dot (tx,ty); temp flies start/end invisible at the mouth. */
export function spellPos(t: number, hx: number, hy: number, th0: number, tx: number, ty: number, temp: boolean) {
  "worklet";
  const mx = MOUTH_X, my = MOUTH_Y;
  const ringX = (j: number) => JX + Math.cos(th0 + (j / 5) * Math.PI * 2) * 96, ringY = (j: number) => 44 + Math.sin(th0 + (j / 5) * Math.PI * 2) * 26;
  let x = hx, y = hy, op = temp ? 0 : 1;
  if (t <= 0) return { x, y, op };
  if (t < 0.1) { const k = easeInOut(t / 0.1); x = lerp(hx, mx, k); y = lerp(hy, my - 12, k); op = temp ? k : 1; }
  else if (t < 0.13) { const k = easeInOut((t - 0.1) / 0.03); x = lerp(mx, ringX(0), k); y = lerp(my - 12, ringY(0), k); op = 1; }
  else if (t < 0.36) { const u = (t - 0.13) / 0.046, j = Math.min(4, Math.floor(u)), k = easeInOut(u - j); x = lerp(ringX(j), ringX(j + 1), k); y = lerp(ringY(j), ringY(j + 1), k); op = 1; }
  else if (t < 0.46) { const k = easeInOut((t - 0.36) / 0.1); x = lerp(ringX(5), tx, k); y = lerp(ringY(5), ty, k); op = 1; }
  else if (t < 0.58) { x = tx; y = ty; op = lerp(1, 0.7, easeInOut((t - 0.46) / 0.12)); }
  else if (t < 0.7) { x = tx; y = ty; op = lerp(0.7, 1, easeInOut((t - 0.58) / 0.12)); }
  else if (t < 0.86) { const k = easeInOut((t - 0.7) / 0.16); x = lerp(tx, mx, k); y = lerp(ty, my - 16, k); op = 1; }
  else if (t < 1) { const k = easeInOut((t - 0.86) / 0.14); x = lerp(mx, hx, k); y = lerp(my - 16, hy, k); op = temp ? 1 - k : 1; }
  else { op = temp ? 0 : 1; }
  return { x, y, op };
}
