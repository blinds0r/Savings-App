/* Launch pad: a stainless-steel two-stage stack on its launch mount beside a lattice tower at dawn
 * (port of the prototype's visuals/rocket.js, viewBox 0 0 346 380).
 * Progress = yellow fuel in a clear window up the booster (0% bottom, 100% rounded top), 25/50/75 ticks matched on the tower.
 * Chosen options: idle [0] "Venting", add [0] "Prop load", milestone [0] "Static fire" (at 100 it is the real liftoff).
 * Everything is a pure function of (state, clock, addT, msT). The liftoff runs on one timeline `lt` (ms, 0..D_LIFT) whose
 * end is exactly the launched pose the scene draws for pct = 1, so the host's re-render after the milestone never jumps. */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  Atlas, BlurStyle, Canvas, Circle, ClipOp, DashPathEffect, Group, Image, Line, LinearGradient, PaintStyle, Path, Picture, RadialGradient, Rect, Skia, Text, TileMode,
  createPicture, drawAsImageFromPicture, useColorBuffer, useFont, useRSXformBuffer, vec,
  type SkCanvas, type SkFont, type SkImage, type SkPicture, type SkShader,
} from "@shopify/react-native-skia";
import { cancelAnimation, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withTiming, Easing, ReduceMotion, type SharedValue } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import { fitBox } from "../contract";
import { bezier, clamp, ease, easeInOut, easeOut, kf, rad, seeded } from "../shared/anim";
import { drawStar } from "../shared/coins";
import { hide, makeSheet, place, type Sheet } from "../shared/sprites";

const BOX = { x: 0, y: 0, w: 346, h: 380 };
const PLAIN = "#343E4D";
const FONT = require("@expo-google-fonts/figtree/700Bold/Figtree_700Bold.ttf");

/* ---------- geometry (identical to the prototype) ---------- */
const SX = 204, SB = 320, H = 294, R = 18, BT = -170, NB = -254, GY = 352; // stack centre x, base y, height, radius, booster top, nose base, ground y
const TX0 = 110, TX1 = 140, TT = 24; // tower
const SLX = -4, SLW = 10, SLY0 = -12, SLLEN = 136, CAP = -151; // fuel window (stack-local)
const XL = SLX - SLW / 2;
const SIL = `M${-R} 0 L${-R} ${NB} C${-R} -273 -9 -293 0 ${-H} C9 -293 ${R} -273 ${R} ${NB} L${R} 0 Z`;
function LPk(k: number) { "worklet"; return 460 + 100 * k; } // plume length, stack units
function visAt(y: number, s: number, k: number) { "worklet"; return clamp((GY + 2 - (y + 2 * s)) / (LPk(k) * s), 0.03, 1); }
const fuelY = (p: number) => SLY0 - clamp(p, 0, 1) * SLLEN;
const launchY = (k: number) => 110 - 24 * k, launchS = (k: number) => 0.31 - 0.08 * k;

/* ---------- timelines (ms) ---------- */
const NONE = 0, SF = 1, LIFT = 2, TH = 3;
const D_SF = 3900, ON = 250, OFF = 2700; // static fire
const D_LIFT = 4600, IGN = 300, REL = 1050, RISE = 3100; // liftoff
const D_TH = 2400; // already flying: throttle-up
const TRAVEL = 1050; // prop-load pulse travel
function durOf(kd: number) { "worklet"; return kd === SF ? D_SF : kd === LIFT ? D_LIFT : kd === TH ? D_TH : 1; }
function frac(x: number) { "worklet"; return x - Math.floor(x); }
/** Alternating 0..1..0 (one direction per unit). */
function tri(x: number) { "worklet"; const f = x - 2 * Math.floor(x / 2); return f < 1 ? f : 2 - f; }

/* ---------- pre-rolled randomness ---------- */
const RN = seeded(4242);
const RUM_X: number[] = [], RUM_Y: number[] = [];
for (let i = 0; i < 72; i++) { RUM_X.push(RN() - 0.5); RUM_Y.push(RN() - 0.5); }
/** Random rumble keyframes every 60 ms with an attack/decay envelope (linear between keyframes). */
function rumble(tau: number, dur: number, ax: number, ay: number) {
  "worklet";
  if (tau <= 0 || tau >= dur) return [0, 0];
  const M = Math.round(dur / 60), pos = (tau / dur) * M, i = Math.floor(pos), f = pos - i;
  const env = (j: number) => (j <= 0 || j >= M ? 0 : Math.min(1, j / 6, (M - j) / 8));
  const x0 = RUM_X[i % 72] * ax * env(i), x1 = RUM_X[(i + 1) % 72] * ax * env(i + 1);
  const y0 = RUM_Y[i % 72] * ay * env(i), y1 = RUM_Y[(i + 1) % 72] * ay * env(i + 1);
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
}
// engine fire keyframes (offsets, scaleX, scaleY, opacity)
const SF_O = [0, ON / D_SF], SF_X = [0.3, 0.3], SF_Y = [0, 0], SF_A = [0, 0];
for (let i = 1; i <= 14; i++) { SF_O.push((ON + 200) / D_SF + (i / 14) * ((OFF - ON - 250) / D_SF)); SF_X.push(0.92 + RN() * 0.14); SF_Y.push(0.86 + RN() * 0.3); SF_A.push(1); }
SF_O.push((OFF + 200) / D_SF, 1); SF_X.push(0.4, 0.4); SF_Y.push(0.15, 0.15); SF_A.push(0, 0);
const LO_O = [0, IGN / D_LIFT, (IGN + 180) / D_LIFT], LO_X = [0.3, 0.3, 1.15], LO_Y = [0, 0, 1.2], LO_A = [0, 0, 1];
for (let i = 1; i <= 10; i++) { LO_O.push((IGN + 180) / D_LIFT + (i / 10) * ((REL + 500 - IGN - 180) / D_LIFT)); LO_X.push(0.95 + RN() * 0.12); LO_Y.push(0.9 + RN() * 0.25); LO_A.push(1); }
LO_O.push((REL + 1500) / D_LIFT, 1); LO_X.push(1.2, 1.2); LO_Y.push(0.5, 0.5); LO_A.push(0, 0);
// plume flicker (9 keyframes per 420 ms)
const FL_O: number[] = [], FL_X: number[] = [], FL_Y: number[] = [];
for (let i = 0; i < 9; i++) { FL_O.push(i / 8); FL_X.push(i === 0 || i === 8 ? 1 : 0.9 + RN() * 0.16); FL_Y.push(i === 0 || i === 8 ? 1 : 0.9 + RN() * 0.18); }
// steam particles out of the flame trench (one set of 42, the liftoff uses the first 34)
const N_ST = 42;
const ST_OX: number[] = [], ST_DIST: number[] = [], ST_RISE: number[] = [], ST_R: number[] = [], ST_DUR: number[] = [], ST_ES: number[] = [], ST_W: number[] = [];
for (let i = 0; i < N_ST; i++) { ST_DIST.push(30 + RN() * 130); ST_RISE.push(8 + RN() * 64); ST_R.push(13 + RN() * 12); ST_DUR.push(1500 + RN() * 600); ST_W.push(RN() < 0.4 ? 1 : 0); ST_OX.push(8 + RN() * 12); ST_ES.push(1.7 + RN() * 0.7); }
// sparkles (throttle-up)
const N_SPK = 14, SPK_A: number[] = [], SPK_D: number[] = [], SPK_S: number[] = [], SPK_T: number[] = [];
for (let i = 0; i < N_SPK; i++) { SPK_A.push(RN() * Math.PI * 2); SPK_D.push(10 + RN() * 50); SPK_S.push(4 * (0.6 + RN() * 0.8)); SPK_T.push(700 + RN() * 450); }
// bubbles in the fuel
const BUB_X = [-2.2, 1.6, -0.6, 2.4, -1.8, 0.4, 2, -2.4, 1].map((d) => SLX + d), BUB_Y: number[] = [], BUB_R: number[] = [], BUB_D: number[] = [], BUB_RISE: number[] = [], BUB_DX: number[] = [], BUB_PH: number[] = [];
{ const r = seeded(57); for (let i = 0; i < 9; i++) { BUB_Y.push(SLY0 - 6 - i * 15.5); BUB_R.push(0.7 + (i % 3) * 0.25); BUB_D.push(2600 + r() * 1800); BUB_RISE.push(16 + r() * 12); BUB_DX.push((i % 2 ? 1 : -1) * (0.4 + r() * 0.8)); BUB_PH.push(r()); } }
// tower lights: [x, y, group]
const LIGHTS: [number, number, number][] = [[TX0 - 3, TT - 5, 0], [TX1 + 3, TT - 5, 1], [125, TT - 10, 0], [TX0 - 1, 190, 1], [315, 155, 0]];

