/* Realistic coins and heaps, ported from the prototype's SK.coin / SK.heap / SK.coinDefs.
 * Everything here draws imperatively onto an SkCanvas so heaps can be cached in a Picture
 * (or rasterised into an Atlas sprite) instead of mounting hundreds of components. */
import { Skia, TileMode, PaintStyle, createPicture, type SkCanvas, type SkPicture, type SkShader, type SkMatrix, type SkColor } from "@shopify/react-native-skia";
import { seeded } from "./anim";

export type Tone = "gold" | "silver";
export interface CoinOpts { sq?: number; rot?: number; tone?: Tone }
export interface Coin { x: number; y: number; r: number; sq: number; rot: number }
export interface HeapOpts { seed?: number; r?: number; left: number; right: number; bottom: number; top: number; inside?: (x: number, y: number) => boolean }

const C = (hex: string) => Skia.Color(hex);
type Grad = { colors: SkColor[]; pos: number[] };
/* SK.coinDefs: the gradients. Stops are in the shape's bounding box (0..1), mapped per coin below.
 * Built lazily: Skia (CanvasKit on web) may not be loaded when this module is imported. */
let GRADS: { cFace: Grad; cEdge: Grad; cInner: Grad; sFace: Grad; sEdge: Grad } | null = null;
const G = () =>
  GRADS ||
  (GRADS = {
    cFace: { colors: ["#FFF1B8", "#F6CF5C", "#E2A92C", "#F3CC63", "#C98C1C"].map(C), pos: [0, 0.28, 0.55, 0.8, 1] },
    cEdge: { colors: ["#8F5E0E", "#C48A1E", "#E3AE3E", "#7C4F0A"].map(C), pos: [0, 0.35, 0.6, 1] },
    cInner: { colors: ["#FCE08A", "#D9A030"].map(C), pos: [0, 1] },
    sFace: { colors: ["#FFFFFF", "#D9DEE6", "#AEB6C2", "#E6EAF0"].map(C), pos: [0, 0.35, 0.7, 1] },
    sEdge: { colors: ["#6E7785", "#B9C1CC", "#5D6573"].map(C), pos: [0, 0.5, 1] },
  });
const lin = (x0: number, y0: number, x1: number, y1: number, g: Grad): SkShader =>
  Skia.Shader.MakeLinearGradient({ x: x0, y: y0 }, { x: x1, y: y1 }, g.colors, g.pos, TileMode.Clamp);
/** Radial gradient whose circle is squashed vertically by `sy` (an SVG objectBoundingBox radial on an ellipse). */
const radial = (cx: number, cy: number, r: number, sy: number, g: Grad): SkShader => {
  const m: SkMatrix = Skia.Matrix();
  m.scale(1, sy);
  return Skia.Shader.MakeRadialGradient({ x: cx, y: cy / sy }, r, g.colors, g.pos, TileMode.Clamp, m);
};
const oval = (cx: number, cy: number, rx: number, ry: number) => Skia.XYWHRect(cx - rx, cy - ry, 2 * rx, 2 * ry);

/** SK.coin: a coin seen at an angle, drawn centred at (x,y). sq 0.3 (edge-on) .. 1 (face-on); rot in degrees. */
export function drawCoin(canvas: SkCanvas, x: number, y: number, r: number, o: CoinOpts = {}) {
  const sq = o.sq == null ? 0.55 : o.sq, rot = o.rot || 0, silver = o.tone === "silver";
  const ry = r * sq, t = r * 0.2 * (1 - sq * 0.55) + 0.6;
  const rimC = silver ? "#8C95A3" : "#B98117", hi = silver ? "#FFFFFF" : "#FFF6D2";
  canvas.save();
  canvas.translate(x, y);
  if (rot) canvas.rotate(rot, 0, 0);
  const p = Skia.Paint();
  p.setAntiAlias(true);
  // underside
  p.setColor(C(silver ? "#5D6573" : "#7C4F0A"));
  canvas.drawOval(oval(0, t, r, ry), p);
  // thickness (edge)
  p.setShader(lin(-r, 0, r, 0, silver ? G().sEdge : G().cEdge));
  canvas.drawRect(Skia.XYWHRect(-r, 0, 2 * r, t), p);
  // face
  p.setShader(lin(-r, -ry, r, ry, silver ? G().sFace : G().cFace));
  canvas.drawOval(oval(0, 0, r, ry), p);
  // inner disc + rim
  p.setShader(null);
  if (!silver) {
    // cx .4 cy .35 r .7 of the inner ellipse's box (1.6r x 1.6ry)
    p.setShader(radial(-0.8 * r + 0.4 * 1.6 * r, -0.8 * ry + 0.35 * 1.6 * ry, 0.7 * 1.6 * r, sq, G().cInner));
    p.setAlphaf(0.9);
    canvas.drawOval(oval(0, 0, 0.8 * r, 0.8 * ry), p);
    p.setShader(null);
  }
  p.setStyle(PaintStyle.Stroke);
  p.setColor(C(rimC));
  p.setAlphaf(0.9);
  p.setStrokeWidth(r * 0.1);
  canvas.drawOval(oval(0, 0, 0.8 * r, 0.8 * ry), p);
  if (sq > 0.5) {
    p.setAlphaf(0.55);
    p.setStrokeWidth(r * 0.07);
    canvas.drawOval(oval(0, 0, 0.42 * r, 0.42 * ry), p);
  }
  // highlight
  p.setStyle(PaintStyle.Fill);
  p.setColor(C(hi));
  p.setAlphaf(0.6);
  canvas.drawOval(oval(-r * 0.32, -ry * 0.38, r * 0.38, ry * 0.2), p);
  canvas.restore();
}

