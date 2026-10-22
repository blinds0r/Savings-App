/* Crow's hoard: a crow guarding an open treasure chest (port of the prototype's visuals/crow.js).
 * Chosen options: idle "Admiring", add "Arc away" (realistic flight), milestone "Victory caw + crown",
 * background "Dusty attic" (backgrounds/crow.js [3]). */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Atlas, Canvas, Circle, Group, LinearGradient, Oval, Path, Picture, Rect, RoundedRect, Skia, PaintStyle, StrokeCap, TileMode, Text, createPicture, useColorBuffer, useFont, useRSXformBuffer, vec, type SkCanvas, type SkFont, type SkPicture, type SkRect } from "@shopify/react-native-skia";
import { cancelAnimation, runOnJS, useDerivedValue, useFrameCallback, useSharedValue, withTiming, Easing, type SharedValue , ReduceMotion } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import { fitBox } from "../contract";
import type { VisualState } from "../../model/types";
import { bezier, clamp, cycleAt, ease, easeInOut, easeOut, hash, intervals, kf, rad, rnd, seeded } from "../shared/anim";
import { coinKey, coinPicture, drawCoin, drawStar, heap, heapPicture, type Coin } from "../shared/coins";
import { drawGem, drawRing } from "../shared/treasure";
import { hide, makeSheet, place } from "../shared/sprites";

const BOX = { x: 0, y: -40, w: 346, h: 340 };
const PLAIN = "#C9D6DF";
const FONT = require("@expo-google-fonts/figtree/800ExtraBold/Figtree_800ExtraBold.ttf");

/* ---------- heap geometry (identical to the prototype) ---------- */
const heapOf = (n: number) => heap(n, { seed: 23, r: 8, left: 64, right: 282, bottom: 256, top: 164 });
const CAP = heapOf(100000).length;
const countOf = (s: VisualState) => (s.pct > 0 ? Math.max(1, Math.round(Math.min(s.pct, 1) * CAP)) : 0);
const per = (s: VisualState) => s.goal / CAP;
const kFor = (s: VisualState, amount: number) => clamp(Math.round(amount / per(s)), 1, 8);
type Kind = "coin" | "gem" | "ring";
const kindOf = (c: Coin): Kind => { const h = Math.abs(Math.round(c.x * 17 + c.y * 11)); return h % 9 === 4 ? "gem" : h % 13 === 7 ? "ring" : "coin"; };
function drawItem(canvas: SkCanvas, c: Coin, i: number, kind?: Kind) {
  const k = kind || kindOf(c);
  if (k === "gem") drawGem(canvas, c.x, c.y, i + Math.round(c.x), c.rot * 0.6);
  else if (k === "ring") drawRing(canvas, c.x, c.y, c.sq, c.rot);
  else drawCoin(canvas, c.x, c.y, c.r, { sq: c.sq, rot: c.rot });
}
function newSpots(s: VisualState, k: number): Coin[] {
  const n = countOf(s), have = new Set(heapOf(n).map(coinKey));
  const fresh = heapOf(Math.min(n + k, CAP)).filter((c) => !have.has(coinKey(c))).sort((a, b) => b.y - a.y);
  while (fresh.length < k) fresh.push({ x: 110 + Math.random() * 130, y: 166 + Math.random() * 6, r: 8, sq: 0.5, rot: 0 });
  return fresh.slice(0, k);
}
const BEAK = { x: 221, y: 99 };

/* ---------- idle schedules ---------- */
const PEEK = intervals(7, 8, 3, 5), BLINK = intervals(8, 7, 2.8, 5.2);
const PEEK_DUR = 1.7; // peek(hold 1100) = hold + 600 ms

