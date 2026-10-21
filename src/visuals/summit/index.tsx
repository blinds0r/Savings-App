import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from "react";
import { Atlas, Canvas, Circle, DashPathEffect, Group, LinearGradient, Oval, Path, RoundedRect, Rect, Text, useFont, useRectBuffer, useRSXformBuffer, useTexture, vec } from "@shopify/react-native-skia";
import type { SkFont } from "@shopify/react-native-skia";
import { useSharedValue, withTiming, withRepeat, useDerivedValue, Easing, runOnJS, cancelAnimation , ReduceMotion } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { SceneHandle, SceneProps, VisualDef } from "../contract";
import {
  BOX, TRAIL, CAMPS, ORANGE, INK, BASE_VB, FLAKES, SPARKS, SPARK, type VB,
  clamp, clamp01, ph, easeInOut, easeOut, frac, tri, lerp, kf, altTxt, trailAt, trailFrac, hikeBox, fitVB, svgPath, polyline, rangePath,
} from "./lib";

/* Summit: climb a 3,000 m mountain. $ progress maps to altitude (pct x 3,000 m).
   Idle "Weather and breather", add "Steady hike", milestone "Plant a flag", background "Misty valley". */

const FIGTREE = require("@expo-google-fonts/figtree/500Medium/Figtree_500Medium.ttf");
const DEG = Math.PI / 180;
const MS_TOTAL = 2720;

const MTN = svgPath("M44 350 L90 262 L118 280 L160 150 L206 40 L246 118 L274 98 L346 232 L346 350 Z");
const MTN_SHADE = svgPath("M206 40 L246 118 L274 98 L346 232 L346 350 L240 350 L214 200 Z");
const SNOWCAP = svgPath("M206 40 L223.2 73.5 L212 68 L202 82 L194 70 L190 78.3 Z"); // edges follow the ridges: right 40/78, left 46/110 per px
const CONTOURS = svgPath("M0 298.3 H346 M0 246.7 H346 M0 195 H346 M0 143.3 H346 M0 91.7 H346");
const AXIS = svgPath("M36 350 V40");
const TICKS = svgPath("M30 350 H36 M30 246.7 H36 M30 143.3 H36 M30 40 H36");
const TRAIL_PATH = polyline(TRAIL);
const POLE = svgPath("M206 40 V14");
const SUMMIT_FLAG = svgPath("M206 14 L226 20 L206 26 Z");
const LEG1 = svgPath("M0 -7 L-2.6 0"), LEG2 = svgPath("M0 -7 L2.6 0");
const TORSO = svgPath("M0 -15.5 L0 -7");
const ARM = svgPath("M0 -13.5 L4.4 -9.9"), POLE_HAND = svgPath("M4.4 -9.9 L6.6 -0.3");
const HAIR = svgPath("M-3.3 -19 Q0 -23.4 3.3 -19 Z");
const BALLOON = svgPath("M0 -40 C -24 -40, -30 -8, 0 12 C 30 -8, 24 -40, 0 -40 Z");
const BALLOON_HI = svgPath("M0 -40 C -8 -40, -10 -8, 0 12 C 10 -8, 8 -40, 0 -40 Z");
const BALLOON_STR = svgPath("M-6 12 L-7 26 M6 12 L7 26");
const MS_POLE = svgPath("M0 0 V-26"), MS_CLOTH = svgPath("M0 -26 L16 -21 L0 -16 Z");
const SHOULDER = svgPath("M300 150 L346 232 L398 300 L452 286 L560 350 L300 350 Z"), SHOULDER2 = svgPath("M398 300 L452 286 L470 300 Z");
const RANGE1 = rangePath(250, 70, 5, 52), RANGE2 = rangePath(292, 58, 21, 44), RANGE3 = rangePath(330, 44, 8, 36);
const CLOUDS = [[70, 1, 26000], [118, 0.75, 34000], [40, 0.6, 41000]];
const MISTS = [[224, 22, 0.55], [272, 18, 0.6], [318, 16, 0.5], [342, 14, 0.45]];
const MIST_COLORS = ["rgba(255,255,255,0)", "rgba(255,255,255,0.9)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0.9)", "rgba(255,255,255,0)"];
const MIST_POS = [0, 0.25, 0.5, 0.75, 1];