/** A single coin as a cached Picture centred on (0,0) — for the few coins that fly around. */
export function coinPicture(r: number, o: CoinOpts = {}): SkPicture {
  const pad = r * 1.6;
  return createPicture((c) => drawCoin(c, 0, 0, r, o), Skia.XYWHRect(-pad, -pad, 2 * pad, 2 * pad));
}

/** SK.heap: lay out n coins in a region, back-to-front (draw in order). */
export function heap(n: number, o: HeapOpts): Coin[] {
  const rand = seeded(o.seed || 17), out: Coin[] = [], r = o.r || 8, left = o.left, right = o.right, cx = (left + right) / 2;
  let y = o.bottom - r * 0.5, row = 0;
  while (out.length < n && y > o.top) {
    const xs: number[] = [];
    for (let x = left + r * (row % 2 ? 1.6 : 0.9); x <= right - r * 0.9; x += r * 1.45) xs.push(x);
    xs.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx));
    for (const x0 of xs) {
      if (out.length >= n) break;
      const x = x0 + (rand() - 0.5) * r * 0.5, yy = y + (rand() - 0.5) * r * 0.45 + Math.pow(Math.abs(x - cx) / ((right - left) / 2), 2) * r * 0.9;
      if (o.inside && !o.inside(x, yy)) continue;
      out.push({ x, y: yy, r: r * (0.9 + rand() * 0.22), sq: 0.32 + rand() * 0.55, rot: (rand() - 0.5) * 50 });
    }
    y -= r * 0.62;
    row++;
  }
  return out.sort((a, b) => a.y - b.y);
}

/** The prototype's gold/silver mix for the pig. */
export const goldOrSilver = (c: Coin): Tone => (Math.abs(Math.round(c.x * 13 + c.y * 7)) % 9 === 0 ? "silver" : "gold");
export const coinKey = (c: Coin) => c.x.toFixed(2) + "," + c.y.toFixed(2);

/** A whole heap drawn once into a Picture. `draw` lets callers substitute gems/rings for some coins. */
export function heapPicture(coins: Coin[], bounds: { x: number; y: number; w: number; h: number }, draw?: (canvas: SkCanvas, c: Coin, i: number) => void): SkPicture {
  return createPicture((canvas) => {
    coins.forEach((c, i) => (draw ? draw(canvas, c, i) : drawCoin(canvas, c.x, c.y, c.r, { sq: c.sq, rot: c.rot, tone: goldOrSilver(c) })));
  }, Skia.XYWHRect(bounds.x, bounds.y, bounds.w, bounds.h));
}

/** Draw a four-point sparkle star of size s centred at (0,0). */
export function drawStar(canvas: SkCanvas, s: number, color: string) {
  const b = Skia.PathBuilder.Make();
  b.moveTo(0, -s); b.lineTo(s * 0.27, -s * 0.27); b.lineTo(s, 0); b.lineTo(s * 0.27, s * 0.27); b.lineTo(0, s); b.lineTo(-s * 0.27, s * 0.27); b.lineTo(-s, 0); b.lineTo(-s * 0.27, -s * 0.27); b.close();
  const p = Skia.Paint(); p.setAntiAlias(true); p.setColor(C(color));
  canvas.drawPath(b.build(), p);
}
