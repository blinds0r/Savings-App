import React, { forwardRef, useImperativeHandle, useMemo } from "react";
import { Canvas, Circle, Group, Rect, Path, Skia } from "@shopify/react-native-skia";
import { useSharedValue, withTiming, withRepeat, useDerivedValue, Easing, runOnJS, cancelAnimation , ReduceMotion } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import { fitBox } from "../contract";

/* A tiny visual that exercises the whole pipeline: static Skia, a resting loop, an add and a milestone. */
const BOX = { x: 0, y: 0, w: 346, h: 236 };

const Scene = forwardRef<SceneHandle, SceneProps>(function ProbeScene({ state, width, height, motion }, ref) {
  const fit = useMemo(() => fitBox(BOX, width, height), [width, height]);
  const clock = useSharedValue(0);
  const addT = useSharedValue(0);
  const msT = useSharedValue(0);
  React.useEffect(() => { clock.value = 0; clock.value = withRepeat(withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: 4000, easing: Easing.linear }), -1, false, undefined, ReduceMotion.Never); return () => cancelAnimation(clock); }, []);
  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => { addT.value = 0; addT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? 900 : 0 }, () => { runOnJS(res)(); }); }),
    playMilestone: () => new Promise<void>((res) => { msT.value = 0; msT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? 1200 : 0 }, () => { runOnJS(res)(); }); }),
    cancel: () => { cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0; },
  }), [motion]);
  const transform = useMemo(() => [{ translateX: fit.tx }, { translateY: fit.ty }, { scale: fit.scale }], [fit]);
  const bob = useDerivedValue(() => Math.sin(clock.value * Math.PI * 2) * 4);
  const coinY = useDerivedValue(() => -30 + addT.value * (200 - 236 * state.pct * 0.6));
  const ringR = useDerivedValue(() => 10 + msT.value * 160);
  const ringO = useDerivedValue(() => 1 - msT.value);
  const fillH = 180 * state.pct;
  const star = useMemo(() => { const b = Skia.PathBuilder.Make(); b.moveTo(20, 0); for (let i = 1; i < 10; i++) { const r = i % 2 ? 8 : 20, a = (i * Math.PI) / 5; b.lineTo(Math.cos(a) * r, Math.sin(a) * r); } b.close(); return b.build(); }, []);
  const g = useDerivedValue(() => [{ translateY: bob.value }]);
  return (
    <Canvas style={{ width, height }}>
      <Group transform={transform}>
        <Rect x={0} y={0} width={346} height={236} color="#E2EEE7" />
        <Group transform={g}>
          <Rect x={60} y={216 - fillH} width={226} height={fillH} color="#F2C14E" />
          <Rect x={60} y={36} width={226} height={180} color="#DD879F" style="stroke" strokeWidth={4} />
          <Circle cx={173} cy={coinY} r={10} color="#B07A12" />
        </Group>
        <Circle cx={173} cy={120} r={ringR} color="#FFFFFF" style="stroke" strokeWidth={3} opacity={ringO} />
        <Group transform={[{ translateX: 300 }, { translateY: 40 }]}><Path path={star} color="#2B2330" /></Group>
      </Group>
    </Canvas>
  );
});

export const PROBE: VisualDef = { key: "probe", box: BOX, plain: "#E2EEE7", backgrounds: {}, Scene };