/* ---------- colour helpers ---------- */
type Stop = [number, string, number?];
const G: Record<string, Stop[]> = {
  sky: [[0, "#343E4D"], [0.35, "#4C5869"], [0.62, "#7B8592"], [0.8, "#A8A6AA"], [0.93, "#CDB6A7"], [1, "#DCC0AC"]],
  hazeB: [[0, "#9AA4B2", 0.45], [1, "#9AA4B2", 0]],
  hazeP: [[0, "#EED6C4", 0.6], [1, "#EED6C4", 0]],
  dawn: [[0, "#F6DCC4", 0.85], [0.4, "#E9C7AE", 0.35], [1, "#E2BFA8", 0]],
  sea: [[0, "#B3A6A3"], [1, "#6A7481"]],
  land: [[0, "#4E555D"], [1, "#2A2E34"]],
  apron: [[0, "#6E747C"], [1, "#4E535A"]],
  steel: [[0, "#5A626C"], [0.09, "#7F8893"], [0.22, "#C9D0D8"], [0.31, "#F4F6F8"], [0.39, "#C6CDD5"], [0.55, "#959EA9"], [0.7, "#A2ADBB"], [0.84, "#C4BCB7"], [0.93, "#848C96"], [1, "#565E68"]],
  shadeV: [[0, "#E9EEF5", 0.12], [0.5, "#000000", 0], [0.92, "#20252B", 0.12], [1, "#20252B", 0.3]],
  underG: [[0, "#FFA45A", 0], [0.7, "#FFA45A", 0.3], [1, "#FFD9A0", 0.8]],
  race: [[0, "#6E7680"], [0.45, "#D3D9DF"], [1, "#77808A"]],
  tileG: [[0, "#15181C"], [0.45, "#2E333A"], [0.7, "#3A4048"], [1, "#2A2F35"]],
  band: [[0, "#16191D"], [0.3, "#3B4148"], [0.6, "#262A30"], [1, "#121417"]],
  flap: [[0, "#3A4048"], [1, "#16191D"]],
  wisp: [[0, "#FFFFFF", 0.95], [0.5, "#F1F5F9", 0.55], [1, "#E6ECF2", 0]],
  mount: [[0, "#6F7780"], [0.25, "#4B525A"], [1, "#2E3339"]],
  leg: [[0, "#2A2F35"], [0.5, "#565E67"], [1, "#262A30"]],
  bay: [[0, "#121417"], [1, "#1E2226"]],
  bayGlow: [[0, "#FFF1D6", 0.95], [0.45, "#F59A5C", 0.5], [1, "#E0703E", 0]],
  tank: [[0, "#E4E8EC"], [0.45, "#A9B0B8"], [1, "#5E656E"]],
  tankH: [[0, "#C9CFD5"], [0.35, "#E8EBEE"], [1, "#6C737C"]],
  lamp: [[0, "#FFB3A8", 0.9], [0.35, "#FF4A3A", 0.45], [1, "#FF4A3A", 0]],
  pulse: [[0, "#FFFFFF"], [0.3, "#D6ECFF", 0.9], [1, "#8CC6FF", 0]],
  steam: [[0, "#FFFFFF"], [0.45, "#E9ECEF", 0.95], [0.78, "#C6CCD3", 0.55], [1, "#AFB7C0", 0]],
  steamW: [[0, "#FFF4E2"], [0.45, "#F7DCC0", 0.95], [0.78, "#D9B49A", 0.55], [1, "#C29C86", 0]],
  warm: [[0, "#FFE3B8", 0.85], [0.4, "#FFB27A", 0.35], [1, "#FF9A5C", 0]],
  plEdge: [[0, "#FFB45E"], [0.22, "#FF7A2C", 0.9], [0.6, "#E0441C", 0.55], [1, "#A8281A", 0]],
  plBody: [[0, "#FFEAB0"], [0.25, "#FFC24A"], [0.6, "#FF8A2A", 0.85], [1, "#FF5A1E", 0]],
  plCore: [[0, "#FFFFFF"], [0.1, "#FFF5D0"], [0.35, "#FFDB8A"], [0.75, "#FFC060", 0.7], [1, "#FFB050", 0]],
  core: [[0, "#FFFFFF"], [0.4, "#E4EEFF"], [1, "#A9C8FF", 0]],
  towerWash: [[0, "#FFB27A", 0], [1, "#FFB27A", 0.6]],
  sign: [[0, "#FBF6EC"], [1, "#E3DACB"]],
  fuel: [[0, "#C98A06"], [0.3, "#FFC928"], [0.5, "#FFE27A"], [0.75, "#F7B514"], [1, "#B57404"]],
  fuelV: [[0, "#FFF3B0", 0.55], [0.08, "#FFF3B0", 0], [1, "#7A4A00", 0.35]],
  slitG: [[0, "#0D1116"], [0.5, "#1E262F"], [1, "#0D1116"]],
  fuelGlow: [[0, "#FFD54A", 0.5], [1, "#FFD54A", 0]],
};
const rgba = (hex: string, a = 1) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
/** Stops for the declarative gradient components. */
const gc = (s: Stop[]) => ({ c: s.map((q) => rgba(q[1], q[2] ?? 1)), p: s.map((q) => q[0]) });
const GC = { warm: gc(G.warm), towerWash: gc(G.towerWash), underG: gc(G.underG), bayGlow: gc(G.bayGlow), lamp: gc(G.lamp), fuel: gc(G.fuel), fuelV: gc(G.fuelV), fuelGlow: gc(G.fuelGlow), bay: gc(G.bay) };
const C = (hex: string, a = 1) => { const k = Float32Array.from(Skia.Color(hex)); k[3] *= a; return k; };
const LG = (x1: number, y1: number, x2: number, y2: number, s: Stop[]) => Skia.Shader.MakeLinearGradient(vec(x1, y1), vec(x2, y2), s.map((q) => C(q[1], q[2] ?? 1)), s.map((q) => q[0]), TileMode.Clamp);
const RG = (cx: number, cy: number, r: number, s: Stop[]) => Skia.Shader.MakeRadialGradient(vec(cx, cy), r, s.map((q) => C(q[1], q[2] ?? 1)), s.map((q) => q[0]), TileMode.Clamp);
function fillP(f: string | SkShader, a = 1, blur = 0) {
  const p = Skia.Paint(); p.setAntiAlias(true);
  if (typeof f === "string") p.setColor(C(f, a)); else { p.setColor(C("#000000", a)); p.setShader(f); }
  if (blur) p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur, true));
  return p;
}
function strokeP(col: string, w: number, a = 1) { const p = fillP(col, a); p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(w); return p; }
const SP = (d: string) => Skia.Path.MakeFromSVGString(d)!;
const XY = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);
const f1 = (v: number) => (+v).toFixed(1), f2 = (v: number) => (+v).toFixed(2);
/** Vertical / horizontal gradient over a path's bounding box (SVG objectBoundingBox). */
function bboxG(path: ReturnType<typeof SP>, s: Stop[], dir: "v" | "h" | "d" = "v") {
  const b = path.computeTightBounds();
  return dir === "v" ? LG(0, b.y, 0, b.y + b.height, s) : dir === "h" ? LG(b.x, 0, b.x + b.width, 0, s) : LG(b.x, b.y, b.x + b.width, b.y + b.height, s);
}
/** An ellipse filled with a bounding-box radial gradient (cx, cy, r as fractions of the box). */
function ellG(c: SkCanvas, cx: number, cy: number, rx: number, ry: number, s: Stop[], a = 1, g: [number, number, number] = [0.5, 0.5, 0.5], blur = 0) {
  c.save(); c.translate(cx, cy); c.scale(rx, ry);
  c.drawOval(XY(-1, -1, 2, 2), fillP(RG(g[0] * 2 - 1, g[1] * 2 - 1, g[2] * 2, s), a, blur));
  c.restore();
}
const fmt = (n: number) => "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const textW = (font: SkFont, t: string) => font.getGlyphWidths(font.getGlyphIDs(t)).reduce((a, b) => a + b, 0);

/* ---------- static drawing (ported from render()) ---------- */
function armParts(x0: number, y0: number, x1: number, y1: number, w: number) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, w1 = w * 0.55, n = Math.floor(L / 5);
  let br = "";
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, s = i % 2 ? 1 : -1, ww = w + (w1 - w) * ((a + b) / 2);
    br += `M${f2(x0 + dx * a + (nx * s * ww) / 2)} ${f2(y0 + dy * a + (ny * s * ww) / 2)}L${f2(x0 + dx * b - (nx * s * ww) / 2)} ${f2(y0 + dy * b - (ny * s * ww) / 2)}`;
  }
  const A = `${f2(x0 + (nx * w) / 2)} ${f2(y0 + (ny * w) / 2)}`, B = `${f2(x1 + (nx * w1) / 2)} ${f2(y1 + (ny * w1) / 2)}`, Cc = `${f2(x1 - (nx * w1) / 2)} ${f2(y1 - (ny * w1) / 2)}`, D = `${f2(x0 - (nx * w) / 2)} ${f2(y0 - (ny * w) / 2)}`;
  return { poly: `M${A} L${B} L${Cc} L${D}Z`, sides: `M${A} L${B} M${D} L${Cc}`, br };
}
function drawArm(c: SkCanvas, x0: number, y0: number, x1: number, y1: number, w: number, col: string) {
  const a = armParts(x0, y0, x1, y1, w);
  c.drawPath(SP(a.poly), fillP(col, 0.35)); c.drawPath(SP(a.sides), strokeP(col, 1.3)); c.drawPath(SP(a.br), strokeP(col, 0.6));
}
function tank(c: SkCanvas, cx: number, cy: number, r: number, a = 1) {
  c.drawCircle(cx, cy, r, fillP(RG(cx - r + 0.72 * r, cy - r + 0.64 * r, 1.5 * r, G.tank), a));
}