const textW = (font: SkFont, t: string) => font.getGlyphWidths(font.getGlyphIDs(t)).reduce((a, b) => a + b, 0);

interface AddParams { p0: number; p1: number; vb: VB; dur: number; total: number }

/* ---------- background: misty valley (chosen option) ---------- */
function Valley({ clock }: { clock: SharedValue<number> }) {
  const mist = MISTS.map((m, i) => useDerivedValue(() => {
    const d = 22000 + i * 5000, amp = 30 + i * 6;
    return [{ translateX: lerp(-amp, amp, easeInOut(tri((clock.value * 1000 + i * 4000) / d))) }];
  }));
  const band = (i: number) => (
    <Rect key={i} x={-560} y={MISTS[i][0]} width={1460} height={MISTS[i][1]} opacity={MISTS[i][2]} transform={mist[i]}>
      <LinearGradient start={vec(-560, 0)} end={vec(900, 0)} colors={MIST_COLORS} positions={MIST_POS} />
    </Rect>
  );
  return (
    <Group>
      <Rect x={-500} y={-500} width={1346} height={1400}><LinearGradient start={vec(0, -200)} end={vec(0, 350)} colors={["#E4EAF1", "#D2DCE6"]} /></Rect>
      <Path path={RANGE1} color="#C6D0DC" />
      {band(0)}
      <Path path={RANGE2} color="#B4C0CE" />
      {band(1)}
      <Path path={RANGE3} color="#A2B0C1" />
      {band(2)}
      <Path path={SHOULDER} color="#4A5A70" /><Path path={SHOULDER2} color="#56677E" />
      <Rect x={-500} y={350} width={1346} height={600}><LinearGradient start={vec(0, 350)} end={vec(0, 950)} colors={["#A9B6C4", "#94A3B3"]} /></Rect>
      {band(3)}
    </Group>
  );
}

/* ---------- weather: drifting clouds + light snow (one Atlas) ---------- */
function Weather({ clock }: { clock: SharedValue<number> }) {
  const cloudT = CLOUDS.map(([y, s, d], i) => useDerivedValue(() => [{ translateX: -90 + 530 * frac((clock.value * 1000 + d * (0.25 + i * 0.3)) / d) }, { translateY: y }, { scale: s }]));
  const snowTex = useTexture(<Group>{[0, 1, 2, 3, 4, 5].map((i) => <Circle key={i} cx={i * 8 + 4} cy={4} r={2.2} color="#FFFFFF" opacity={(i + 1) / 6} />)}</Group>, { width: 48, height: 8 });
  const snowXf = useRSXformBuffer(FLAKES.length, (xf, i) => {
    "worklet";
    const f = FLAKES[i], life = frac(clock.value / f.T + f.ph);
    const op = life < 0.15 ? (life / 0.15) * 0.95 : 0.95 * (1 - (life - 0.15) / 0.85);
    const s = op < 0.03 ? 0 : f.r / 2.2;
    xf.set(s, 0, f.x + f.drift * life - 4 * s, BOX.y - 6 + f.fall * life - 4 * s);
  });
  const snowRect = useRectBuffer(FLAKES.length, (r, i) => {
    "worklet";
    const f = FLAKES[i], life = frac(clock.value / f.T + f.ph);
    const op = life < 0.15 ? (life / 0.15) * 0.95 : 0.95 * (1 - (life - 0.15) / 0.85);
    const lvl = clamp(Math.round(op * 6), 1, 6);
    r.setXYWH((lvl - 1) * 8, 0, 8, 8);
  });
  return (
    <Group>
      {cloudT.map((t, i) => (
        <Group key={i} transform={t} opacity={0.82} color="#FFFFFF">
          <Oval x={-26} y={-9} width={52} height={18} /><Oval x={-3} y={-15} width={30} height={18} /><Oval x={-22} y={-11} width={24} height={14} />
        </Group>
      ))}
      <Atlas image={snowTex} sprites={snowRect} transforms={snowXf} />
    </Group>
  );
}

