import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Canvas, Circle, Path, Skia } from "@shopify/react-native-skia";
import { dateOf, fmt, yearSummary } from "../model/logic";
import type { Item, Settings, SkinKey } from "../model/types";
import { FONT, type Palette } from "../theme";
import { Btn, Row, Sheet, T, useTheme } from "../ui";

/* ---------- the three slim tiles at the top of the home screen (both modes) ---------- */
// The "All time" tile takes the visual's own button colour; value and arrow badge are tuned per visual for contrast.
const TOTAL_INK: Record<SkinKey, { label: string; value: string; badge: string; arrow: string }> = {
  glass: { label: "rgba(255,255,255,0.62)", value: "#E3A92B", badge: "#E3A92B", arrow: "#2B2330" },
  crow: { label: "rgba(255,255,255,0.62)", value: "#F2C14E", badge: "#F2C14E", arrow: "#1C1A22" },
  summit: { label: "rgba(255,255,255,0.62)", value: "#F26B3A", badge: "#F26B3A", arrow: "#1D2A3A" },
  firefly: { label: "rgba(13,19,48,0.7)", value: "#0D1330", badge: "#0D1330", arrow: "#E6F57A" },
  tree: { label: "rgba(255,255,255,0.7)", value: "#FFFFFF", badge: "#BFE5C9", arrow: "#2F6F73" },
  galaxy: { label: "rgba(11,10,26,0.7)", value: "#0B0A1A", badge: "#0B0A1A", arrow: "#FFD9A8" },
  rocket: { label: "rgba(30,37,48,0.7)", value: "#1E2530", badge: "#1E2530", arrow: "#F2C14E" },
};

function Arrow({ color }: { color: string }) {
  const path = useMemo(() => Skia.Path.MakeFromSVGString("M7 17L17 7M9 7h8v8") || Skia.Path.Make(), []);
  return <Canvas style={{ width: 10, height: 10 }}><Path path={path} color={color} style="stroke" strokeWidth={3.2} strokeCap="round" strokeJoin="round" transform={[{ scale: 10 / 24 }]} /></Canvas>;
}