function drawBg(c: SkCanvas) {
  const rand = seeded(23);
  let coast = "M-140 299 L-140 296.5";
  for (let x = -140; x < 470;) { const w = 6 + rand() * 18, h = rand() < 0.45 ? 1.5 + rand() * 6 : 0.4; coast += ` L${f1(x)} ${f1(296.5 - h)} L${f1(x + w)} ${f1(296.5 - h)} L${f1(x + w)} 296.5`; x += w + 4 + rand() * 22; }
  coast += " L486 296.5 L486 299 Z";
  let streaks = ""; for (let i = 0; i < 14; i++) { const x = 170 + rand() * 176, y = 300 + rand() * 12, w = 6 + rand() * 26; streaks += `M${f1(x)} ${f1(y)}h${f1(w)}`; }
  let marsh = ""; for (let i = 0; i < 26; i++) { const x = -140 + rand() * 610, y = 316 + rand() * 60, w = 8 + rand() * 30; marsh += `M${f1(x)} ${f1(y)}h${f1(w)}`; }
  let brace = "", hor = "";
  for (let y = GY; y > TT + 6; y -= 15) { const y2 = Math.max(TT + 4, y - 15); brace += `M${TX0} ${y}L${TX1} ${y2}M${TX1} ${y}L${TX0} ${y2}`; hor += `M${TX0} ${y2}H${TX1}`; }
  // sky (bleeds well past the box: above it is the page colour, which is also the sky's top colour)
  c.drawRect(XY(-700, -700, 1746, 700), fillP(PLAIN));
  c.drawRect(XY(-700, 0, 1746, 300), fillP(LG(0, 0, 0, 299, G.sky)));
  ellG(c, 286, 298, 150, 70, G.dawn);
  ellG(c, 110, 96, 100, 4, G.hazeB); ellG(c, 250, 130, 110, 5, G.hazeB); ellG(c, 80, 214, 90, 4, G.hazeB, 0.8); ellG(c, 270, 236, 100, 4.5, G.hazeP, 0.7);
  ellG(c, 150, 268, 130, 4, G.hazeP); ellG(c, 260, 282, 110, 3.5, G.hazeP);
  c.drawPath(SP(coast), fillP("#5B626D", 0.85));
  c.drawRect(XY(-700, 298.5, 1746, 16), fillP(LG(0, 298, 0, 314, G.sea)));
  c.drawPath(SP(streaks), strokeP("#F3DCCB", 0.7, 0.4));
  c.drawPath(SP("M-700 312 L-140 312 Q-60 310 0 313 Q60 310 120 312 Q200 309 260 312 Q310 310 346 312 Q420 309 486 312 L1046 312 L1046 1100 L-700 1100Z"), fillP(LG(0, 312, 0, 380, G.land)));
  c.drawPath(SP(marsh), strokeP("#6B727A", 0.6, 0.35));
  // apron + shadow
  c.drawPath(SP("M136 352 L282 352 L300 366 L118 366Z"), fillP(LG(0, 352, 0, 366, G.apron), 0.85));
  c.drawOval(XY(SX - 62, 349, 124, 8), fillP("#1C1F23", 0.45));
  // tank farm
  c.drawPath(SP("M30 338 L28 352 M50 338 L52 352 M68 342 L66 352 M80 342 L82 352"), strokeP("#3A4047", 1.6));
  c.drawPath(SP("M-24 344 L-26 352 M-4 344 L-2 352"), strokeP("#3A4047", 1.4));
  tank(c, -14, 338, 10, 0.9);
  c.drawPath(SP("M360 352 V336 L392 330 L430 336 V352Z"), fillP("#3B4148"));
  c.drawPath(SP("M360 336 L392 330 L430 336"), strokeP("#7D8691", 0.6, 0.6));
  tank(c, 40, 330, 14); tank(c, 74, 335, 10);
  c.drawRRect(Skia.RRectXY(XY(16, 342, 46, 9), 4.5, 4.5), fillP(LG(0, 342, 0, 351, G.tankH)));
  c.drawRect(XY(88, 324, 11, 28), fillP(LG(0, 324, 0, 352, G.tankH)));
  c.drawOval(XY(88, 322.4, 11, 3.2), fillP("#DDE1E5"));
  c.drawPath(SP("M62 347 H137"), strokeP("#1F242A", 2.2));
  // tower
  c.drawRect(XY(TX0, TT, TX1 - TX0, GY - TT), fillP("#20252B", 0.18));
  c.drawPath(SP(`M118 ${TT + 4}V${GY}M132 ${TT + 4}V${GY}`), strokeP("#3B434C", 0.8, 0.6));
  c.drawPath(SP(brace), strokeP("#4B545F", 0.7));
  c.drawPath(SP(hor), strokeP("#3A424C", 0.9));
  c.drawPath(SP(`M${TX0} ${TT}V${GY}M${TX1} ${TT}V${GY}`), strokeP("#262C33", 2.6));
  c.drawPath(SP(`M${TX1 + 0.9} ${TT}V${GY}`), strokeP("#A3ACB7", 0.5, 0.45));
  c.drawRect(XY(TX0 - 4, TT - 4, TX1 - TX0 + 8, 5), fillP("#2A3037"));
  c.drawRect(XY(118, TT - 9, 14, 5), fillP("#2A3037"));
  c.drawPath(SP(`M${TX0 - 4} ${TT - 3.6}H${TX1 + 4}`), strokeP("#8D96A1", 0.5, 0.6));
  c.drawRect(XY(TX1 - 1, 106, 8, 26), fillP("#2A3037"));
  c.drawPath(SP(`M${TX1 + 1} 109v20M${TX1 + 5} 109v20`), strokeP("#59626C", 0.5));
  // tower gauge marks (same heights as the 25/50/75 ticks in the fuel window)
  for (const t of [0.25, 0.5, 0.75]) { const y = SB + SLY0 - t * SLLEN; c.drawPath(SP(`M${TX1 + 1} ${y}H${TX1 + 9}`), strokeP("#E8EEF4", 0.9, 0.8)); c.drawCircle(TX1 + 11, y, 1.3, fillP("#F2F6FA")); }
  // right mast
  c.drawPath(SP("M312 352 V170 M318 352 V170"), strokeP("#2B3138", 1));
  c.drawPath(SP(Array.from({ length: 30 }, (_, i) => `M312 ${352 - i * 6}L318 ${349 - i * 6}`).join("")), strokeP("#3F4750", 0.5));
  c.drawPath(SP("M315 170 V156"), strokeP("#2B3138", 0.8));
}

const HXR = 1.25, HXW = Math.sqrt(3) * HXR, HXH = 3 * HXR;
function hexD(cx: number, cy: number, r: number) { let d = ""; for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); d += (i ? "L" : "M") + f2(cx + r * Math.cos(a)) + " " + f2(cy + r * Math.sin(a)); } return d + "Z"; }
function stackPaths() {
  let seamD = "", seamL = "";
  for (let y = -14; y > BT + 6; y -= 14) { seamD += `M${-R} ${y}H${R}`; seamL += `M${-R} ${f1(y + 0.8)}H${R}`; }
  for (let y = BT - 14; y > NB - 1; y -= 14) { seamD += `M-3 ${y}H${R}`; seamL += `M-3 ${f1(y + 0.8)}H${R}`; }
  seamD += "M-15.6 -266H15.6M-12.6 -278H12.6"; seamL += "M-15.4 -265.2H15.4";
  let edge = "M-18 -170 L-3.6 -170";
  for (let y = -170, i = 0; y > -294; y -= 3, i++) edge += ` L${i % 2 ? -3.6 : -2.5} ${y - 3}`;
  return { seamD, seamL, edge, tiles: edge + " L-3 -296 L-20 -296 Z" };
}
/** The steel body up to (not including) the underside glow. Stack-local coords: base centre 0,0, nose at y = -H. */
function drawStackA(c: SkCanvas) {
  const sil = SP(SIL), P = stackPaths(), tiles = SP(P.tiles);
  c.drawPath(sil, fillP(LG(-R, 0, R, 0, G.steel)));
  c.save(); c.clipPath(sil, ClipOp.Intersect, true);
  c.drawPath(SP("M-14 -4V-290M-6.5 -4V-290M6 -4V-290M13.5 -4V-290"), strokeP("#FFFFFF", 0.5, 0.1));
  c.drawPath(SP("M-11 -4V-290M2.5 -4V-290M10 -4V-290"), strokeP("#3A4149", 0.45, 0.12));
  c.drawRect(XY(-20, -6, 40, 7), fillP("#2F353C", 0.5));
  c.drawRect(XY(-20, -300, 40, 300), fillP(LG(0, -300, 0, 0, G.shadeV)));
  c.drawPath(tiles, fillP(LG(-R, 0, -2.5, 0, G.tileG)));
  // hex tile pattern
  c.save(); c.clipPath(tiles, ClipOp.Intersect, true);
  let hx = "", hl = "";
  for (let j = Math.floor(-300 / (HXH / 2)); j <= Math.ceil(-166 / (HXH / 2)); j++) {
    const y = (j * HXH) / 2, off = Math.abs(j) % 2 ? HXW / 2 : 0;
    for (let m = Math.floor(-22 / HXW); m * HXW + off < 0; m++) hx += hexD(m * HXW + off, y, HXR);
  }
  for (let n = Math.floor(-300 / HXH); n * HXH < -166; n++) for (let m = Math.floor(-22 / HXW); m * HXW < 0; m++) hl += `M${f2(m * HXW + HXW / 2 - 0.6)} ${f2(n * HXH + HXH / 2 - 0.7)}h.9`;
  c.drawPath(SP(hx), strokeP("#0C0E11", 0.26, 0.6));
  c.drawPath(SP(hl), strokeP("#5A616A", 0.25, 0.45));
  c.restore();
  c.drawPath(SP(P.edge), strokeP("#C2C9D1", 0.4, 0.45));
  c.drawRect(XY(9.2, -160, 2.8, 154), fillP(LG(9.2, 0, 12, 0, G.race)));
  c.drawPath(SP("M12.3 -160V-6"), strokeP("#2F353C", 0.5, 0.45));
  c.drawPath(tiles, fillP(LG(-R, 0, -2.5, 0, G.tileG), 0.2));
  c.drawPath(SP(P.seamD), strokeP("#3E454D", 0.55, 0.5));
  c.drawPath(SP(P.seamL), strokeP("#FFFFFF", 0.45, 0.32));
  c.restore();
}
const SLIT_RR = () => Skia.RRectXY(XY(XL, CAP, SLW, SLY0 - CAP), SLW / 2, SLW / 2);
/** Fuel window frame and its dark glass. */
function drawStackB(c: SkCanvas) {
  const fr = Skia.RRectXY(XY(XL - 1.3, CAP - 1.3, SLW + 2.6, SLY0 - CAP + 2.6), SLW / 2 + 1.3, SLW / 2 + 1.3);
  c.drawRRect(fr, fillP("#3A424B")); c.drawRRect(fr, strokeP("#E6EBF0", 0.5, 0.7));
  c.save(); c.clipRRect(SLIT_RR(), ClipOp.Intersect, true);
  c.drawRect(XY(XL, CAP, SLW, SLY0 - CAP), fillP(LG(XL, 0, XL + SLW, 0, G.slitG)));
  c.restore();
}
/** Window ticks + glint, then the interstage band, grid fins, flaps and nose glint. */
function drawStackC(c: SkCanvas) {
  c.save(); c.clipRRect(SLIT_RR(), ClipOp.Intersect, true);
  c.drawPath(SP([0.25, 0.5, 0.75].map((t) => { const y = f1(SLY0 - t * SLLEN); return `M${f1(XL)} ${y}h2.2M${f1(XL + SLW - 2.2)} ${y}h2.2`; }).join("")), strokeP("#FFFFFF", 0.6, 0.75));
  c.drawRect(XY(XL + 1.1, CAP, 1.3, SLY0 - CAP), fillP("#FFFFFF", 0.28));
  c.restore();
  c.drawRect(XY(-R, BT, 2 * R, 8), fillP(LG(-R, 0, R, 0, G.band)));
  c.drawPath(SP(Array.from({ length: 8 }, (_, i) => `M${f1(-14 + i * 4)} ${BT + 2}v4`).join("")), strokeP("#0B0D10", 1.3));
  c.drawPath(SP(`M${-R} ${BT + 0.4}H${R}`), strokeP("#9EA6B0", 0.5, 0.7));
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -R : R, x1 = x0 + sx * 8.5;
    const body = SP(`M${x0} -161 L${x1} -162 L${x1} -151 L${x0} -151.5Z`);
    c.drawPath(body, fillP("#2E343B")); c.drawPath(body, strokeP("#1A1E23", 0.7));
    c.drawPath(SP(`M${f1(x0 + sx * 2.8)} -161.5V-151.3M${f1(x0 + sx * 5.6)} -161.8V-151.2M${x0} -157.8H${x1}M${x0} -154.6H${x1}`), strokeP("#8C949E", 0.35, 0.7));
    c.drawPath(SP(`M${x0} -161 L${x1} -162`), strokeP("#A9B1BB", 0.45, 0.6));
  }
  const flap = (sx: number, y0: number, y1: number, w: number) => {
    const x0 = sx * (y0 < -255 ? 16.4 : R), x1 = sx * (Math.abs(x0) + w);
    const p = SP(`M${f1(x0)} ${y0} L${f1(x1)} ${y0 + 5} L${f1(x1 + sx * 0.5)} ${y1 - 2} L${f1(sx * R)} ${y1}Z`);
    c.drawPath(p, fillP(bboxG(p, G.flap, "d")));
    c.drawPath(SP(`M${f1(x1)} ${y0 + 5} L${f1(x1 + sx * 0.5)} ${y1 - 2}`), strokeP("#8D96A1", 0.5, 0.7));
    c.drawPath(SP(`M${f1(x0)} ${y0} L${f1(sx * R)} ${y1}`), strokeP("#14171B", 0.8));
  };
  flap(-1, -266, -251, 5.6); flap(1, -266, -251, 5.6); flap(-1, -197, -174, 9); flap(1, -197, -174, 9);
  c.drawPath(SP("M-2.5 -293.2 Q0 -294.6 2.5 -293.2"), strokeP("#FFFFFF", 0.6, 0.55));
}
function drawLegs(c: SkCanvas) {
  c.drawPath(SP("M194 332 L195 350 M214 332 L213 350"), strokeP("#22262B", 3));
  const legs = SP("M179 332 L181 352 L187 352 L186 332Z M229 332 L227 352 L221 352 L222 332Z");
  c.drawPath(legs, fillP(bboxG(legs, G.leg, "h")));
  c.drawRect(XY(180, 349, 48, 3), fillP("#3E444B"));
}
function drawMount(c: SkCanvas) {
  c.drawPath(SP("M176 320 L232 320 L230.5 332 L177.5 332Z"), fillP(LG(0, 320, 0, 332, G.mount)));
  c.drawPath(SP("M176 320.5 H232"), strokeP("#A6AEB8", 0.7, 0.7));
  c.drawPath(SP(Array.from({ length: 6 }, (_, i) => `M${f1(183 + i * 8.4)} 322.5v8.5`).join("")), strokeP("#22272C", 0.7, 0.7));
}
function drawSign(c: SkCanvas) {
  c.drawPath(SP("M232 357 H334"), strokeP("#1C2025", 0.7, 0.7));
  c.drawPath(SP(Array.from({ length: 9 }, (_, i) => `M${236 + i * 12} 353.5V362`).join("")), strokeP("#1C2025", 1, 0.75));
  ellG(c, 272, 343, 40, 16, G.warm, 0.45);
  c.drawPath(SP("M254 352 V364 M290 352 V364"), strokeP("#23282E", 2));
  const board = Skia.RRectXY(XY(244, 334, 56, 18), 2, 2);
  c.drawRRect(board, fillP(LG(0, 334, 0, 352, G.sign))); c.drawRRect(board, strokeP("#2A2F35", 1));
  c.drawRRect(Skia.RRectXY(XY(252, 331.4, 40, 2.6), 1, 1), fillP("#2A2F35"));
  c.drawPath(SP("M253 334.6 H291"), strokeP("#FFF3D6", 1.2, 0.9));
}
function drawQd(c: SkCanvas) {
  drawArm(c, TX1, 145, 181, 146, 5, "#2C3239");
  c.drawRRect(Skia.RRectXY(XY(180, 141, 5.5, 10), 1, 1), fillP("#3A4048"));
  c.drawPath(SP("M180.5 141.5v9"), strokeP("#8C949E", 0.5));
}