/* ---------- add timeline (ms) ---------- */
const T_CROUCH = 0, T_SPRING = 200, T_FLY = 290, FLY_D = 1150, T_WAIT = T_FLY + FLY_D, T_BACK = T_WAIT + 260, BACK_D = 1250, T_LAND = T_BACK + BACK_D, T_TILT = T_LAND + 260, T_DROP = T_TILT + 220;
const DROP_GAP = 150, DROP_FALL = 460;
function dropEnd(k: number) { "worklet"; return T_DROP + (k - 1) * DROP_GAP + DROP_FALL; }
/** After the last item drops, a small happy hop: crouch, spring up, land with a squash. */
const HOP_AT = 180, HOP_D = 520;
function addDurFor(k: number) { "worklet"; return dropEnd(k) + HOP_AT + HOP_D + 40; }
interface Hop { y: number; sx: number; sy: number; wing: number }
function hop(h: number): Hop {
  "worklet";
  if (h < 0 || h >= HOP_D) return { y: 0, sx: 1, sy: 1, wing: 0 };
  if (h < 90) { const k = h / 90; return { y: 4 * k, sx: 1 + 0.05 * k, sy: 1 - 0.09 * k, wing: -6 * k }; }
  if (h < 300) { const k = (h - 90) / 210, e = 1 - Math.pow(1 - k, 3); return { y: 4 - 18 * e, sx: 1.05 - 0.07 * k, sy: 0.91 + 0.13 * k, wing: -6 - 16 * Math.sin(Math.PI * k) }; }
  if (h < 460) { const k = (h - 300) / 160; return { y: -14 + 14 * k * k, sx: 0.98 + 0.02 * k, sy: 1.04 - 0.04 * k, wing: -8 * (1 - k) }; }
  const k = (h - 460) / 60, b = Math.sin(Math.PI * k);
  return { y: 0, sx: 1 + 0.04 * b, sy: 1 - 0.07 * b, wing: 0 };
}
// flight paths and wing plans (SK prototype)
const PA = [0, 0, 18, -70, 130, -170, 270, -300], PB = [250, -170, 160, -230, 70, -40, 0, 0];
const PLAN_A = [0, 420, 1, 135, 40, 420, 600, 0, 0, -24, 600, 860, 1, 165, 30, 860, 2000, 0, 0, -20];
const PLAN_B = [0, 380, 0, 0, -22, 380, 620, 1, 150, 28, 620, 900, 0, 0, -18, 900, 1400, 0, 0, -46];
function bez(P: number[], t: number, i: number) { "worklet"; const u = 1 - t; return u * u * u * P[i] + 3 * u * u * t * P[2 + i] + 3 * u * t * t * P[4 + i] + t * t * t * P[6 + i]; }
function bezD(P: number[], t: number, i: number) { "worklet"; const u = 1 - t; return 3 * u * u * (P[2 + i] - P[i]) + 6 * u * t * (P[4 + i] - P[2 + i]) + 3 * t * t * (P[6 + i] - P[4 + i]); }
function wingAt(ms: number, plan: number[]) {
  "worklet";
  for (let j = 0; j < plan.length; j += 5) { const a = plan[j], b = plan[j + 1]; if (ms >= a && ms < b) return plan[j + 2] === 1 ? -6 + Math.sin(((ms - a) / plan[j + 3]) * Math.PI * 2) * plan[j + 4] : plan[j + 4]; }
  return plan[plan.length - 1];
}
interface Pose { x: number; y: number; ang: number; sx: number; sy: number; ox: number; oy: number; wing: number; legRot: number; legSy: number; flying: boolean }
/** The crow's pose during the add, as a function of ms since it began. */
function pose(ms: number): Pose {
  "worklet";
  const p: Pose = { x: 0, y: 0, ang: 0, sx: 1, sy: 1, ox: 280, oy: 150, wing: 0, legRot: 0, legSy: 1, flying: false };
  if (ms < T_CROUCH) return p;
  if (ms < T_SPRING) { const k = ms / 200; p.y = 4 * k; p.sx = 1 + 0.05 * k; p.sy = 1 - 0.1 * k; p.legSy = 1 - 0.25 * k; p.wing = -10 * k; return p; }
  if (ms < T_FLY) { const k = (ms - T_SPRING) / 90; p.y = 4 - 4 * k; p.sx = 1.05 - 0.05 * k; p.sy = 0.9 + 0.1 * k; p.legSy = 0.75; p.wing = -10; return p; }
  p.flying = true; p.oy = 117.6;
  if (ms < T_BACK) {
    const m = Math.min(ms - T_FLY, FLY_D), k = m / FLY_D, u = Math.pow(k, 1.35), uu = Math.max(u, 0.02);
    const dx = bezD(PA, uu, 0), dy = bezD(PA, uu, 1), turn = clamp(m / 260, 0, 1), sx = 1 - 2 * turn;
    const ang = clamp((Math.atan2(dy, dx) * 180) / Math.PI, -32, 20) * turn, sc = 1 - 0.5 * u, bob = Math.sin((m / 135) * Math.PI * 2) * (m < 860 ? 2 : 0.6);
    p.x = bez(PA, u, 0); p.y = bez(PA, u, 1) + bob; p.ang = ang; p.sx = sx * sc; p.sy = sc; p.wing = wingAt(m, PLAN_A); p.legSy = clamp(1 - m / 300, 0.45, 1);
    return p;
  }
  if (ms < T_LAND) {
    const m = ms - T_BACK, k = m / BACK_D, u = 1 - Math.pow(1 - k, 1.7), uu = Math.min(u, 0.98);
    const dx = bezD(PB, uu, 0), dy = bezD(PB, uu, 1);
    let ang = clamp((Math.atan2(dy, dx) * 180) / Math.PI - 180, -35, 35);
    if (ang < -35) ang += 360;
    const flare = clamp((m - 880) / 300, 0, 1);
    ang = ang * (1 - flare) + 14 * flare * (1 - clamp((m - 1120) / 130, 0, 1));
    const sc = 0.55 + 0.45 * u;
    p.x = bez(PB, u, 0); p.y = bez(PB, u, 1); p.ang = ang; p.sx = sc; p.sy = sc; p.wing = wingAt(m, PLAN_B);
    if (flare > 0) { p.legRot = 18 * flare; p.legSy = 0.5 + 0.55 * flare; } else p.legSy = 0.45;
    return p;
  }
  p.flying = false; p.oy = 150;
  if (ms < T_TILT) {
    const k = (ms - T_LAND) / 260, b = Math.sin(k * Math.PI);
    p.y = 3 * b; p.sx = 1 + 0.04 * b; p.sy = 1 - 0.07 * b; p.legRot = 18 * (1 - k); p.legSy = 1.05 - 0.15 * b; p.wing = -46 * (1 - k) + 6 * Math.sin(k * Math.PI * 2);
  }
  return p;
}

/* ---------- milestone (ms) ---------- */
const MS_DUR = 2800, CROWN_AT = 700, CROWN_D = 850, CAW_AT = 350;