/* ---------- the climber (position, breathing, glance, walking legs) ---------- */
function Climber({ clock, addT, addP, msT, pct, font }: { clock: SharedValue<number>; addT: SharedValue<number>; addP: SharedValue<AddParams>; msT: SharedValue<number>; pct: number; font: SkFont | null }) {
  const prog = useDerivedValue(() => { const t = addT.value, a = addP.value; return t > 0 ? a.p0 + (a.p1 - a.p0) * ph(t * a.total, 560, a.dur) : pct; });
  const meT = useDerivedValue(() => { const q = trailAt(prog.value); return [{ translateX: q.x }, { translateY: q.y }]; });
  const faceT = useDerivedValue(() => [{ scaleX: trailAt(prog.value).dir }]);
  const walking = useDerivedValue(() => { const t = addT.value, a = addP.value, ms = t * a.total; return t > 0 && t < 1 && ms >= 560 && ms <= 560 + a.dur ? ms : -1; });
  const figT = useDerivedValue(() => {
    const w = walking.value;
    const base = w >= 0 ? -1.2 * easeInOut(tri(w / 230)) : -0.9 * easeInOut(tri((clock.value * 1000) / 1500));
    const jump = -6 * kf(ph(msT.value * MS_TOTAL, 0, 520), [0, 0.4, 1], [0, 1, 0]);
    return [{ translateY: base + jump }];
  });
  const lg1 = useDerivedValue(() => { const w = walking.value; return [{ rotate: w >= 0 ? (-26 + 52 * easeInOut(tri(w / 230))) * DEG : 0 }]; });
  const lg2 = useDerivedValue(() => { const w = walking.value; return [{ rotate: w >= 0 ? (26 - 52 * easeInOut(tri(w / 230))) * DEG : 0 }]; });
  const headT = useDerivedValue(() => { const u = frac(clock.value / 4.6) * 4.6; return [{ rotate: u < 1.8 ? kf(u / 1.8, [0, 0.25, 0.7, 1], [0, -22, -22, 0]) * DEG : 0 }]; });
  const hide = useDerivedValue(() => { const t = addT.value; return t > 0 && t < 1 ? ph(t * addP.value.total, 0, 200) : 0; });
  const pulseT = useDerivedValue(() => [{ scale: 1 + 1.6 * easeOut(frac(clock.value / 1.8)) }]);
  const pulseO = useDerivedValue(() => 0.9 * (1 - easeOut(frac(clock.value / 1.8))) * (1 - hide.value));
  // altitude counter (the hike's ticking label)
  const ctrO = useDerivedValue(() => { const t = addT.value, a = addP.value, ms = t * a.total; return t > 0 && t < 1 && ms >= 560 ? 1 - ph(ms, 560 + a.dur + 450, 250) : 0; });
  const ctrText = useDerivedValue(() => altTxt(prog.value));
  return (
    <Group transform={meT}>
      <Circle cx={0} cy={0} r={9} color={ORANGE} transform={pulseT} opacity={pulseO} />
      <Group transform={faceT}>
        <Group transform={figT}>
          <Path path={LEG1} color={INK} style="stroke" strokeWidth={2.2} strokeCap="round" transform={lg1} origin={vec(0, -7)} />
          <Path path={LEG2} color={INK} style="stroke" strokeWidth={2.2} strokeCap="round" transform={lg2} origin={vec(0, -7)} />
          <RoundedRect x={-5.6} y={-15.5} width={4.2} height={7.5} r={1.4} color={ORANGE} />
          <RoundedRect x={-5.6} y={-15.5} width={4.2} height={7.5} r={1.4} color={INK} style="stroke" strokeWidth={0.8} />
          <Path path={TORSO} color={INK} style="stroke" strokeWidth={2.8} strokeCap="round" />
          <Path path={ARM} color={INK} style="stroke" strokeWidth={1.9} strokeCap="round" />
          <Path path={POLE_HAND} color="#8B5A2B" style="stroke" strokeWidth={1.2} strokeCap="round" />
          <Group transform={headT} origin={vec(0, -18.6)}>
            <Circle cx={0} cy={-18.6} r={3.3} color="#F6D6B8" />
            <Circle cx={0} cy={-18.6} r={3.3} color={INK} style="stroke" strokeWidth={1} />
            <Path path={HAIR} color="#C24A1F" />
          </Group>
        </Group>
      </Group>
      <Group opacity={ctrO}>
        <RoundedRect x={7} y={-34} width={52} height={15} r={4.5} color={INK} />
        {font && <Text x={12} y={-23.5} text={ctrText} font={font} color="#FFFFFF" />}
      </Group>
    </Group>
  );
}