/* ---------- rasterised flames (blurred shapes are drawn once into images) ---------- */
interface Img { img: SkImage | null; x: number; y: number; w: number; h: number }
function rasterize(draw: (c: SkCanvas) => void, x: number, y: number, w: number, h: number, pr: number): Img {
  const W = Math.ceil(w * pr), Hh = Math.ceil(h * pr);
  const pic = createPicture((c) => { c.scale(pr, pr); c.translate(-x, -y); draw(c); }, XY(0, 0, W, Hh));
  let img: SkImage | null = null;
  try { img = drawAsImageFromPicture(pic, { width: W, height: Hh }); } catch (e) { img = null; }
  return { img, x, y, w, h };
}
/** The plume in stack-local units (nozzle exit at y = 0, pointing down): outer flame and the white-hot core with shock diamonds. */
function plumeImages(k: number) {
  const L = LPk(k);
  const sh = (a: number, b: number, c: number, d: number, e: number) => `M${-a} 0 C${-b} ${f1(L * 0.1)} ${-c} ${f1(L * 0.32)} ${-c + 4} ${f1(L * d)} C${-c + 12} ${f1(L * (d + 0.2))} -10 ${f1(L * (e - 0.04))} 0 ${f1(L * e)} C10 ${f1(L * (e - 0.04))} ${c - 12} ${f1(L * (d + 0.2))} ${c - 4} ${f1(L * d)} C${c} ${f1(L * 0.32)} ${b} ${f1(L * 0.1)} ${a} 0Z`;
  const flame = rasterize((c) => {
    c.drawPath(SP(sh(21, 40, 82, 0.56, 1)), fillP(LG(0, 0, 0, L, G.plEdge), 1, 6));
    c.drawPath(SP(sh(19, 32, 60, 0.5, 0.88)), fillP(LG(0, 0, 0, L * 0.88, G.plBody), 1, 3));
  }, -108, -24, 216, L + 48, 1.4);
  const core = rasterize((c) => {
    c.drawPath(SP(sh(17, 24, 32, 0.36, 0.64)), fillP(LG(0, 0, 0, L * 0.64, G.plCore), 1, 1.1));
    for (let i = 0; i < 5; i++) { const y = 40 + i * 44, hw = 15 - i * 1.8, hh = 15 - i * 1.2; c.drawPath(SP(`M0 ${f1(y - hh)}L${f1(hw)} ${y}L0 ${f1(y + hh)}L${f1(-hw)} ${y}Z`), fillP("#FFFFFF", 0.95 - i * 0.14, 1.1)); }
    c.drawOval(XY(-20, -1.5, 40, 9), fillP("#FFFFFF", 1, 1.1));
    for (let i = 0; i < 13; i++) { const x = -15 + (30 * i) / 12, l = 16 + (i % 3) * 3 + (Math.abs(x) < 8 ? 4 : 0); c.drawPath(SP(`M${f1(x - 1.5)} 0 Q${f1(x - 2.2)} ${f1(l * 0.5)} ${f1(x)} ${f1(l)} Q${f1(x + 2.2)} ${f1(l * 0.5)} ${f1(x + 1.5)} 0Z`), fillP(LG(0, 0, 0, l, G.core))); }
  }, -42, -8, 84, L * 0.64 + 16, 2);
  return { flame, core, L };
}
/** Engine fire at the pad, deflected sideways by the mount (local: engine exits at 0,0). */
function fireImage() {
  return rasterize((c) => {
    ellG(c, 0, 14, 120, 22, G.warm);
    const e = SP("M-19 0 C-24 8 -50 12 -98 17 Q-60 25 0 24 Q60 25 98 17 C50 12 24 8 19 0Z"); c.drawPath(e, fillP(bboxG(e, G.plEdge), 1, 3));
    const b = SP("M-17 0 C-20 7 -34 12 -62 17 Q0 22 62 17 C34 12 20 7 17 0Z"); c.drawPath(b, fillP(bboxG(b, G.plBody), 1, 1.1));
    c.drawOval(XY(-46, 13.3, 92, 6.4), fillP("#FFF4DA", 1, 1.1));
    c.drawOval(XY(-19, -1, 38, 6), fillP("#FFFFFF", 1, 1.1));
    for (let i = 0; i < 13; i++) { const cx = -15 + (30 * i) / 12, l = 13 + (i % 3) * 2.5 + (Math.abs(cx) < 8 ? 3 : 0); c.drawPath(SP(`M${f1(cx - 1.4)} 0 Q${f1(cx - 2.1)} ${f1(l * 0.5)} ${f1(cx)} ${f1(l)} Q${f1(cx + 2.1)} ${f1(l * 0.5)} ${f1(cx + 1.4)} 0Z`), fillP(LG(0, 0, 0, l, G.core))); }
  }, -126, -10, 252, 50, 3);
}

/* ---------- sprite sheet (steam, vapour, bubbles, pulses, embers, sparkles) ---------- */
const SPR_STEAM = 0, SPR_STEAMW = 1, SPR_WISP = 2, SPR_TRAIL = 3, SPR_PUFF = 4, SPR_BUB = 5, SPR_PULSE = 6, SPR_EMBER = 7, SPR_SPARK = 8, SPR_BANK = 9;
const R0 = 24; // steam sprite radius
function steamBlob(c: SkCanvas, s: Stop[], gx: number, gy: number) {
  c.drawCircle(0, 0, R0, fillP(RG(-R0 + gx * 2 * R0, -R0 + gy * 2 * R0, 0.58 * 2 * R0, s), 1, 1.6));
}
function makeRocketSheet() {
  return makeSheet([
    { w: 56, h: 56, draw: (c) => steamBlob(c, G.steam, 0.44, 0.4) },
    { w: 56, h: 56, draw: (c) => steamBlob(c, G.steamW, 0.46, 0.62) },
    { w: 22, h: 13, draw: (c) => ellG(c, 0, 0, 10, 5.6, G.wisp) },
    { w: 34, h: 9, ax: 1, draw: (c) => ellG(c, 16, 0, 16, 3.7, G.wisp) },
    { w: 22, h: 14, draw: (c) => ellG(c, 0, 0, 10, 6, G.wisp) },
    { w: 5, h: 5, draw: (c) => c.drawCircle(0, 0, 2, fillP("#FFF6C8")) },
    { w: 18, h: 18, draw: (c) => { c.drawCircle(0, 0, 8, fillP(RG(0, 0, 8, G.pulse))); c.drawCircle(0, 0, 1.6, fillP("#FFFFFF")); } },
    { w: 5, h: 5, draw: (c) => c.drawCircle(0, 0, 2, fillP("#FFD9A0")) },
    { w: 12, h: 12, draw: (c) => drawStar(c, 5, "#FFE3A0") },
    { w: 92, h: 30, draw: (c) => ellG(c, 0, 0, 44, 13, G.steam, 1, [0.44, 0.4, 0.58]) },
  ]);
}

