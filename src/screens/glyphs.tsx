import React from "react";
import { Canvas, Path, Skia, Circle } from "@shopify/react-native-skia";

/* Tiny line icons drawn with Skia so no icon font or SVG library is needed. */
const P: Record<string, string> = {
  share: "M12 15V4M8 8l4-4 4 4M5 13v6h14v-6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8",
  plus: "M12 5v14M5 12h14",
  clock: "M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  star: "M14 3 L16.5 11.5 L25 14 L16.5 16.5 L14 25 L11.5 16.5 L3 14 L11.5 11.5 Z",
  ring: "M14 4 L17 8 L14 11 L11 8 Z",
  key: "M14 14 H25 M21 14 V18 M24 14 V17",
  gem: "M6 11 L10 5 L18 5 L22 11 L14 23 Z M6 11 H22",
  locket: "M14 8 V3 M14 24 C 4 17, 5 9, 10 9 C 12 9, 13 10, 14 12 C 15 10, 16 9, 18 9 C 23 9, 24 17, 14 24 Z",
  watch: "M14 5.5 V8 M14 16 V11 M14 16 L17 18",
  crown: "M5 21 V9 L10 14 L14 6 L18 14 L23 9 V21 Z",
};
export function Svg({ kind, color, fill }: { kind: string; color: string; fill?: boolean }) {
  const is28 = ["star", "ring", "key", "gem", "locket", "watch", "crown"].includes(kind);
  const size = is28 ? 28 : 20, vb = is28 ? 28 : 24, sc = size / vb;
  const path = React.useMemo(() => Skia.Path.MakeFromSVGString(P[kind] || "") || Skia.Path.Make(), [kind]);
  const stroke = is28 ? 1.6 : 1.8;
  return (
    <Canvas style={{ width: size, height: size }}>
      {fill && is28 && kind !== "key" && kind !== "watch" ? <Path path={path} color={color} transform={[{ scale: sc }]} /> : null}
      <Path path={path} color={color} style="stroke" strokeWidth={stroke} strokeJoin="round" strokeCap="round" transform={[{ scale: sc }]} />
      {kind === "ring" ? <Circle cx={14 * sc} cy={17 * sc} r={7 * sc} color={color} style="stroke" strokeWidth={stroke} /> : null}
      {kind === "key" ? <Circle cx={9 * sc} cy={14 * sc} r={5 * sc} color={color} style={fill ? "fill" : "stroke"} strokeWidth={stroke} /> : null}
      {kind === "watch" ? <><Circle cx={14 * sc} cy={16 * sc} r={8 * sc} color={color} style={fill ? "fill" : "stroke"} strokeWidth={stroke} /><Circle cx={14 * sc} cy={3.5 * sc} r={1.8 * sc} color={color} style="stroke" strokeWidth={stroke} /></> : null}
    </Canvas>
  );
}