export function TopTiles({ skin, first, second, total, onTotal }: { skin: SkinKey; first: [string, string]; second: [string, string]; total: number; onTotal: () => void }) {
  const p = useTheme(), ink = TOTAL_INK[skin];
  const small = (v: string) => (v.length > 9 ? 13 : v.length > 7 ? 15 : 17);
  const tile = (k: string, v: string) => (
    <View style={[st.tile, { backgroundColor: p.surface }]} accessibilityLabel={`${k}: ${v}`}>
      <T style={[st.k, { color: p.muted }]}>{k}</T>
      <T numberOfLines={1} style={[st.v, { color: p.fg, fontSize: small(v) }]}>{v}</T>
    </View>
  );
  const tv = fmt(total);
  return (
    <Row style={{ gap: 6 }}>
      {tile(first[0], first[1])}
      {tile(second[0], second[1])}
      <Pressable testID="allTime" accessibilityRole="button" accessibilityLabel={`All time: ${tv} saved. Open your year.`} onPress={onTotal}
        style={({ pressed }) => [st.tile, st.total, { backgroundColor: p.btnBg, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <T style={[st.k, { color: ink.label }]}>All time</T>
          <T numberOfLines={1} style={[st.v, { color: ink.value, fontSize: small(tv) }]}>{tv}</T>
        </View>
        <View style={[st.badge, { backgroundColor: ink.badge }]}><Arrow color={ink.arrow} /></View>
      </Pressable>
    </Row>
  );
}

/* ---------- running total chart ---------- */
function Curve({ curve, width, p }: { curve: { t: number; v: number }[]; width: number; p: Palette }) {
  const H = 92, pad = 6;
  const { line, area, end } = useMemo(() => {
    const max = Math.max(1, ...curve.map((c) => c.v));
    const x = (t: number) => pad + t * (width - pad * 2), y = (v: number) => H - pad - (v / max) * (H - pad * 2);
    const b = Skia.PathBuilder.Make(), a = Skia.PathBuilder.Make();
    curve.forEach((c, i) => { if (i) b.lineTo(x(c.t), y(c.v)); else b.moveTo(x(c.t), y(c.v)); });
    a.moveTo(x(0), H - pad); curve.forEach((c) => a.lineTo(x(c.t), y(c.v))); a.lineTo(x(1), H - pad); a.close();
    const last = curve[curve.length - 1];
    return { line: b.build(), area: a.build(), end: { x: x(last.t), y: y(last.v) } };
  }, [curve, width]);
  const stroke = p.dark ? p.msHit : p.msHitEdge;
  return (
    <Canvas style={{ width, height: H }} accessibilityLabel="Running total over time">
      <Path path={area} color={p.msHit} opacity={0.28} />
      <Path path={line} color={stroke} style="stroke" strokeWidth={2.5} strokeJoin="round" strokeCap="round" />
      <Circle cx={end.x} cy={end.y} r={5} color={stroke} />
    </Canvas>
  );
}

/* ---------- the "Your year" sheet ---------- */
export function YearSheet({ open, onClose, items, s, onShare }: { open: boolean; onClose: () => void; items: Item[]; s: Settings; onShare: () => void }) {
  const p = useTheme();
  const monthly = s.mode === "monthly";
  const y = useMemo(() => yearSummary(items, monthly ? s.monthly : null), [items, monthly, s.monthly]);
  const [w, setW] = useState(0);
  const beaten = y.months.filter((m) => m.beaten).length, done = y.months.filter((m) => !m.current).length;
  const day = (at: string) => dateOf(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <Sheet open={open} onClose={onClose} label="Your year">
      <View style={{ gap: 2 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <T kind="eyebrow">{y.count ? "Your year so far" : "Your year"}</T>
        <T kind="display" testID="yearTotal" style={{ fontSize: 48, lineHeight: 52, fontVariant: ["tabular-nums"] }}>{fmt(y.total)}</T>
        <T kind="muted">{y.count ? `saved since ${y.since} · ${y.count} save${y.count === 1 ? "" : "s"}` : "Nothing logged yet. Your first skip or save starts the count."}</T>
        {!monthly && s.bankedGoals > 0 ? <T kind="note">Includes {fmt(s.banked)} banked from {s.bankedGoals === 1 ? "one finished goal" : `${s.bankedGoals} finished goals`}</T> : null}
      </View>

      {y.count && w > 0 ? <Curve curve={y.curve} width={w} p={p} /> : null}

      {y.months.length ? (
        <View style={{ gap: 6 }}>
          {monthly && done > 0 ? <T kind="note">{beaten} of {done} finished month{done === 1 ? "" : "s"} beat your {fmt(s.monthly)} goal</T> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[...y.months].reverse().map((m) => (
              <View key={m.key} accessibilityLabel={`${m.label}: ${fmt(m.value)}${m.beaten ? ", goal beaten" : ""}${m.current ? ", so far" : ""}`}
                style={[st.mo, { backgroundColor: p.surface, borderColor: m.current ? p.line : m.beaten ? p.msHit : "transparent", borderStyle: m.current ? "dashed" : "solid", borderWidth: m.current || m.beaten ? 1.5 : 0 }]}>
                <T style={{ fontSize: 12, color: p.muted, fontFamily: FONT.body }}>{m.label}{m.beaten ? " ✓" : ""}</T>
                <T style={{ fontSize: 15, fontFamily: FONT.bodyBold, color: p.fg, fontVariant: ["tabular-nums"] }}>{fmt(m.value)}</T>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {y.top.length ? (
        <View>
          <T kind="display" style={{ fontSize: 18, lineHeight: 22, paddingBottom: 2 }}>Biggest saves</T>
          {y.top.map((it) => (
            <View key={it.id} style={[st.row, { borderBottomColor: p.line }]}>
              <View style={{ flex: 1, minWidth: 0 }}><T kind="semi" numberOfLines={1}>{it.what || "Something"}</T><T kind="note">{day(it.at)}</T></View>
              <T style={{ fontFamily: FONT.bodyBold, fontSize: 16, color: p.accent, fontVariant: ["tabular-nums"] }}>{fmt(it.amount)}</T>
            </View>
          ))}
        </View>
      ) : null}

      {y.count ? (
        <Row style={{ gap: 6 }}>
          {y.weekday ? <View style={[st.pair, { backgroundColor: p.surface }]}><T kind="note" style={{ fontSize: 12 }}>You save most on</T><T kind="bold">{y.weekday.name} · {y.weekday.n} of {y.count}</T></View> : null}
          <View style={[st.pair, { backgroundColor: p.surface }]}><T kind="note" style={{ fontSize: 12 }}>Typical save</T><T kind="bold">{fmt(y.typical)}</T></View>
        </Row>
      ) : null}

      <Row style={{ gap: 8, paddingTop: 4 }}>
        {y.count ? <Btn big title="Share progress" style={{ flex: 1 }} onPress={onShare} /> : null}
        <Btn kind="ghost" title="Close" style={y.count ? undefined : { flex: 1 }} onPress={onClose} testID="yearClose" />
      </Row>
    </Sheet>
  );
}

const st = StyleSheet.create({
  tile: { flex: 1, minWidth: 0, height: 48, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 7, justifyContent: "center", gap: 1 },
  total: { flexDirection: "row", alignItems: "center", gap: 6 },
  k: { fontFamily: FONT.bodyBold, fontSize: 9.5, lineHeight: 12, letterSpacing: 1.3, textTransform: "uppercase" },
  v: { fontFamily: FONT.displayMed, lineHeight: 20, fontVariant: ["tabular-nums"] },
  badge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  mo: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, minWidth: 74, gap: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, gap: 10 },
  pair: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 1 },
});