/* ---------- state-dependent layouts ---------- */
interface Cloud { n: number; x: number[]; y: number[]; r: number[]; o: number[]; t: number[]; spr: number[]; bx: number[]; by: number[]; bs: number[]; bd: number[]; bp: number[] }
const emptyCloud = (): Cloud => ({ n: 0, x: [], y: [], r: [], o: [], t: [], spr: [], bx: [], by: [], bs: [], bd: [], bp: [] });
const N_CLOUD = 48, N_COL = 28, N_EMB = 14;
/** Exhaust: the steam column under the plume and the ground cloud spreading from the mount (built for the launch placement). */
function cloudLayout(k: number) {
  const ey = launchY(k) + 2 * launchS(k), Lw = LPk(k) * launchS(k), r2 = seeded(77), top = ey + Lw * 0.6, br = seeded(58);
  const col = emptyCloud(), gnd = emptyCloud();
  const push = (q: Cloud, x: number, y: number, r: number, o: number, t: number, warm: boolean) => {
    q.x.push(x); q.y.push(y); q.r.push(r); q.o.push(o); q.t.push(t); q.spr.push(warm ? SPR_STEAMW : SPR_STEAM);
    const side = x < SX ? -1 : 1; q.bd.push(7000 + br() * 5000); q.bx.push(side * (2 + br() * 4)); q.by.push(-1 - br() * 3); q.bs.push(1.1 + br() * 0.12); q.bp.push(br() * 2); q.n++;
  };
  for (let y = top; y < 334 && col.n < N_COL; y += 7) { const t = (y - top) / (334 - top), r = 4 + t * 20, x = SX + (r2() - 0.5) * (3 + t * 18); push(col, x, y, r * (0.85 + r2() * 0.3), 0.5 + t * 0.45, t, t < 0.4); }
  const n = Math.round(30 + 10 * k), span = 118 + 50 * k, tmp: [number, number, number, number, boolean][] = [];
  for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, d = 6 + (i / n) * span + r2() * 12, r = 11 + (d / 170) * 16 + r2() * 8 + 4 * k; tmp.push([SX + side * d, 351 - r * 0.3 - r2() * 6 - Math.max(0, 1 - d / 80) * 8, r, d / (span + 20), d < 55]); }
  for (let j = 0; j < 8; j++) { const x = SX + (j - 3.5) * 13 + (r2() - 0.5) * 6, y = 330 - r2() * 14, r = 13 + r2() * 8; tmp.push([x, y, r, 0.1 + j * 0.03, true]); }
  tmp.reverse().slice(0, N_CLOUD).forEach((q) => push(gnd, q[0], q[1], q[2], 1, q[3], q[4]));
  // embers falling out of the plume
  const em = emptyCloud(), r3 = seeded(91), ar = seeded(92);
  for (let i = 0; i < N_EMB; i++) {
    const x = SX + (r3() - 0.5) * Lw * 0.22, y = ey + Lw * (0.2 + r3() * 0.5), r = 0.5 + r3() * 0.6, side = ar() < 0.5 ? -1 : 1;
    em.x.push(x); em.y.push(y); em.r.push(r); em.o.push(1); em.t.push(0); em.spr.push(SPR_EMBER);
    em.bd.push(1300 + ar() * 1200); em.bx.push(side * (8 + ar() * 22)); em.by.push(14 + ar() * 30); em.bs.push(0); em.bp.push(ar()); em.n++;
  }
  return { col, gnd, em, ey, Lw };
}
interface Vap { n: number; kind: number[]; spr: number[]; x: number[]; y: number[]; s: number[]; o: number[]; rel: number[]; d: number[]; ph: number[]; dx: number[]; dy: number[] }
const V_STATIC = 0, V_WISP = 1, V_TRAIL = 2, V_VENT = 3;
const N_VAPL = 22, N_PUFF = 14, N_VAP = N_VAPL + N_PUFF;
/** Cold vapour venting off the booster: wisps at the fuel level (move with it), the stream down the fuelled section, trails and two vents at the ship base. */
function vapourLayout(pct: number): Vap {
  const fy = fuelY(pct), vs = 0.75 + 0.45 * pct, rand = seeded(41), ar = seeded(57);
  const v: Vap = { n: 0, kind: [], spr: [], x: [], y: [], s: [], o: [], rel: [], d: [], ph: [], dx: [], dy: [] };
  const push = (kind: number, spr: number, x: number, y: number, s: number, o: number, rel: number, d = 1, ph = 0, dx = 0, dy = 0) => {
    if (v.n >= N_VAPL) return;
    v.kind.push(kind); v.spr.push(spr); v.x.push(x); v.y.push(y); v.s.push(s); v.o.push(o); v.rel.push(rel); v.d.push(d); v.ph.push(ph); v.dx.push(dx); v.dy.push(dy); v.n++;
  };
  const wisp = (x: number, y: number, rx: number, o: number, rel: number) => {
    const side = x < 0 ? -1 : 1, dx = side < 0 ? -(5 + ar() * 12) : 14 + ar() * 30, dy = 8 + ar() * 20, d = 3000 + ar() * 2600;
    push(V_WISP, SPR_WISP, x, y, rx / 10, o, rel, d, ar(), dx, dy);
  };
  if (pct > 0.001) {
    let i = 0;
    for (let y = fy + 14; y < -6; y += 22, i++) { const sx = i % 2 ? 1 : -1, x = sx * (R + 1 + rand() * 2), yy = y + rand() * 6, rx = 4 + rand() * 3; rand(); wisp(x, yy, rx, 0.4 + 0.25 * pct, 0); }
    const nt = pct < 0.3 ? 0 : Math.round(1 + pct * 3);
    for (let j = 0; j < nt; j++) { const y = -26 - j * 32 - rand() * 6; if (y < fy + 8) break; const cx = R + 14 + rand() * 8, rx = 13 + rand() * 6; rand(); push(V_TRAIL, SPR_TRAIL, cx - rx, y + 8, rx / 16, 0.42, 0, 2600 + ar() * 1800, ar()); }
    for (const [sx, d] of [[-1, 0], [1, 1]]) push(V_VENT, SPR_PUFF, sx * (R + 2), -174, (4 + 2 * pct) / 10, 0.5 + 0.4 * pct, 0, 5200, d * 0.5, sx);
  }
  // the vapour line at the fuel surface (relative to it, so it rides up with the fuel during an add)
  push(V_STATIC, SPR_WISP, -R - 4, 1, (5 * vs) / 10, 0.75, 1);
  push(V_STATIC, SPR_WISP, R + 5, 1.2, (6.5 * vs) / 10, 0.8, 1);
  push(V_STATIC, SPR_WISP, R + 14, 3.4, (8 * vs) / 10, 0.5, 1);
  [[-R - 2, 0], [-R - 1, 2], [R + 2, 0], [R + 3, 2], [R + 1, -1], [-R - 3, 1]].forEach(([x, y], i) => wisp(x, y, (5 + (i % 3)) * vs, 0.7, 1));
  return v;
}

/* ---------- add plan ---------- */
interface AddPlan { a0: number; a1: number; up: boolean; q: number; n: number; gap: number; r: number; c0: number; cd: number; stir: number; total: number; m: number; px: number[]; py: number[]; dx: number[]; dy: number[]; st: number[]; sz: number }
const EMPTY_ADD: AddPlan = { a0: 0, a1: 0, up: false, q: 0, n: 0, gap: 1, r: 1, c0: 0, cd: 1, stir: 900, total: 1, m: 0, px: [], py: [], dx: [], dy: [], st: [], sz: 5 };
function makeAddPlan(a0: number, a1: number, amount: number, up: boolean): AddPlan {
  const n = clamp(Math.round(2 + amount / 14), 3, 12), gap = Math.min(170, 1300 / n), r = 2.6 + Math.min(1.8, amount / 70), pulsesEnd = (n - 1) * gap + TRAVEL;
  const plan: AddPlan = { ...EMPTY_ADD, a0, a1, up, q: up ? 1 : 0, n, gap, r, px: [], py: [], dx: [], dy: [], st: [] };
  if (up) { plan.total = pulsesEnd + 80; return plan; }
  const c0 = TRAVEL * 0.9, cd = (n - 1) * gap + 600, m = clamp(Math.round(4 + amount / 16), 4, 14);
  plan.c0 = c0; plan.cd = cd; plan.stir = Math.max(900, cd / 2); plan.m = m; plan.sz = 5 + Math.min(4, amount / 40);
  let last = 0;
  for (let i = 0; i < m; i++) {
    const f = (0.82 * (i + 0.5)) / m, side = i % 2 ? 1 : -1;
    plan.px.push(side * (R + 2)); plan.py.push(fuelY(a0 + (a1 - a0) * (1 - Math.pow(1 - f, 2))));
    plan.dx.push(side * (14 + Math.random() * 26)); plan.dy.push(4 + Math.random() * 14); plan.st.push(c0 + f * cd); last = c0 + f * cd + 1000;
  }
  plan.total = Math.max(pulsesEnd, c0 + cd, last) + 80;
  return plan;
}

/* ---------- worklet maths for the timelines ---------- */
/** Liftoff pose at lt ms (lt < 0 = on the pad): [y, s, plumeW, plumeVis, plumeOn, arms, qdArm, lit]. lt >= D_LIFT is the launched pose. */
function liftPose(lt: number, k: number) {
  "worklet";
  if (lt < 0) return [SB, 1, 0.6, 0.03, 0, 0, 0, 0];
  const t = Math.min(lt, D_LIFT), endY = 110 - 24 * k, endS = 0.31 - 0.08 * k;
  const u = clamp((t - REL) / RISE, 0, 1), f = u * u * (2.6 - 1.6 * u);
  const y = SB + (endY - SB) * f, s = 1 + (endS - 1) * f, grow = clamp((t - IGN) / 600, 0, 1);
  return [y, s, (0.6 + 0.4 * grow) * (0.8 + 0.2 * f), Math.min(visAt(y, s, k), 0.03 + 0.97 * grow), clamp((t - IGN) / 200, 0, 1), clamp((t - REL - 100) / 900, 0, 1), clamp(t / 500, 0, 1), clamp((t - IGN) / 500, 0, 1)];
}
const WK_O = [0, ON / D_SF, (ON + 250) / D_SF, 0.45, (OFF - 100) / D_SF, (OFF + 300) / D_SF, 1], WK_V = [0, 0, 0.85, 0.65, 0.85, 0, 0];
/** Static fire light-wash opacity. */
function wk(ms: number) { "worklet"; return kf(ease(clamp(ms / D_SF, 0, 1)), WK_O, WK_V); }
function pipeLen(q: number) { "worklet"; const tip = TX1 + 41 * (1 - 0.52 * q) - 1; return 71 + 202.5 + Math.hypot(tip - 137, 1); }
/** Point at distance d along the propellant line (ground tanks -> up the tower -> along the QD arm into the ship). */
function pipeAt(d: number, q: number) {
  "worklet";
  const tip = TX1 + 41 * (1 - 0.52 * q) - 1;
  if (d <= 71) return [66 + d, 348.5];
  if (d <= 273.5) return [137, 348.5 - (d - 71)];
  const L3 = Math.hypot(tip - 137, 1), u = Math.min(1, (d - 273.5) / L3);
  return [137 + (tip - 137) * u, 146 + u];
}
const SLOSH_O = [0, 0.22, 0.5, 0.76, 1], STIR_O = [0, 0.2, 0.45, 0.7, 1];
function slosh(ms: number, stirMs: number, stirDur: number) {
  "worklet";
  if (stirMs >= 0 && stirMs < 2 * stirDur) { const e = easeInOut(frac(stirMs / stirDur)); return [kf(e, STIR_O, [0, 10, -9, 6, 0]), kf(e, STIR_O, [0, -0.6, 0.3, -0.4, 0])]; }
  const e = easeInOut(frac(ms / 3400));
  return [kf(e, SLOSH_O, [0, 7, -6, 4, 0]), kf(e, SLOSH_O, [0, -0.5, 0.3, -0.35, 0])];
}