/* ---------- milestone: plant a flag with rings and sparkles ---------- */
function PlantFlag({ msT, msP }: { msT: SharedValue<number>; msP: SharedValue<{ x: number; y: number }> }) {
  const ms = useDerivedValue(() => msT.value * MS_TOTAL);
  const live = useDerivedValue(() => msT.value > 0 && msT.value < 1);
  const flagT = useDerivedValue(() => [{ translateX: msP.value.x + 4 }, { translateY: msP.value.y }, { scale: kf(easeOut(ph(ms.value, 0, 520)), [0, 0.7, 1], [0, 1.2, 1], false) }]);
  const flagO = useDerivedValue(() => (live.value ? 1 - ph(ms.value, 2420, 300) : 0));
  const clothT = useDerivedValue(() => {
    const u = (ms.value - 520) / 650;
    if (u <= 0 || u >= 3) return [{ scaleX: 1 }];
    const f = frac(u);
    return [{ scaleX: kf(f, [0, 1 / 3, 2 / 3, 1], [1, 0.78, 0.95, 1]) }, { skewY: kf(f, [0, 1 / 3, 2 / 3, 1], [0, 9, -5, 0]) * DEG }];
  });
  const rings = [[0, 8, ORANGE], [180, 7, "#FFFFFF"], [360, 6, ORANGE]] as const;
  const ringR = rings.map(([delay, s]) => useDerivedValue(() => 6 * (1 + (s - 1) * easeOut(ph(ms.value, 520 + delay, 1100)))));
  const ringW = rings.map(([delay, s]) => useDerivedValue(() => 3 * (1 + (s - 1) * easeOut(ph(ms.value, 520 + delay, 1100)))));
  const ringO = rings.map(([delay]) => useDerivedValue(() => { const k = ph(ms.value, 520 + delay, 1100); return live.value && k > 0 && k < 1 ? 0.95 * (1 - easeOut(k)) : 0; }));
  const sparkT = SPARKS.map((sp) => useDerivedValue(() => {
    const e = easeOut(ph(ms.value, 520, sp.dur));
    const d = kf(e, [0, 0.6, 1], [0, sp.d, sp.d * 1.25], false), sc = kf(e, [0, 0.6, 1], [0, 1.1, 0.2], false);
    return [{ translateX: msP.value.x + Math.cos(sp.a) * d }, { translateY: msP.value.y - 14 + Math.sin(sp.a) * d }, { scale: live.value ? sp.s * sc : 0 }];
  }));
  const sparkO = SPARKS.map((sp) => useDerivedValue(() => { const e = easeOut(ph(ms.value, 520, sp.dur)); return e < 0.6 ? 1 : 1 - (e - 0.6) / 0.4; }));
  const ringC = useDerivedValue(() => ({ x: msP.value.x, y: msP.value.y - 6 }));
  return (
    <Group>
      {rings.map((rg, i) => <Circle key={i} c={ringC} r={ringR[i]} color={rg[2]} style="stroke" strokeWidth={ringW[i]} opacity={ringO[i]} />)}
      <Group transform={flagT} opacity={flagO}>
        <Path path={MS_POLE} color={INK} style="stroke" strokeWidth={1.8} strokeCap="round" />
        <Group transform={clothT} origin={vec(0, -26)}>
          <Path path={MS_CLOTH} color={ORANGE} />
          <Path path={MS_CLOTH} color={INK} style="stroke" strokeWidth={0.8} />
        </Group>
      </Group>
      {sparkT.map((t, i) => <Path key={i} path={SPARK} color={ORANGE} transform={t} opacity={sparkO[i]} />)}
    </Group>
  );
}