/* ---------- pre-rolled randomness ---------- */
const R = seeded(77);
const PKA: number[] = [], PKD: number[] = [], PKS: number[] = [], PKT: number[] = [];
for (let i = 0; i < 4; i++) { PKA.push(R() * Math.PI * 2); PKD.push(10 + R() * 10); PKS.push(0.6 + R() * 0.8); PKT.push(700 + R() * 450); }
const LSA: number[] = [], LSD: number[] = [], LSS: number[] = [], LST: number[] = [];
for (let i = 0; i < 24; i++) { LSA.push(R() * Math.PI * 2); LSD.push(10 + R() * 12); LSS.push(0.6 + R() * 0.8); LST.push(700 + R() * 450); }
const MSA: number[] = [], MSD: number[] = [], MSS: number[] = [], MST: number[] = [];
for (let i = 0; i < 14; i++) { MSA.push(R() * Math.PI * 2); MSD.push(10 + R() * 110); MSS.push(0.6 + R() * 0.8); MST.push(700 + R() * 450); }
const CRA: number[] = [], CRD: number[] = [], CRS: number[] = [], CRT: number[] = [];
for (let i = 0; i < 10; i++) { CRA.push(R() * Math.PI * 2); CRD.push(10 + R() * 40); CRS.push(0.6 + R() * 0.8); CRT.push(700 + R() * 450); }
const M = seeded(3);
const MOX: number[] = [], MOY: number[] = [], MOR: number[] = [], MOO: number[] = [];
for (let i = 0; i < 16; i++) { MOX.push(40 + M() * 170); MOY.push(-20 + M() * 250); MOR.push(0.8 + M() * 1.2); MOO.push(0.35 + M() * 0.4); }

/* Atlas slots */
const S_PK = 0, S_LS = 4, S_MS = 28, S_CR = 42, S_MO = 52, N_FX = 52, N_MO = 16;
const SP_PK = 0, SP_LS = 1, SP_MS = 2, SP_CR = 3, SP_MO = 4;
const spriteFor = (i: number) => (i < S_LS ? SP_PK : i < S_MS ? SP_LS : i < S_CR ? SP_MS : i < S_MO ? SP_CR : SP_MO);
const HIDDEN: [number, number, number, number, number] = [0, 0, 0, 0, 0];
/** A sparkle burst particle: [x, y, scale, rot, alpha]. */
function spark(p: number, cx: number, cy: number, a: number, d: number, s: number): [number, number, number, number, number] {
  "worklet";
  if (p < 0 || p > 1) return HIDDEN;
  const e = easeOut(p), dd = kf(e, [0, 0.6, 1], [0, d, d * 1.25]);
  return [cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, kf(e, [0, 0.6, 1], [0, 1.1, 0.2]) * s, 0, kf(e, [0, 0.6, 1], [1, 1, 0])];
}
function fxAt(i: number, t: number, addMs: number, msMs: number, k: number, tgt: number[], pk: number[], motes: boolean): [number, number, number, number, number] {
  "worklet";
  if (i < S_LS) {
    if (addMs > 0) return HIDDEN;
    const ev = cycleAt(t, 0.9, PEEK.list, PEEK.total);
    if (ev.i < 0) return HIDDEN;
    const m = pk.length / 2;
    if (m === 0) return HIDDEN;
    const ci = hash(ev.i, 5) % m;
    return spark((ev.local - 0.45) / (PKT[i] / 1000), pk[ci * 2], pk[ci * 2 + 1], PKA[i], PKD[i], PKS[i]);
  }
  if (i < S_MS) {
    const q = i - S_LS, c = Math.floor(q / 3);
    if (c >= k) return HIDDEN;
    return spark((addMs - (T_DROP + c * DROP_GAP + DROP_FALL)) / LST[q], tgt[c * 2], tgt[c * 2 + 1] - 4, LSA[q], LSD[q], LSS[q]);
  }
  if (i < S_CR) { const q = i - S_MS; return spark((msMs - CAW_AT) / MST[q], 173, 120, MSA[q], MSD[q], MSS[q]); }
  if (i < S_MO) { const q = i - S_CR; return spark((msMs - CROWN_AT - CROWN_D) / CRT[q], 248, 56, CRA[q], CRD[q], CRS[q]); }
  if (!motes) return HIDDEN;
  const q = i - S_MO, dur = (5000 + q * 450) / 1000, ph = ((t + (q * 600) / 1000) / dur) % 2, tri = easeInOut(ph < 1 ? ph : 2 - ph);
  return [MOX[q] + (q % 2 ? 1 : -1) * (6 + (q % 5)) * tri, MOY[q] + (-10 - (q % 4) * 4) * tri, MOR[q], 0, MOO[q]];
}

