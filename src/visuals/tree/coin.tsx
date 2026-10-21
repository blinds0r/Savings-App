import React from "react";
import { Group, LinearGradient, Oval, RadialGradient, Rect, vec } from "@shopify/react-native-skia";

/* Port of SK.coin (gold tone): a coin seen at an angle. sq: 0.3 (edge-on) .. 1 (face-on). Positioned by the parent. */
export function Coin({ r, sq = 0.55 }: { r: number; sq?: number }) {
  const ry = r * sq, t = r * 0.2 * (1 - sq * 0.55) + 0.6;
  return (
    <Group>
      <Oval x={-r} y={t - ry} width={2 * r} height={2 * ry} color="#7C4F0A" />
      <Rect x={-r} y={0} width={2 * r} height={t}>
        <LinearGradient start={vec(-r, 0)} end={vec(r, 0)} colors={["#8F5E0E", "#C48A1E", "#E3AE3E", "#7C4F0A"]} positions={[0, 0.35, 0.6, 1]} />
      </Rect>
      <Oval x={-r} y={-ry} width={2 * r} height={2 * ry}>
        <LinearGradient start={vec(-r, -ry)} end={vec(r, ry)} colors={["#FFF1B8", "#F6CF5C", "#E2A92C", "#F3CC63", "#C98C1C"]} positions={[0, 0.28, 0.55, 0.8, 1]} />
      </Oval>
      <Oval x={-r * 0.8} y={-ry * 0.8} width={1.6 * r} height={1.6 * ry} opacity={0.9}>
        <RadialGradient c={vec(-0.16 * r, -0.24 * ry)} r={1.12 * r} colors={["#FCE08A", "#D9A030"]} transform={[{ scaleY: ry / r }]} origin={vec(-0.16 * r, -0.24 * ry)} />
      </Oval>
      <Oval x={-r * 0.8} y={-ry * 0.8} width={1.6 * r} height={1.6 * ry} color="#B98117" style="stroke" strokeWidth={r * 0.1} opacity={0.9} />
      {sq > 0.5 ? <Oval x={-r * 0.42} y={-ry * 0.42} width={0.84 * r} height={0.84 * ry} color="#B98117" style="stroke" strokeWidth={r * 0.07} opacity={0.55} /> : null}
      <Oval x={-r * 0.32 - r * 0.38} y={-ry * 0.38 - ry * 0.2} width={0.76 * r} height={0.4 * ry} color="#FFF6D2" opacity={0.6} />
    </Group>
  );
}
