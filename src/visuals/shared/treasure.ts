/* Gems and rings for treasure heaps (ported from the crow prototype). */
import { Skia, PaintStyle, type SkCanvas } from "@shopify/react-native-skia";

export const GEMC = ["#2BB3A3", "#D2475B", "#8A5CC7", "#3D7BE0"];

export function drawGem(canvas: SkCanvas, x: number, y: number, i: number, rot = 0, s = 1) {
  canvas.save();
  canvas.translate(x, y);
  if (rot) canvas.rotate(rot, 0, 0);
  if (s !== 1) canvas.scale(s, s);
  const p = Skia.Paint(); p.setAntiAlias(true);
  p.setColor(Skia.Color(GEMC[((i % GEMC.length) + GEMC.length) % GEMC.length]));
  canvas.drawPath(Skia.Path.MakeFromSVGString("M-7 -3 L-3.5 -8 L3.5 -8 L7 -3 L0 8 Z")!, p);
  p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(0.8); p.setColor(Skia.Color("#FFFFFF")); p.setAlphaf(0.4);
  canvas.drawPath(Skia.Path.MakeFromSVGString("M-7 -3 L7 -3 M-3.5 -8 L0 -3 L3.5 -8 M0 -3 L0 8 M-7 -3 L0 8 L7 -3")!, p);
  p.setStyle(PaintStyle.Fill); p.setAlphaf(0.85);
  canvas.drawPath(Skia.Path.MakeFromSVGString("M-3.5 -7 L-1 -7 L-2.5 -4 Z")!, p);
  canvas.restore();
}

export function drawRing(canvas: SkCanvas, x: number, y: number, sq = 0.6, rot = 0) {
  canvas.save();
  canvas.translate(x, y);
  if (rot) canvas.rotate(rot, 0, 0);
  const ry = 6.5 * sq;
  const p = Skia.Paint(); p.setAntiAlias(true); p.setStyle(PaintStyle.Stroke);
  p.setColor(Skia.Color("#B98117")); p.setStrokeWidth(3.4);
  canvas.drawOval(Skia.XYWHRect(-6.5, -ry, 13, 2 * ry), p);
  p.setColor(Skia.Color("#F2CF68")); p.setStrokeWidth(2);
  canvas.drawOval(Skia.XYWHRect(-6.5, -ry, 13, 2 * ry), p);
  const top = -ry - 2;
  const stone = Skia.Path.MakeFromSVGString(`M-2.5 ${top.toFixed(1)} l2.5 -3.5 2.5 3.5 -2.5 2.5z`)!;
  p.setStyle(PaintStyle.Fill); p.setColor(Skia.Color("#9EE7FF"));
  canvas.drawPath(stone, p);
  p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(0.5); p.setColor(Skia.Color("#4FA8C8"));
  canvas.drawPath(stone, p);
  canvas.restore();
}