/* ---------- static Skia objects ---------- */
function useStatics() {
  return useMemo(() => {
    const P = (d: string) => Skia.Path.MakeFromSVGString(d)!;
    const sheet = makeSheet([
      { w: 14, h: 14, draw: (c) => drawStar(c, 5, "#FFFFFF") },
      { w: 10, h: 10, draw: (c) => drawStar(c, 3.5, "#FFF4C2") },
      { w: 16, h: 16, draw: (c) => drawStar(c, 6, "#FFE38A") },
      { w: 14, h: 14, draw: (c) => drawStar(c, 5, "#FFE38A") },
      { w: 4, h: 4, draw: (c) => { const p = Skia.Paint(); p.setAntiAlias(true); p.setColor(Skia.Color("#FFF3D2")); c.drawCircle(0, 0, 1, p); } },
    ]);
    const sprites: SkRect[] = [], ax: number[] = [], ay: number[] = [];
    for (let i = 0; i < N_FX + N_MO; i++) { const s = spriteFor(i); sprites.push(sheet.rects[s]); ax.push(sheet.ax[s]); ay.push(sheet.ay[s]); }
    const moteSprites = sprites.slice(N_FX), fxSprites = sprites.slice(0, N_FX);
    // light beams: 6 quads fanning up out of the chest
    const beams = Skia.PathBuilder.Make();
    for (let i = 0; i < 6; i++) { const x = 80 + i * 37; beams.moveTo(x, 158); beams.lineTo(x + 22, 158); beams.lineTo(x + 36 + (i - 2.5) * 20, -30); beams.lineTo(x - 14 + (i - 2.5) * 20, -30); beams.close(); }
    const crown = P("M-11 0 L-11 -11 L-5.5 -5.5 L0 -14 L5.5 -5.5 L11 -11 L11 0 Z");
    const carryCoin = coinPicture(7, { sq: 0.9, rot: 15 });
    const carryGem = createPicture((c) => drawGem(c, 0, 0, 1, 15, 0.9), Skia.XYWHRect(-12, -12, 24, 24));
    const attic = atticPicture();
    return {
      sheet, sprites: fxSprites, moteSprites, ax, ay, beams: beams.build(), crown, carryCoin, carryGem, attic,
      lid1: P("M60 150 L76 92 Q173 68 270 92 L286 150 Z"), lid2: P("M74 146 L86 102 Q173 82 260 102 L272 146 Z"), lid3: P("M90 140 L98 108 Q173 92 248 108 L256 140"),
      lidS1: P("M104 150 L114 88 L128 86 L118 150 Z"), lidS2: P("M242 150 L232 86 L218 86 L228 150 Z"),
      lockT: P("M171.5 264 L174.5 264 L175.5 272 L170.5 272 Z"), seam: P("M62 265 H284"), trimL: P("M51 150 V272 M295 150 V272"),
      tail: P("M300 118 L340 130 L336 140 L296 132 Z"), tailL: P("M306 124 L334 132"), belly: P("M262 124 Q270 138 290 141"),
      wing: P("M268 110 Q300 96 320 124 Q296 132 270 126 Z"), wingL: P("M276 112 Q296 108 308 122"),
      legs: P("M280 140 L278 150 M290 140 L292 150 M272 150 L284 150 M286 150 L298 150"),
      beak: P("M245 89 L220 98 L245 102 Z"), beakL: P("M245 95 L222 98"),
      crownHi: P("M-9 -2 L-9 -8 L-5 -4"),
      pileClip: Skia.XYWHRect(62, 158, 222, 100),
    };
  }, []);
}

/** backgrounds/crow.js [3] "Dusty attic", static parts (the motes drift via the atlas). */
function atticPicture(): SkPicture {
  return createPicture((c) => {
    const p = Skia.Paint(); p.setAntiAlias(true);
    const fill = (col: string, a = 1) => { p.setStyle(PaintStyle.Fill); p.setShader(null); p.setColor(Skia.Color(col)); p.setAlphaf(a); return p; };
    const stroke = (col: string, w: number, a = 1) => { fill(col, a); p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(w); return p; };
    c.drawRect(Skia.XYWHRect(-500, -500, 1346, 1400), fill("#B18B63"));
    for (let x = -500, i = 0; x < 846; x += 34, i++) {
      c.drawRect(Skia.XYWHRect(x, -500, 34, 776), fill(i % 3 === 0 ? "#B8936B" : i % 3 === 1 ? "#B18B63" : "#BC9870"));
      c.drawLine(x, -500, x, 276, stroke("#8E6B49", 1.2, 0.7));
    }
    const r = seeded(23);
    for (let i = 0; i < 14; i++) { const x = -480 + r() * 1300, y = -470 + r() * 700; if (x > 30 && x < 320 && y > 40 && y < 280) continue; c.drawOval(Skia.XYWHRect(x - 3.5, y - 1.8, 7, 3.6), fill("#8E6B49", 0.5)); }
    // sloped rafter
    c.drawPath(Skia.Path.MakeFromSVGString("M-500 -170 L846 -60 L846 -26 L-500 -136 Z")!, fill("#7A5638"));
    c.drawLine(-500, -136, 846, -26, stroke("#5E4129", 2));
    // slanted skylight
    c.save(); c.translate(-6, -30); c.skew(0, Math.tan(rad(8)));
    c.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, 70, 52), 3, 3), fill("#6E4E33"));
    fill("#FFFFFF"); p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 5 }, { x: 0, y: 47 }, [Skia.Color("#D7E6EE"), Skia.Color("#F6EBD0")], null, TileMode.Clamp));
    c.drawRect(Skia.XYWHRect(5, 5, 60, 42), p);
    c.drawPath(Skia.Path.MakeFromSVGString("M35 5 V47 M5 26 H65")!, stroke("#6E4E33", 3));
    c.restore();
    // light shaft
    fill("#FFFFFF"); p.setShader(Skia.Shader.MakeLinearGradient({ x: 6, y: 22 }, { x: 250, y: 288 }, [Skia.Color("rgba(255,244,214,0.55)"), Skia.Color("rgba(255,240,204,0.18)"), Skia.Color("rgba(255,240,204,0)")], [0, 0.7, 1], TileMode.Clamp));
    c.drawPath(Skia.Path.MakeFromSVGString("M6 22 L64 30 L250 280 L120 288 Z")!, p);
    // floor
    c.drawRect(Skia.XYWHRect(-500, 268, 1346, 8), fill("#7E5A3B"));
    fill("#FFFFFF"); p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 276 }, { x: 0, y: 976 }, [Skia.Color("#94704C"), Skia.Color("#6E5036")], null, TileMode.Clamp));
    c.drawRect(Skia.XYWHRect(-500, 276, 1346, 700), p);
    for (let i = 0; i < 9; i++) { const y = 276 + i * i * 2.2 + i * 6; c.drawLine(-500, y, 846, y, stroke("#6E4E33", 1, 0.55)); }
    c.drawOval(Skia.XYWHRect(40, 272, 280, 24), fill("#FFF0CC", 0.14));
    // vignette
    fill("#FFFFFF"); p.setShader(Skia.Shader.MakeRadialGradient({ x: 173, y: 200 }, 1009, [Skia.Color("rgba(59,39,23,0)"), Skia.Color("rgba(59,39,23,0)"), Skia.Color("rgba(59,39,23,0.45)")], [0, 0.5, 1], TileMode.Clamp));
    c.drawRect(Skia.XYWHRect(-500, -500, 1346, 1400), p);
  }, Skia.XYWHRect(-500, -500, 1346, 1400));
}