const Scene = forwardRef<SceneHandle, SceneProps>(function SummitScene({ state, width, height, motion, background }, ref) {
  const pct = clamp01(state.pct || 0), surplus = state.surplus || 0, goal = state.goal || 3000;
  const clock = useSharedValue(0);
  const addT = useSharedValue(0);
  const msT = useSharedValue(0);
  const addP = useSharedValue<AddParams>({ p0: pct, p1: pct, vb: BASE_VB, dur: 1400, total: 3220 });
  const msP = useSharedValue({ x: 0, y: 0 });
  const f9 = useFont(FIGTREE, 9), f10 = useFont(FIGTREE, 10), f11 = useFont(FIGTREE, 11), f85 = useFont(FIGTREE, 8.5);

  useEffect(() => { clock.value = 0; clock.value = withRepeat(withTiming(3600, { reduceMotion: ReduceMotion.Never,  duration: 3600000, easing: Easing.linear }), -1, false, undefined, ReduceMotion.Never); return () => cancelAnimation(clock); }, []);
  // the host re-renders at the new pct once an add resolves: the walk is then baked into `pct`
  useEffect(() => { cancelAnimation(addT); addT.value = 0; }, [pct]);
  useImperativeHandle(ref, () => ({
    playAdd: (amount) => new Promise<void>((res) => {
      const p0 = pct, p1 = clamp01(p0 + (amount || 0) / goal);
      const dur = clamp(700 + (p1 - p0) * 3000 * 14, 800, 2800), total = 560 + dur + 450 + 250 + 560;
      addP.value = { p0, p1, vb: hikeBox(p0, p1), dur, total };
      addT.value = 0;
      addT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? total : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    playMilestone: () => new Promise<void>((res) => {
      const q = trailAt(pct);
      msP.value = { x: q.x, y: q.y };
      msT.value = 0;
      msT.value = withTiming(1, { reduceMotion: ReduceMotion.Never,  duration: motion ? MS_TOTAL : 0, easing: Easing.linear }, () => { runOnJS(res)(); });
    }),
    cancel: () => { cancelAnimation(addT); cancelAnimation(msT); addT.value = 0; msT.value = 0; },
  }), [motion, pct, goal]);

  // camera: the prototype animates the viewBox; here the fitted transform
  const camT = useDerivedValue(() => {
    const t = addT.value;
    if (t <= 0 || t >= 1) return fitVB(BASE_VB, width, height);
    const a = addP.value, ms = t * a.total;
    const k = easeInOut(ph(ms, 0, 560)) * (1 - easeInOut(ph(ms, a.total - 560, 560)));
    const vb: VB = [lerp(BASE_VB[0], a.vb[0], k), lerp(BASE_VB[1], a.vb[1], k), lerp(BASE_VB[2], a.vb[2], k), lerp(BASE_VB[3], a.vb[3], k)];
    return fitVB(vb, width, height);
  });
  const doneEnd = useDerivedValue(() => { const t = addT.value, a = addP.value; const p = t > 0 ? a.p0 + (a.p1 - a.p0) * ph(t * a.total, 560, a.dur) : pct; return Math.max(trailFrac(p), 0.0001); });
  const lblO = useDerivedValue(() => { const t = addT.value; return t > 0 && t < 1 ? 1 - ph(t * addP.value.total, 0, 200) : 1; });
  const flagT = useDerivedValue(() => { const u = frac((clock.value * 1000) / 1100), o = [0, 1 / 3, 2 / 3, 1]; return [{ scaleX: kf(u, o, [1, 0.8, 0.94, 1]) }, { skewY: kf(u, o, [0, 8, -5, 0]) * DEG }]; });
  const balloonT = useDerivedValue(() => [{ translateX: 130 }, { translateY: 4 - clamp01(surplus / goal) * 50 - 5 * easeInOut(tri((clock.value * 1000) / 2400)) }]);

  // static bits that depend on state + fonts
  const me = trailAt(pct);
  const label = useMemo(() => {
    if (!f11) return null;
    const text = `You · ${altTxt(pct)}`, w = textW(f11, text) + 12, left = me.x - 14 - w >= 0;
    return { text, x: left ? me.x - 14 - w : me.x + 14, y: left ? me.y - 26 : me.y - 44, w };
  }, [f11, pct]);
  const camps = useMemo(() => CAMPS.map((f, i) => {
    const c = trailAt(f), hit = pct >= f - 1e-9, text = `Camp ${i + 1}`;
    return { c, hit, text, w: (f10 ? textW(f10, text) : text.length * 5.2) + 8, flag: hit ? svgPath(`M${(c.x + 1).toFixed(1)} ${(c.y - 3).toFixed(1)} v-16 l11 4 -11 4`) : null };
  }), [f10, pct]);

  return (
    <Canvas style={{ width, height }}>
      <Group transform={camT}>
        {background === "valley" ? <Valley clock={clock} /> : <Rect x={-500} y={-500} width={1346} height={1400} color="#E6EDF3" />}
        {surplus > 0 && (
          <Group>
            <Group color="#FFFFFF" opacity={0.9}>
              <Oval x={26} y={-52} width={68} height={24} /><Oval x={56} y={-58} width={44} height={24} /><Oval x={270} y={-21} width={60} height={22} /><Oval x={264} y={-27} width={40} height={22} />
            </Group>
            <Group transform={balloonT}>
              <Path path={BALLOON} color={ORANGE} /><Path path={BALLOON_HI} color="#FFFFFF" opacity={0.55} />
              <Path path={BALLOON_STR} color={INK} style="stroke" strokeWidth={1.2} />
              <RoundedRect x={-9} y={26} width={18} height={10} r={2} color="#8B5A2B" /><Circle cx={0} cy={24} r={2.6} color={INK} />
            </Group>
          </Group>
        )}
        <Path path={MTN} color="#5A6B82" />
        <Path path={MTN_SHADE} color="#4A5A70" />
        <Path path={SNOWCAP} color="#FFFFFF" />
        <Group clip={MTN}><Path path={CONTOURS} color="#8FA0B7" style="stroke" strokeWidth={1} opacity={0.7} /></Group>
        <Weather clock={clock} />
        <Path path={AXIS} color="#9AAABD" style="stroke" strokeWidth={1} />
        <Path path={TICKS} color="#52637A" style="stroke" strokeWidth={1} />
        {f9 && [["0", 353], ["1k", 249.7], ["2k", 146.3], ["3k", 43]].map(([t, y]) => <Text key={t} x={26 - textW(f9, t as string)} y={y as number} text={t as string} font={f9} color="#52637A" />)}
        <Path path={TRAIL_PATH} color="#FFFFFF" style="stroke" strokeWidth={2} strokeCap="round" opacity={0.9}><DashPathEffect intervals={[3, 5]} /></Path>
        <Path path={TRAIL_PATH} color={ORANGE} style="stroke" strokeWidth={3.5} strokeCap="round" strokeJoin="round" start={0} end={doneEnd} />
        <Path path={POLE} color={INK} style="stroke" strokeWidth={2} />
        <Path path={SUMMIT_FLAG} color={ORANGE} transform={flagT} origin={vec(206, 14)} />
        {camps.map((k, i) => (
          <Group key={i}>
            <Circle cx={k.c.x} cy={k.c.y} r={4} color={k.hit ? ORANGE : "#FFFFFF"} />
            <Circle cx={k.c.x} cy={k.c.y} r={4} color={k.hit ? "#FFFFFF" : INK} style="stroke" strokeWidth={2} />
            {k.flag && <><Path path={k.flag} color={ORANGE} /><Path path={k.flag} color={INK} style="stroke" strokeWidth={1.1} /></>}
            <RoundedRect x={k.c.x + 8} y={k.c.y - 8} width={k.w} height={16} r={4} color="#E6EDF3" />
            {f10 && <Text x={k.c.x + 12} y={k.c.y + 3.5} text={k.text} font={f10} color={INK} />}
          </Group>
        ))}
        <Climber clock={clock} addT={addT} addP={addP} msT={msT} pct={pct} font={f85} />
        {label && (
          <Group opacity={lblO}>
            <RoundedRect x={label.x} y={label.y} width={label.w} height={20} r={6} color={INK} />
            <Text x={label.x + 6} y={label.y + 14} text={label.text} font={f11!} color="#FFFFFF" />
          </Group>
        )}
        <PlantFlag msT={msT} msP={msP} />
      </Group>
    </Canvas>
  );
});

export const DEF: VisualDef = {
  key: "summit",
  box: BOX,
  plain: "#E6EDF3",
  backgrounds: { valley: { name: "Misty valley", page: "#E2E8EF" } },
  Scene,
};