/* ---------- small components ---------- */
/** A static ellipse with a radial gradient (unit circle scaled into place). */
function Glow({ cx, cy, rx, ry, g, opacity }: { cx: number; cy: number; rx: number; ry: number; g: { c: string[]; p: number[] }; opacity?: number }) {
  return (
    <Group transform={[{ translateX: cx }, { translateY: cy }, { scaleX: rx }, { scaleY: ry }]}>
      <Circle cx={0} cy={0} r={1} opacity={opacity}><RadialGradient c={vec(0, 0)} r={1} colors={g.c} positions={g.p} /></Circle>
    </Group>
  );
}
/** One Atlas driven by a derived [x, y, scale, alpha] * n array. */
function Sprites({ sheet, data, spr, n }: { sheet: Sheet; data: SharedValue<number[]>; spr: number[]; n: number }) {
  const rects = useMemo(() => Array.from({ length: n }, (_, i) => sheet.rects[spr[i] ?? 0]), [sheet, spr, n]);
  const ax = useMemo(() => Array.from({ length: n }, (_, i) => sheet.ax[spr[i] ?? 0]), [sheet, spr, n]);
  const ay = useMemo(() => Array.from({ length: n }, (_, i) => sheet.ay[spr[i] ?? 0]), [sheet, spr, n]);
  const inv = sheet.inv;
  const xf = useRSXformBuffer(n, (val, i) => {
    "worklet";
    const d = data.value, b = i * 4;
    if (!(d[b + 2] > 0) || !(d[b + 3] > 0.004)) hide(val); else place(val, d[b + 2], 0, d[b], d[b + 1], ax[i], ay[i], inv);
  });
  const cols = useColorBuffer(n, (val, i) => {
    "worklet";
    const a = data.value[i * 4 + 3];
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = a > 1 ? 1 : a > 0 ? a : 0;
  });
  if (!sheet.image) return null;
  return <Atlas image={sheet.image} sprites={rects} transforms={xf} colors={cols} colorBlendMode="modulate" />;
}
function FlameImage({ im, opacity }: { im: Img; opacity?: SharedValue<number> }) {
  if (!im.img) return null;
  return <Image image={im.img} x={im.x} y={im.y} width={im.w} height={im.h} fit="fill" opacity={opacity} />;
}

function useStatics() {
  return useMemo(() => {
    const pic = (draw: (c: SkCanvas) => void, b = XY(-700, -700, 1746, 1800)): SkPicture => createPicture(draw, b);
    const bells = Array.from({ length: 7 }, (_, i) => { const x = 189.5 + i * 4.4; return `M${f1(x - 1.4)} 332 L${f1(x + 1.4)} 332 L${f1(x + 2)} 337 L${f1(x - 2)} 337Z`; }).join("");
    const bellsL = Array.from({ length: 7 }, (_, i) => { const x = 189.5 + i * 4.4; return `M${f1(x - 2)} 337 H${f1(x + 2)}`; }).join("");
    return {
      bg: pic(drawBg),
      dashes: SP([0.25, 0.5, 0.75].map((t) => { const y = SB + SLY0 - t * SLLEN; return `M${TX1 + 14} ${y}H${SX - R - 4}`; }).join("")),
      armU: pic((c) => drawArm(c, 147, 116, 174, 110, 5, "#262B32")),
      armL: pic((c) => drawArm(c, 147, 120, 176, 125, 5.6, "#323840")),
      qd: pic(drawQd),
      pipe: SP("M66 348.5 L137 348.5 L137 146"),
      bells: SP(bells), bellsL: SP(bellsL),
      legs: pic(drawLegs), mount: pic(drawMount), sign: pic(drawSign),
      stackA: pic(drawStackA, XY(-40, -320, 80, 340)), stackB: pic(drawStackB, XY(-40, -320, 80, 340)), stackC: pic(drawStackC, XY(-40, -320, 80, 340)),
      sil: SP(SIL), slit: SLIT_RR(),
      surfL1: SP(`M${-SLW / 2} .6 Q0 -.9 ${SLW / 2} .6`), surfL2: SP(`M${-SLW / 2} 1.6 Q0 .5 ${SLW / 2} 1.6`),
      fire: fireImage(),
      sheet: makeRocketSheet(),
    };
  }, []);
}