interface Plan { k: number; targets: Coin[]; pics: SkPicture[]; gem: boolean }

/** One of the (at most 8) items the crow drops into the chest. */
function DropItem({ i, addT, addDur, kSV, tgt, pic }: { i: number; addT: SharedValue<number>; addDur: SharedValue<number>; kSV: SharedValue<number>; tgt: SharedValue<number[]>; pic: SkPicture | null }) {
  const tr = useDerivedValue(() => {
    const ms = addT.value * addDur.value, start = T_DROP + i * DROP_GAP, p = clamp((ms - start) / DROP_FALL, 0, 1), e = bezier(0.5, 0, 0.85, 0.55, p);
    const tx = tgt.value[i * 2], ty = tgt.value[i * 2 + 1], o = [0, 0.7, 0.85, 1];
    // Group opacity does not apply to a Picture, so hidden items are parked off-screen instead.
    if (!(i < kSV.value && addT.value > 0 && ms >= start)) return [{ translateX: -9999 }, { translateY: -9999 }];
    return [{ translateX: kf(e, o, [BEAK.x - 6, tx, tx, tx]) }, { translateY: kf(e, o, [BEAK.y + 12, ty, ty - 6, ty]) }, { rotate: rad(kf(e, o, [0, 14, -6, 0])) }];
  });
  if (!pic) return null;
  return <Group transform={tr}><Picture picture={pic} /></Group>;
}

/** A speech bubble anchored by its bottom-right tail at (x,y); pops in, holds, fades. */
function Bubble({ text, x, y, size, font, prog }: { text: string; x: number; y: number; size: number; font: SkFont | null; prog: SharedValue<number> }) {
  // prog: ms since the bubble started, or -1
  const w = text.length * size * 0.62 + 18;
  const path = useMemo(() => Skia.Path.MakeFromSVGString(`M0 0 L-6 -10 L${-w + 8} -10 Q${-w} -10 ${-w} -18 L${-w} ${-size - 16} Q${-w} ${-size - 24} ${-w + 8} ${-size - 24} L-8 ${-size - 24} Q0 ${-size - 24} 0 ${-size - 16} Z`)!, [w, size]);
  const tw = font ? font.getGlyphWidths(font.getGlyphIDs(text)).reduce((a, b) => a + b, 0) : 0;
  const tr = useDerivedValue(() => { const ms = prog.value; const s = ms < 0 ? 0 : ms < 320 ? kf(easeOut(ms / 320), [0, 0.6, 1], [0, 1.12, 1]) : 1; return [{ translateX: x }, { translateY: y }, { scale: s }]; });
  const op = useDerivedValue(() => { const ms = prog.value; return ms < 0 ? 0 : 1; });
  if (!font) return null;
  return (
    <Group transform={tr} opacity={op}>
      <Path path={path} color="#FFFFFF" />
      <Path path={path} color="#1C1A22" style="stroke" strokeWidth={1.5} />
      <Text x={-w / 2 - tw / 2} y={-17} text={text} font={font} color="#1C1A22" />
    </Group>
  );
}

