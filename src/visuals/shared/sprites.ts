/* Sprite sheets for <Atlas>: many small fx (sparkles, confetti, firework particles) drawn once into an
 * image, then placed per frame with useRSXformBuffer / useColorBuffer from the shared values. */
import { Skia, createPicture, drawAsImageFromPicture, type SkCanvas, type SkImage, type SkRect, type SkRSXform } from "@shopify/react-native-skia";

export interface Cell { w: number; h: number; /** anchor inside the cell (box units); default centre */ ax?: number; ay?: number; draw: (c: SkCanvas) => void }
export interface Sheet { image: SkImage | null; rects: SkRect[]; /** anchors in sheet pixels */ ax: number[]; ay: number[]; /** box units per sheet pixel */ inv: number }

/** Supersample factor: sheet pixels per box unit (the box is scaled ~1-3x on screen). */
export const SS = 3;

/** Lay the cells out in one row, draw each at SS× resolution. */
export function makeSheet(cells: Cell[]): Sheet {
  const W = cells.reduce((a, c) => a + Math.ceil(c.w), 0), H = Math.ceil(Math.max(...cells.map((c) => c.h)));
  const rects: SkRect[] = [], ax: number[] = [], ay: number[] = [];
  let x = 0;
  const pic = createPicture((canvas) => {
    canvas.scale(SS, SS);
    let cx = 0;
    for (const c of cells) {
      canvas.save();
      canvas.translate(cx + (c.ax ?? c.w / 2), c.ay ?? c.h / 2);
      c.draw(canvas);
      canvas.restore();
      cx += Math.ceil(c.w);
    }
  }, Skia.XYWHRect(0, 0, W * SS, H * SS));
  for (const c of cells) {
    rects.push(Skia.XYWHRect(x * SS, 0, Math.ceil(c.w) * SS, Math.ceil(c.h) * SS));
    ax.push((c.ax ?? c.w / 2) * SS); ay.push((c.ay ?? c.h / 2) * SS);
    x += Math.ceil(c.w);
  }
  let image: SkImage | null = null;
  try { image = drawAsImageFromPicture(pic, { width: W * SS, height: H * SS }); } catch (e) { image = null; }
  return { image, rects, ax, ay, inv: 1 / SS };
}

/** Place sprite `val` so that its anchor (ax,ay in sheet px) lands on (x,y), scaled by `s` (box units per box unit) and rotated by `rot` radians. */
export function place(val: SkRSXform, s: number, rot: number, x: number, y: number, ax: number, ay: number, inv: number) {
  "worklet";
  if (s <= 0) { val.set(0, 0, -9999, -9999); return; }
  const k = s * inv, scos = k * Math.cos(rot), ssin = k * Math.sin(rot);
  val.set(scos, ssin, x - (scos * ax - ssin * ay), y - (ssin * ax + scos * ay));
}
/** Hide a sprite. */
export function hide(val: SkRSXform) {
  "worklet";
  val.set(0, 0, -9999, -9999);
}