/* ---------- scene ---------- */
const Scene = forwardRef<SceneHandle, SceneProps>(function RocketScene({ state, width, height, motion }, ref) {
  const fit = useMemo(() => fitBox(BOX, width, height), [width, height]);
  const pct = clamp(state.pct || 0, 0, 1), goal = state.goal || 3000, surplus = state.surplus || 0;
  const up = pct >= 0.9999, k = up ? clamp(surplus / goal, 0, 1) : 0;
  const label = fmt(goal), font = useFont(FONT, label.length > 6 ? 10 : 11.5);
  const S = useStatics();
  const plume = useMemo(() => plumeImages(k), [k]);
  const CL = useMemo(() => cloudLayout(k), [k]);
  const V = useMemo(() => vapourLayout(pct), [pct]);
  const stRef = useRef(state); stRef.current = state;

  const clock = useSharedValue(0);
  // Accumulate deltas: timeSinceFirstFrame restarts whenever the callback is re-registered.
  useFrameCallback((f) => { clock.value += Math.min(f.timeSincePreviousFrame ?? 0, 100) / 1000; });
  const addT = useSharedValue(0), msT = useSharedValue(0), msKind = useSharedValue(NONE), hold = useSharedValue(0);
  const addP = useSharedValue<AddPlan>(EMPTY_ADD);
  const running = useRef(false), msGen = useRef(0), holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null; };

  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => {
      const st = stRef.current, g = st.goal || 3000, a0 = clamp(st.pct || 0, 0, 1), isUp = a0 >= 0.9999, a1 = clamp(a0 + (amount || 0) / g, 0, 1);
      const plan = makeAddPlan(a0, a1, amount || 0, isUp), cross = !isUp && a1 >= 0.9999;
      cancelAnimation(addT); addT.value = 0;
      if (!running.current) { msKind.value = NONE; msT.value = 0; }
      addP.value = plan;
      // Crossing the goal: stay on the pad (full) until the host starts the liftoff milestone, so the launched pose never flashes first.
      const done = () => { if (cross) { clearHold(); holdTimer.current = setTimeout(() => { hold.value = 0; }, 900); } res(); };
      addT.value = withTiming(1, { reduceMotion: ReduceMotion.Never, duration: motion ? plan.total : 0, easing: Easing.linear }, (fin) => { if (cross && fin) hold.value = 1; runOnJS(done)(); });
    }),
    playMilestone: (p) => new Promise<void>((res) => {
      const st = stRef.current, isUp = clamp(st.pct || 0, 0, 1) >= 0.9999, kind = p >= 100 ? LIFT : isUp ? TH : SF, gen = ++msGen.current;
      cancelAnimation(msT); clearHold();
      msKind.value = kind; msT.value = 0; hold.value = 0;
      running.current = true;
      const done = () => { if (msGen.current === gen) running.current = false; res(); };
      msT.value = withTiming(1, { reduceMotion: ReduceMotion.Never, duration: motion ? durOf(kind) : 0, easing: Easing.linear }, () => { runOnJS(done)(); });
    }),
    cancel: () => {
      msGen.current++; running.current = false; clearHold();
      cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0; msKind.value = NONE; hold.value = 0;
    },
  }), [motion]);
  // The host re-renders at the new state once an add resolves: the climb is then baked into `pct`.
  // A finished milestone is dropped too (the liftoff's end pose IS the launched render); one still playing carries on.
  useEffect(() => { cancelAnimation(addT); addT.value = 0; if (!running.current) { msKind.value = NONE; msT.value = 0; } }, [pct, surplus, goal]);
  useEffect(() => () => clearHold(), []);

  /* ---- timelines ---- */
  const lt = useDerivedValue(() => { if (msKind.value === LIFT) return msT.value * D_LIFT; if (hold.value > 0) return -1; return up ? D_LIFT : -1; });
  const msMs = useDerivedValue(() => msT.value * durOf(msKind.value));
  const live = useDerivedValue(() => msT.value > 0 && msT.value < 1);
  const pose = useDerivedValue(() => liftPose(lt.value, k));
  const fuel = useDerivedValue(() => {
    let p = pct;
    const a = addP.value, t = addT.value;
    if (t > 0 && !a.up) { const c = clamp((t * a.total - a.c0) / a.cd, 0, 1); p = a.a0 + (a.a1 - a.a0) * (1 - (1 - c) * (1 - c)); }
    const l = lt.value;
    if (l >= 0) p += (1 - p) * easeInOut(clamp(l / REL, 0, 1)); // tops off during the hold-down
    return p;
  });
  const fy = useDerivedValue(() => SLY0 - fuel.value * SLLEN);

  /* ---- scene transforms ---- */
  const camT = useDerivedValue(() => {
    let r = [0, 0];
    if (msKind.value === LIFT && live.value) r = rumble(msMs.value - (IGN + 60), 3700, 3, 2.2);
    return [{ translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.scale }, { translateX: r[0] }, { translateY: r[1] }];
  });
  const lightO = [0, 1].map((g) => useDerivedValue(() => kf(ease(frac(clock.value / 2 + g * 0.5)), [0, 0.4, 0.5, 0.95, 1], [1, 1, 0.12, 0.12, 1])));
  const dashO = useDerivedValue(() => { const l = lt.value; return 0.28 * (l < 0 ? 1 : 1 - clamp(l / 1500, 0, 1)); });
  const armUT = useDerivedValue(() => [{ rotate: rad(-24 * pose.value[5]) }]);
  const armLT = useDerivedValue(() => [{ rotate: rad(22 * pose.value[5]) }]);
  const qdT = useDerivedValue(() => [{ translateX: TX1 }, { scaleX: 1 - 0.52 * pose.value[6] }, { translateX: -TX1 }]);
  const pipeEnd = useDerivedValue(() => vec(TX1 + 41 * (1 - 0.52 * pose.value[6]) - 1, 147));
  const washO = useDerivedValue(() => pose.value[7]);
  const bellsO = useDerivedValue(() => (lt.value < IGN + 200 ? 1 : 0));
  const flkBay = useDerivedValue(() => kf(easeInOut(frac(clock.value / 1.6)), [0, 0.5, 1], [1, 0.6, 1]));
  const bayO = useDerivedValue(() => {
    const kd = msKind.value, l = lt.value;
    if (kd === SF && live.value) return wk(msMs.value);
    if (l < 0) return 0;
    const m = 1 + (flkBay.value - 1) * clamp((l - REL) / 1000, 0, 1);
    if (l < D_LIFT) return kf(ease(l / D_LIFT), [0, IGN / D_LIFT, (IGN + 150) / D_LIFT, REL / D_LIFT, 1], [0, 0, 1, 0.9, 0.5]) * m;
    return 0.5 * m;
  });
  const posT = useDerivedValue(() => [{ translateX: SX }, { translateY: pose.value[0] }, { scale: pose.value[1] }]);
  const plumeT = useDerivedValue(() => [{ translateY: 2 }, { scaleX: pose.value[2] }, { scaleY: pose.value[3] }]);
  const plumeO = useDerivedValue(() => pose.value[4]);
  const flickT = useDerivedValue(() => {
    const e = ease(frac(clock.value / 0.42));
    let sx = kf(e, FL_O, FL_X), sy = kf(e, FL_O, FL_Y);
    if (msKind.value === TH && live.value) { const q = easeInOut(msT.value), o = [0, 0.3, 0.7, 1]; sx *= kf(q, o, [1, 1.15, 1.1, 1]); sy *= kf(q, o, [1, 1.25, 1.2, 1]); }
    return [{ scaleX: sx }, { scaleY: sy }];
  });
  const coreO = useDerivedValue(() => kf(ease(frac(clock.value / 0.23)), [0, 0.25, 0.5, 0.75, 1], [1, 0.78, 0.97, 0.82, 1]));
  const pglowO = useDerivedValue(() => kf(ease(frac(clock.value / 0.38)), [0, 1 / 3, 2 / 3, 1], [0.85, 0.66, 0.9, 0.85]));
  const stackT = useDerivedValue(() => {
    const r = msKind.value === SF && live.value ? rumble(msMs.value - (ON + 100), OFF - ON, 2.2, 1.2) : [0, 0];
    return [{ translateX: r[0] }, { translateY: r[1] }];
  });
  const underO = useDerivedValue(() => Math.max(pose.value[7], msKind.value === SF && live.value ? wk(msMs.value) : 0));

  /* ---- fuel window ---- */
  const fuelO = useDerivedValue(() => (fuel.value > 0.001 ? 1 : 0));
  const fuelRect = useDerivedValue(() => ({ x: XL, y: fy.value, width: SLW, height: SLY0 - fy.value + 4 }));
  const fvStart = useDerivedValue(() => vec(0, fy.value));
  const fvEnd = useDerivedValue(() => vec(0, SLY0 + 4));
  const surfT = useDerivedValue(() => {
    const a = addP.value, t = addT.value, stirMs = t > 0 && t < 1 && !a.up ? t * a.total - a.c0 : -1;
    const s = slosh(clock.value * 1000, stirMs, a.stir);
    return [{ translateX: SLX }, { translateY: fy.value + s[1] }, { rotate: rad(s[0]) }];
  });
  const surfO = useDerivedValue(() => (fuel.value > 0.001 && fuel.value < 0.999 ? 1 : 0));
  const fglowT = useDerivedValue(() => [{ translateX: SLX }, { translateY: (fy.value + SLY0) / 2 }, { scaleX: SLW * 1.6 }, { scaleY: Math.max(6, (SLY0 - fy.value) / 2 + 6) }]);
  const fglowO = useDerivedValue(() => (fuel.value > 0.001 ? (fuel.value >= 0.999 ? 0.9 : 0.6) : 0));

  /* ---- sprites ---- */
  const bubD = useDerivedValue(() => {
    const out = new Array(9 * 4).fill(0);
    if (fuel.value <= 0.001) return out;
    const ms = clock.value * 1000;
    for (let i = 0; i < 9; i++) {
      const e = frac(ms / BUB_D[i] + BUB_PH[i]), o = [0, 0.55, 1], b = i * 4;
      out[b] = BUB_X[i] + kf(e, o, [0, BUB_DX[i], -BUB_DX[i] * 0.5]);
      out[b + 1] = BUB_Y[i] + kf(e, o, [3, -BUB_RISE[i] * 0.5, -BUB_RISE[i]]);
      out[b + 2] = (BUB_R[i] / 2) * kf(e, o, [0.5, 0.9, 1.15]);
      out[b + 3] = kf(e, [0, 0.18, 1], [0, 0.85, 0]);
    }
    return out;
  });
  const vapD = useDerivedValue(() => {
    const out = new Array(N_VAP * 4).fill(0);
    const p = fuel.value, y0 = fy.value, l = lt.value, ms = clock.value * 1000;
    const vis = (p > 0.001 ? 1 : 0) * (l < 0 ? 1 : 1 - clamp(l / 1400, 0, 1));
    if (vis > 0) {
      for (let i = 0; i < V.n; i++) {
        const b = i * 4, x = V.x[i], y = V.y[i] + (V.rel[i] ? y0 : 0), o = V.o[i] * vis, kd = V.kind[i];
        if (kd === V_STATIC) { out[b] = x; out[b + 1] = y; out[b + 2] = V.s[i]; out[b + 3] = o; }
        else if (kd === V_WISP) { const e = easeOut(frac(ms / V.d[i] + V.ph[i])); out[b] = x + V.dx[i] * e; out[b + 1] = y + V.dy[i] * e; out[b + 2] = V.s[i] * (0.5 + 1.6 * e); out[b + 3] = kf(e, [0, 0.22, 1], [0, o, 0]); }
        else if (kd === V_TRAIL) { const e = easeInOut(frac(ms / V.d[i] + V.ph[i])), q = e < 0.5 ? e * 2 : (1 - e) * 2; out[b] = x; out[b + 1] = y; out[b + 2] = V.s[i] * (0.8 + 0.45 * q); out[b + 3] = (0.2 + 0.3 * q) * vis; }
        else { const e = easeOut(frac(ms / V.d[i] + V.ph[i])), sx = V.dx[i], of = [0, 0.62, 0.68, 1]; out[b] = x + kf(e, of, [0, 0, sx * 4, sx * 16]); out[b + 1] = y + kf(e, of, [0, 0, 0, 6]); out[b + 2] = V.s[i] * kf(e, of, [0.3, 0.3, 1, 2.4]); out[b + 3] = kf(e, of, [0, 0, o, 0]); }
      }
    }
    const a = addP.value, t = addT.value;
    if (t > 0 && t < 1 && !a.up) {
      const am = t * a.total;
      for (let j = 0; j < a.m && j < N_PUFF; j++) {
        const u = (am - a.st[j]) / 1000;
        if (u < 0 || u > 1) continue;
        const e = easeOut(u), o = [0, 0.25, 1], b = (N_VAPL + j) * 4;
        out[b] = a.px[j] + kf(e, o, [0, a.dx[j] * 0.35, a.dx[j]]); out[b + 1] = a.py[j] + kf(e, o, [0, a.dy[j] * 0.2, a.dy[j]]);
        out[b + 2] = (a.sz / 10) * kf(e, o, [0.4, 1.1, 2.4]); out[b + 3] = kf(e, o, [0, 0.9, 0]);
      }
    }
    return out;
  });
  const vapSpr = useMemo(() => Array.from({ length: N_VAP }, (_, i) => (i < V.n ? V.spr[i] : SPR_PUFF)), [V]);
  const gndD = useDerivedValue(() => {
    const out = new Array(N_CLOUD * 4).fill(0), l = lt.value, q = CL.gnd;
    if (l < IGN) return out;
    const ms = clock.value * 1000;
    for (let i = 0; i < q.n; i++) {
      const p = clamp((l - (IGN + 150 + q.t[i] * 1500)) / 1600, 0, 1);
      if (p <= 0) continue;
      const e = bezier(0.2, 0.8, 0.2, 1, p), bl = easeInOut(tri(ms / q.bd[i] + q.bp[i])), b = i * 4;
      out[b] = q.x[i] + q.bx[i] * bl; out[b + 1] = q.y[i] + 6 * (1 - e) + q.by[i] * bl;
      out[b + 2] = (q.r[i] / R0) * (0.15 + 0.85 * e) * (1 + (q.bs[i] - 1) * bl); out[b + 3] = q.o[i] * e;
    }
    return out;
  });
  const colD = useDerivedValue(() => {
    const out = new Array(N_COL * 4).fill(0), l = lt.value, q = CL.col;
    if (l < IGN) return out;
    const ms = clock.value * 1000;
    for (let i = 0; i < q.n; i++) {
      const p = clamp((l - (REL + 200 + (1 - q.t[i]) * 2300)) / 800, 0, 1);
      if (p <= 0) continue;
      const e = bezier(0.2, 0.8, 0.2, 1, p), bl = easeInOut(tri(ms / q.bd[i] + q.bp[i])), b = i * 4;
      out[b] = q.x[i] + q.bx[i] * bl; out[b + 1] = q.y[i] + q.by[i] * bl;
      out[b + 2] = (q.r[i] / R0) * (0.3 + 0.7 * e) * (1 + (q.bs[i] - 1) * bl); out[b + 3] = q.o[i] * e;
    }
    return out;
  });
  const embD = useDerivedValue(() => {
    const out = new Array(N_EMB * 4).fill(0), l = lt.value, q = CL.em;
    if (l < D_LIFT - 600) return out;
    const ramp = clamp((l - (D_LIFT - 600)) / 600, 0, 1), ms = clock.value * 1000;
    for (let i = 0; i < q.n; i++) {
      const e = easeOut(frac(ms / q.bd[i] + q.bp[i])), b = i * 4;
      out[b] = q.x[i] + q.bx[i] * e; out[b + 1] = q.y[i] + q.by[i] * e; out[b + 2] = (q.r[i] / 2) * (1 - 0.6 * e); out[b + 3] = kf(e, [0, 0.15, 1], [0, 1, 0]) * ramp;
    }
    return out;
  });
  // fx: steam out of the trench (2 banks + particles) and, on top, prop-load pulses and throttle-up sparkles
  const N_STFX = 2 + N_ST, N_TOP = 12 + N_SPK;
  const stD = useDerivedValue(() => {
    const out = new Array(N_STFX * 4).fill(0), kd = msKind.value;
    if (!live.value || (kd !== SF && kd !== LIFT)) return out;
    const ms = msMs.value, lo = kd === LIFT, start = lo ? IGN + 80 : ON + 120, span = lo ? 2600 : D_SF - ON - 400, count = lo ? 34 : 42, gy = 347;
    for (let j = 0; j < 2; j++) {
      const side = j ? 1 : -1, p = (ms - start) / span;
      if (p < 0 || p > 1) continue;
      const e = easeOut(p), o = [0, 0.4, 1];
      out[j * 4] = SX + side * 30 + kf(e, o, [0, side * 40, side * 90]); out[j * 4 + 1] = gy + kf(e, o, [0, -6, -18]); out[j * 4 + 2] = kf(e, o, [0.2, 1.4, 2.3]); out[j * 4 + 3] = kf(e, o, [0, 0.95, 0]);
    }
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1, dl = start + (i / count) * span * 0.5, p = (ms - dl) / ST_DUR[i];
      if (p < 0 || p > 1) continue;
      const e = easeOut(p), o = [0, 0.3, 1], b = (2 + i) * 4;
      out[b] = SX + side * ST_OX[i] + kf(e, o, [0, side * ST_DIST[i] * 0.4, side * ST_DIST[i]]); out[b + 1] = gy + kf(e, o, [0, -ST_RISE[i] * 0.25, -ST_RISE[i]]);
      out[b + 2] = (ST_R[i] / R0) * kf(e, o, [0.35, 1.15, ST_ES[i]]); out[b + 3] = kf(e, o, [0, 0.95, 0]);
    }
    return out;
  });
  const stSpr = useMemo(() => [SPR_BANK, SPR_BANK, ...ST_W.map((w) => (w ? SPR_STEAMW : SPR_STEAM))], []);
  const thY = launchY(k) + 30 * launchS(k);
  const topD = useDerivedValue(() => {
    const out = new Array(N_TOP * 4).fill(0), t = addT.value;
    if (t > 0 && t < 1) {
      const a = addP.value, ms = t * a.total, len = pipeLen(a.q);
      for (let i = 0; i < a.n && i < 12; i++) {
        const u = (ms - i * a.gap) / TRAVEL;
        if (u < 0 || u > 1) continue;
        const pt = pipeAt(u * len, a.q), b = i * 4;
        out[b] = pt[0]; out[b + 1] = pt[1]; out[b + 2] = a.r / 4; out[b + 3] = u < 0.06 ? u / 0.06 : u > 0.94 ? (1 - u) / 0.06 : 1;
      }
    }
    if (msKind.value === TH && live.value) {
      const ms = msMs.value;
      for (let j = 0; j < N_SPK; j++) {
        const p = ms / SPK_T[j];
        if (p < 0 || p > 1) continue;
        const e = easeOut(p), o = [0, 0.6, 1], d = kf(e, o, [0, SPK_D[j], SPK_D[j] * 1.25]), b = (12 + j) * 4;
        out[b] = SX + Math.cos(SPK_A[j]) * d; out[b + 1] = thY + Math.sin(SPK_A[j]) * d; out[b + 2] = (SPK_S[j] / 5) * kf(e, o, [0, 1.1, 0.2]); out[b + 3] = kf(e, o, [1, 1, 0]);
      }
    }
    return out;
  });
  const topSpr = useMemo(() => [...Array.from({ length: 12 }, () => SPR_PULSE), ...Array.from({ length: N_SPK }, () => SPR_SPARK)], []);

  /* ---- milestone fx ---- */
  const sfWashO = useDerivedValue(() => (msKind.value === SF && live.value ? wk(msMs.value) : 0));
  const flashO = useDerivedValue(() => (msKind.value === LIFT && live.value ? kf(ease(msT.value), [0, IGN / D_LIFT, (IGN + 160) / D_LIFT, (IGN + 900) / D_LIFT, 1], [0, 0, 1, 0.4, 0]) : 0));
  const fireP = useDerivedValue(() => {
    const kd = msKind.value;
    if (!live.value) return [0.001, 0.001, 0];
    if (kd === SF) { const e = easeInOut(msT.value); return [kf(e, SF_O, SF_X), kf(e, SF_O, SF_Y), kf(e, SF_O, SF_A)]; }
    if (kd === LIFT) { const e = easeInOut(msT.value); return [kf(e, LO_O, LO_X), kf(e, LO_O, LO_Y), kf(e, LO_O, LO_A)]; }
    return [0.001, 0.001, 0];
  });
  const fireT = useDerivedValue(() => [{ translateX: SX }, { translateY: 333 - 8 }, { scaleX: Math.max(0.001, fireP.value[0]) }, { scaleY: Math.max(0.001, fireP.value[1]) }, { translateY: 8 }]);
  const fireO = useDerivedValue(() => fireP.value[2]);

  /* ---- state-dependent statics ---- */
  const launchEy = CL.ey, launchLw = CL.Lw, L = plume.L;
  const labelX = font ? 272 - textW(font, label) / 2 : 0;

  return (
    <Canvas style={{ width, height }}>
      <Group transform={camT}>
        <Picture picture={S.bg} />
        <Path path={S.dashes} color="#E8EEF4" style="stroke" strokeWidth={0.5} opacity={dashO}><DashPathEffect intervals={[1, 3]} /></Path>
        {[0, 1].map((g) => (
          <Group key={g} opacity={lightO[g]}>
            {LIGHTS.filter((q) => q[2] === g).map(([x, y], i) => (
              <Group key={i}>
                <Circle cx={x} cy={y} r={7}><RadialGradient c={vec(x, y)} r={7} colors={GC.lamp.c} positions={GC.lamp.p} /></Circle>
                <Circle cx={x} cy={y} r={1.5} color="#FF4A3A" />
              </Group>
            ))}
          </Group>
        ))}
        <Group origin={vec(147, 116)} transform={armUT}><Picture picture={S.armU} /></Group>
        <Group origin={vec(147, 120)} transform={armLT}><Picture picture={S.armL} /></Group>
        <Path path={S.pipe} color="#1E2329" style="stroke" strokeWidth={1.6} />
        <Line p1={vec(137, 146)} p2={pipeEnd} color="#1E2329" strokeWidth={1.6} strokeCap="square" />
        <Line p1={vec(137.6, 348)} p2={vec(137.6, 146)} color="#7E8792" strokeWidth={0.4} opacity={0.4} />
        {/* warm light on the scene once lit */}
        <Group opacity={washO}>
          <Glow cx={SX} cy={launchEy + launchLw * 0.45} rx={120} ry={launchLw * 0.9} g={GC.warm} opacity={0.55} />
          <Glow cx={SX} cy={322} rx={250} ry={110} g={GC.warm} opacity={0.6} />
          <Glow cx={(TX0 + TX1) / 2} cy={300} rx={46} ry={190} g={GC.warm} opacity={0.55} />
        </Group>
        {/* engine bay */}
        <Rect x={185} y={332} width={38} height={18}><LinearGradient start={vec(0, 332)} end={vec(0, 350)} colors={GC.bay.c} positions={GC.bay.p} /></Rect>
        <Group opacity={bellsO}>
          <Path path={S.bells} color="#3C4249" />
          <Path path={S.bellsL} color="#7D858F" style="stroke" strokeWidth={0.4} />
        </Group>
        <Group transform={[{ translateX: SX }, { translateY: 341 }, { scaleX: 30 }, { scaleY: 12 }]}>
          <Circle cx={0} cy={0} r={1} opacity={bayO}><RadialGradient c={vec(0, 0)} r={1} colors={GC.bayGlow.c} positions={GC.bayGlow.p} /></Circle>
        </Group>
        <Picture picture={S.legs} />
        <Sprites sheet={S.sheet} data={gndD} spr={CL.gnd.spr} n={N_CLOUD} />
        <Picture picture={S.mount} />
        <Sprites sheet={S.sheet} data={colD} spr={CL.col.spr} n={N_COL} />
        {/* the stack and its plume */}
        <Group transform={posT}>
          <Group transform={plumeT} opacity={plumeO}>
            <Group transform={[{ translateY: L * 0.38 }, { scaleX: 130 }, { scaleY: L * 0.62 }]}>
              <Circle cx={0} cy={0} r={1} opacity={pglowO}><RadialGradient c={vec(0, 0)} r={1} colors={GC.warm.c} positions={GC.warm.p} /></Circle>
            </Group>
            <Group origin={vec(0, -1.5)} transform={flickT}>
              <FlameImage im={plume.flame} />
              <FlameImage im={plume.core} opacity={coreO} />
            </Group>
          </Group>
          <Group transform={stackT}>
            <Picture picture={S.stackA} />
            <Group clip={S.sil}>
              <Rect x={-20} y={-110} width={40} height={112} opacity={underO}><LinearGradient start={vec(0, -110)} end={vec(0, 0)} colors={GC.underG.c} positions={GC.underG.p} /></Rect>
            </Group>
            <Group transform={fglowT}>
              <Circle cx={0} cy={0} r={1} opacity={fglowO}><RadialGradient c={vec(0, 0)} r={1} colors={GC.fuelGlow.c} positions={GC.fuelGlow.p} /></Circle>
            </Group>
            <Picture picture={S.stackB} />
            <Group clip={S.slit}>
              <Rect rect={fuelRect} opacity={fuelO}><LinearGradient start={vec(XL, 0)} end={vec(XL + SLW, 0)} colors={GC.fuel.c} positions={GC.fuel.p} /></Rect>
              <Rect rect={fuelRect} opacity={fuelO}><LinearGradient start={fvStart} end={fvEnd} colors={GC.fuelV.c} positions={GC.fuelV.p} /></Rect>
              <Group transform={surfT} opacity={surfO}>
                <Rect x={-SLW} y={-0.15} width={2 * SLW} height={1.8}><LinearGradient start={vec(-SLW, 0)} end={vec(SLW, 0)} colors={GC.fuel.c} positions={GC.fuel.p} /></Rect>
                <Rect x={-SLW} y={-0.15} width={2 * SLW} height={1.8} color="#FFF3B0" opacity={0.45} />
                <Path path={S.surfL1} color="#FFF7CF" style="stroke" strokeWidth={0.9} />
                <Path path={S.surfL2} color="#FFFBE6" style="stroke" strokeWidth={0.4} opacity={0.45} />
              </Group>
              <Group clip={fuelRect}>
                <Sprites sheet={S.sheet} data={bubD} spr={BUB_SPR} n={9} />
              </Group>
            </Group>
            <Picture picture={S.stackC} />
            <Sprites sheet={S.sheet} data={vapD} spr={vapSpr} n={N_VAP} />
          </Group>
        </Group>
        <Sprites sheet={S.sheet} data={embD} spr={CL.em.spr} n={N_EMB} />
        <Group transform={qdT}><Picture picture={S.qd} /></Group>
        <Picture picture={S.sign} />
        {font && <Text x={labelX} y={347.6} text={label} font={font} color="#262C35" />}
        {/* fx */}
        <Group opacity={sfWashO}>
          <Glow cx={SX} cy={336} rx={230} ry={140} g={GC.warm} />
          <Rect x={TX0 - 6} y={120} width={TX1 - TX0 + 12} height={GY - 120}><LinearGradient start={vec(0, 120)} end={vec(0, GY)} colors={GC.towerWash.c} positions={GC.towerWash.p} /></Rect>
        </Group>
        <Group opacity={flashO}><Glow cx={SX} cy={336} rx={160} ry={90} g={GC.warm} /></Group>
        <Sprites sheet={S.sheet} data={stD} spr={stSpr} n={N_STFX} />
        <Group transform={fireT}><FlameImage im={S.fire} opacity={fireO} /></Group>
        <Sprites sheet={S.sheet} data={topD} spr={topSpr} n={N_TOP} />
      </Group>
    </Canvas>
  );
});
const BUB_SPR = Array.from({ length: 9 }, () => SPR_BUB);

export const DEF: VisualDef = { key: "rocket", box: BOX, plain: PLAIN, backgrounds: {}, Scene };