const Scene = forwardRef<SceneHandle, SceneProps>(function CrowScene({ state, width, height, motion, background }, ref) {
  const fit = useMemo(() => fitBox(BOX, width, height), [width, height]);
  const S = useStatics();
  const fontS = useFont(FONT, 11), fontL = useFont(FONT, 16);
  const attic = background === "attic";
  const clock = useSharedValue(0), addT = useSharedValue(0), msT = useSharedValue(0);
  const addDur = useSharedValue(addDurFor(1)), kSV = useSharedValue(0), tgt = useSharedValue<number[]>([]), carryGem = useSharedValue(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  // Accumulate deltas: timeSinceFirstFrame restarts whenever the callback is re-registered (every re-render).
  useFrameCallback((f) => { clock.value += Math.min(f.timeSincePreviousFrame ?? 0, 100) / 1000; });

  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => {
      const k = kFor(state, amount), targets = newSpots(state, k), gem = amount >= 25;
      cancelAnimation(addT); addT.value = 0;
      kSV.value = k; tgt.value = targets.flatMap((c) => [c.x, c.y]); addDur.value = addDurFor(k); carryGem.value = gem ? 1 : 0;
      const pics = targets.map((t, i) => {
        const kind: Kind = i === 0 ? (gem ? "gem" : "coin") : i % 3 === 2 ? "gem" : "coin";
        return createPicture((c) => drawItem(c, { ...t, x: 0, y: 0 }, i + Math.round(t.x), kind), Skia.XYWHRect(-16, -16, 32, 32));
      });
      setPlan({ k, targets, pics, gem });
      addT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? addDurFor(k) : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    playMilestone: () => new Promise<void>((res) => {
      cancelAnimation(msT); msT.value = 0;
      msT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? MS_DUR : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    cancel: () => { cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0; setPlan(null); },
  }), [motion, state]);
  useEffect(() => { cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0; kSV.value = 0; setPlan(null); }, [state.pct, state.surplus, state.goal]);

  /* ---- state-dependent pictures ---- */
  const n = countOf(state);
  const H = useMemo(() => heapOf(n), [n]);
  const pilePic = useMemo(() => heapPicture(H, BOX, (c, it, i) => drawItem(c, it, i)), [H]);
  const pk = useMemo(() => { const m = Math.min(H.length, 12); const out: number[] = []; for (let i = 0; i < m; i++) out.push(H[i].x, H[i].y - 3); return out; }, [H]);
  const spillPic = useMemo(() => {
    if (!(state.surplus > 0)) return null;
    const m = Math.min(42, Math.ceil(state.surplus / per(state)));
    const L = heap(Math.ceil(m * 0.36), { seed: 31, r: 7.5, left: 2, right: 60, bottom: 290, top: 246 });
    const Rr = heap(Math.ceil(m * 0.36), { seed: 37, r: 7.5, left: 288, right: 344, bottom: 290, top: 246 });
    const F = heap(Math.floor(m * 0.28), { seed: 41, r: 7, left: 70, right: 276, bottom: 294, top: 282 });
    return heapPicture(L.concat(Rr, F).sort((a, b) => a.y - b.y), BOX, (c, it, i) => drawItem(c, it, i));
  }, [state.surplus, state.goal]);

  /* ---- derived transforms ---- */
  const root = useMemo(() => [{ translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.scale }], [fit]);
  const addMs = useDerivedValue(() => (addT.value > 0 ? addT.value * addDur.value : -1));
  const msMs = useDerivedValue(() => (msT.value > 0 ? msT.value * MS_DUR : -1));
  const crowTr = useDerivedValue(() => {
    let x = 0, y = 0, ang = 0, sx = 1, sy = 1, ox = 280, oy = 150;
    if (addMs.value >= 0) {
      const p = pose(addMs.value); x = p.x; y = p.y; ang = p.ang; sx = p.sx; sy = p.sy; ox = p.ox; oy = p.oy;
      const hp = hop(addMs.value - dropEnd(Math.max(1, kSV.value)) - HOP_AT); y += hp.y; sx *= hp.sx; sy *= hp.sy;
    }
    else if (msMs.value >= 0 && msMs.value <= 1700) {
      const e = easeOut(msMs.value / 1700), o = [0, 0.3, 0.5, 0.7, 1];
      x = kf(e, o, [0, -10, -8, -9, 0]); sx = sy = kf(e, o, [1, 1.18, 1.12, 1.15, 1]);
    }
    return [{ translateX: ox + x }, { translateY: oy + y }, { rotate: rad(ang) }, { scaleX: sx }, { scaleY: sy }, { translateX: -ox }, { translateY: -oy }];
  });
  const wingTr = useDerivedValue(() => [{ rotate: addMs.value >= 0 ? rad(pose(addMs.value).wing + hop(addMs.value - dropEnd(Math.max(1, kSV.value)) - HOP_AT).wing) : 0 }]);
  const legsTr = useDerivedValue(() => { if (addMs.value < 0) return [{ scaleY: 1 }]; const p = pose(addMs.value); return [{ rotate: rad(p.legRot) }, { scaleY: p.legSy }]; });
  const headTr = useDerivedValue(() => {
    let a = 0, tx = 0, ty = 0;
    if (addMs.value >= 0) {
      const ms = addMs.value, k = Math.max(1, kSV.value), de = dropEnd(k);
      if (ms >= T_TILT && ms < T_DROP) a = -24 * ease((ms - T_TILT) / 220);
      else if (ms >= T_DROP && ms < de) a = -24;
      else if (ms >= de) a = -24 * (1 - ease(clamp((ms - de) / 260, 0, 1)));
    } else {
      const ev = cycleAt(clock.value, 0.9, PEEK.list, PEEK.total);
      if (ev.i >= 0 && ev.local < PEEK_DUR) {
        const e = easeInOut(ev.local / PEEK_DUR), o = [0, 0.22, 0.5, 0.78, 1];
        a = kf(e, o, [0, -28, -24, -28, 0]); tx = kf(e, o, [0, -2, -2, -2, 0]); ty = kf(e, o, [0, 3, 3, 3, 0]);
      }
    }
    return [{ rotate: rad(a) }, { translateX: tx }, { translateY: ty }];
  });
  const eyeTr = useDerivedValue(() => {
    const ev = cycleAt(clock.value, 2.0, BLINK.list, BLINK.total);
    if (ev.i < 0 || ev.local > 0.2) return [{ scaleY: 1 }];
    return [{ scaleY: kf(ease(ev.local / 0.2), [0, 0.5, 1], [1, 0.1, 1]) }];
  });
  // (Pictures ignore Group opacity: park them off-screen when hidden.)
  const OFF = [{ translateX: -9999 }, { translateY: -9999 }];
  const carryCoinTr = useDerivedValue(() => (addMs.value >= T_BACK && addMs.value < T_DROP && !carryGem.value ? [{ translateX: BEAK.x }, { translateY: BEAK.y + 1 }] : OFF));
  const carryGemTr = useDerivedValue(() => (addMs.value >= T_BACK && addMs.value < T_DROP && carryGem.value ? [{ translateX: BEAK.x }, { translateY: BEAK.y + 2 }] : OFF));
  const crownTr = useDerivedValue(() => {
    const p = clamp((msMs.value - CROWN_AT) / CROWN_D, 0, 1), e = easeOut(p), o = [0, 0.6, 0.76, 1];
    return [{ translateX: 258 }, { translateY: 80 }, { scale: 1.55 }, { translateY: kf(e, o, [-110, 0, -8, 0]) }, { rotate: rad(kf(e, o, [-30, 6, -4, 0])) }];
  });
  const crownO = useDerivedValue(() => { if (msMs.value < CROWN_AT) return 0; const p = clamp((msMs.value - CROWN_AT) / CROWN_D, 0, 1); return kf(easeOut(p), [0, 0.2, 1], [0, 1, 1]); });
  const lidTr = useDerivedValue(() => {
    if (msMs.value < 0 || msMs.value > 2300) return [{ scaleY: 1 }];
    const e = easeInOut(msMs.value / 2300), o = [0, 0.25, 0.4, 0.75, 1];
    return [{ scaleY: kf(e, o, [1, 1.16, 1.12, 1.15, 1]) }, { skewX: rad(kf(e, o, [0, -2, 1, -1, 0])) }];
  });
  const beamsO = useDerivedValue(() => { if (msMs.value < 0 || msMs.value > 2300) return 0; return kf(ease(msMs.value / 2300), [0, 0.25, 0.7, 1], [0, 1, 0.85, 0]); });
  const cawIdle = useDerivedValue(() => {
    if (addMs.value >= 0) return -1;
    const ev = cycleAt(clock.value, 0.9, PEEK.list, PEEK.total);
    if (ev.i < 0 || rnd(ev.i, 9) >= 0.35) return -1;
    const ms = (ev.local - 0.45) * 1000;
    return ms < 0 || ms > 1270 ? -1 : ms;
  });
  const cawIdleO = useDerivedValue(() => { const ms = cawIdle.value; return ms < 0 ? 0 : ms < 1020 ? 1 : 1 - (ms - 1020) / 250; });
  const cawMs = useDerivedValue(() => { const ms = msMs.value - CAW_AT; return ms < 0 || ms > 1470 ? -1 : ms; });
  const cawMsO = useDerivedValue(() => { const ms = cawMs.value; return ms < 0 ? 0 : ms < 1220 ? 1 : 1 - (ms - 1220) / 250; });

  /* ---- fx atlas ---- */
  const { ax, ay, sheet } = S;
  const inv = sheet.inv;
  const xf = useRSXformBuffer(N_FX, (val, i) => {
    "worklet";
    const r = fxAt(i, clock.value, addMs.value, msMs.value, kSV.value, tgt.value, pk, attic);
    if (r[2] <= 0) hide(val); else place(val, r[2], r[3], r[0], r[1], ax[i], ay[i], inv);
  });
  const cols = useColorBuffer(N_FX, (val, i) => {
    "worklet";
    const r = fxAt(i, clock.value, addMs.value, msMs.value, kSV.value, tgt.value, pk, attic);
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = r[4];
  });
  const moteXf = useRSXformBuffer(N_MO, (val, i) => {
    "worklet";
    const r = fxAt(S_MO + i, clock.value, -1, -1, 0, tgt.value, pk, attic);
    if (r[2] <= 0) hide(val); else place(val, r[2], r[3], r[0], r[1], ax[S_MO + i], ay[S_MO + i], inv);
  });
  const moteCols = useColorBuffer(N_MO, (val, i) => {
    "worklet";
    const r = fxAt(S_MO + i, clock.value, -1, -1, 0, tgt.value, pk, attic);
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = r[4];
  });

  return (
    <Canvas style={{ width, height }}>
      <Group transform={root}>
        {attic ? <Picture picture={S.attic} /> : <Rect x={-600} y={-600} width={1546} height={1540} color={PLAIN} />}
        {attic && sheet.image && <Atlas image={sheet.image} sprites={S.moteSprites} transforms={moteXf} colors={moteCols} colorBlendMode="modulate" />}
        <Oval x={26} y={275} width={292} height={18} color={attic ? "rgba(60,36,18,0.4)" : "#AFC0CC"} />
        {/* lid */}
        <Group origin={vec(173, 150)} transform={lidTr}>
          <Path path={S.lid1} color="#5E3820" />
          <Path path={S.lid2} color="#7F4F2C" />
          <Path path={S.lid3} color="#6A3E20" style="stroke" strokeWidth={1.5} opacity={0.7} />
          <Path path={S.lidS1} color="#C9962E" />
          <Path path={S.lidS2} color="#C9962E" />
        </Group>
        {/* chest */}
        <RoundedRect x={48} y={150} width={250} height={122} r={6}>
          <LinearGradient start={vec(0, 150)} end={vec(0, 272)} colors={["#8A5530", "#6E4021"]} />
        </RoundedRect>
        <Rect x={62} y={160} width={222} height={98} color="#2B1A12" />
        <Rect x={62} y={160} width={222} height={16} color="#1E120C" opacity={0.6} />
        <Group clip={S.pileClip}>
          <Picture picture={pilePic} />
        </Group>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <DropItem key={i} i={i} addT={addT} addDur={addDur} kSV={kSV} tgt={tgt} pic={plan && i < plan.k ? plan.pics[i] : null} />)}
        <Rect x={48} y={150} width={250} height={10} color="#9A6235" />
        <Rect x={48} y={258} width={250} height={14} color="#9A6235" />
        <Path path={S.seam} color="#7A4A26" style="stroke" strokeWidth={1} />
        <Rect x={48} y={150} width={14} height={122} color="#C9962E" />
        <Rect x={284} y={150} width={14} height={122} color="#C9962E" />
        <Path path={S.trimL} color="#E9C35A" style="stroke" strokeWidth={1.2} opacity={0.7} />
        <Circle cx={55} cy={166} r={2.2} color="#7A4E0A" /><Circle cx={55} cy={264} r={2.2} color="#7A4E0A" />
        <Circle cx={291} cy={166} r={2.2} color="#7A4E0A" /><Circle cx={291} cy={264} r={2.2} color="#7A4E0A" />
        <RoundedRect x={160} y={254} width={26} height={24} r={4} color="#C9962E" />
        <Circle cx={173} cy={263} r={3.5} color="#4E2E18" />
        <Path path={S.lockT} color="#4E2E18" />
        {spillPic && <Picture picture={spillPic} />}
        {/* light beams (milestone) */}
        <Path path={S.beams} opacity={beamsO}>
          <LinearGradient start={vec(0, 158)} end={vec(0, -30)} colors={["rgba(255,231,160,0.85)", "rgba(255,231,160,0)"]} />
        </Path>
        {/* the crow */}
        <Group transform={crowTr}>
          <Path path={S.tail} color="#1C1A22" />
          <Path path={S.tailL} color="#3A3646" style="stroke" strokeWidth={1.2} />
          <Group origin={vec(284, 120)} transform={[{ rotate: rad(-18) }]}>
            <Oval x={253} y={98} width={62} height={44} color="#22202A" />
          </Group>
          <Path path={S.belly} color="#3A3646" style="stroke" strokeWidth={1.5} />
          <Group origin={vec(276, 112)} transform={wingTr}>
            <Path path={S.wing} color="#35313F" />
            <Path path={S.wingL} color="#4A4555" style="stroke" strokeWidth={1.5} />
          </Group>
          <Group origin={vec(285, 140)} transform={legsTr}>
            <Path path={S.legs} color="#45414E" style="stroke" strokeWidth={3} strokeCap="round" />
          </Group>
          <Group origin={vec(263.2, 106.8)} transform={headTr}>
            <Circle cx={258} cy={94} r={16} color="#22202A" />
            <Path path={S.beak} color="#45414E" />
            <Path path={S.beakL} color="#2B2833" style="stroke" strokeWidth={1} />
            <Group origin={vec(253, 90)} transform={eyeTr}>
              <Circle cx={253} cy={90} r={4} color="#F2C14E" />
              <Circle cx={252.5} cy={90} r={2.2} color="#0D0C10" />
              <Circle cx={251.6} cy={89} r={0.8} color="#FFFFFF" />
            </Group>
            <Group transform={carryCoinTr}><Picture picture={S.carryCoin} /></Group>
            <Group transform={carryGemTr}><Picture picture={S.carryGem} /></Group>
            <Group transform={crownTr} opacity={crownO}>
              <Path path={S.crown} color="#F2C14E" />
              <Path path={S.crown} color="#8A5A00" style="stroke" strokeWidth={1.1} strokeJoin="round" />
              <Path path={S.crownHi} color="#FFF1B8" style="stroke" strokeWidth={1} opacity={0.8} />
              <Rect x={-11} y={-2.5} width={22} height={3} color="#E0A52B" />
              <Circle cx={0} cy={-15} r={2.2} color="#D2475B" />
              <Circle cx={-11} cy={-12} r={1.8} color="#2BB3A3" />
              <Circle cx={11} cy={-12} r={1.8} color="#2BB3A3" />
            </Group>
          </Group>
        </Group>
        {/* fx */}
        {sheet.image && <Atlas image={sheet.image} sprites={S.sprites} transforms={xf} colors={cols} colorBlendMode="modulate" />}
        <Group opacity={cawIdleO}><Bubble text="caw" x={238} y={72} size={11} font={fontS} prog={cawIdle} /></Group>
        <Group opacity={cawMsO}><Bubble text="CAW!" x={236} y={52} size={16} font={fontL} prog={cawMs} /></Group>
      </Group>
    </Canvas>
  );
});

export const DEF: VisualDef = { key: "crow", box: BOX, plain: PLAIN, backgrounds: { attic: { name: "Dusty attic", page: "#9E7A55" } }, Scene };
