import React from "react";
import { Pressable, View } from "react-native";
import type { Streak } from "../model/logic";
import { FONT } from "../theme";
import { T, useTheme } from "../ui";

/* The weekly streak, shown at the top of the home screen in both modes: one dot per week of the streak (older weeks
 * fainter), then this week's dot — solid with a halo once a skip is logged, dashed amber while it's still open.
 * Tapping it while this week is open starts a log. */
const MAX_PAST = 11;

/** compact: for the header row beside the icon buttons: at most 3 past dots, one line, and the note only when the streak needs a log. */
export function StreakRow({ sk, onLog, compact = false }: { sk: Streak; onLog: () => void; compact?: boolean }) {
  const p = useTheme();
  const warn = p.dark ? { line: "#FFB37A", fill: "rgba(255,179,122,0.18)", text: "#FFC9A0" } : { line: "#C2571A", fill: "#F6DCC4", text: "#8A3A10" };
  const total = sk.n; // includes this week only once it's logged
  const pastCount = Math.min(sk.alive ? Math.max(total - 1, 0) : total, compact ? 3 : MAX_PAST);
  const starting = !sk.alive && sk.n === 0;
  const label = starting ? "Start a streak" : `${total}-week streak`;
  const note = sk.alive ? "this week done" : starting ? "one skip or save this week" : sk.daysLeft <= 1 ? "last day" : `${sk.daysLeft} days left`;
  const atRisk = !sk.alive && !starting;
  const a11y = sk.alive ? `${total}-week streak. This week is done.` : starting ? "No streak yet. Log a skip or save this week to start one." : `${total}-week streak. ${note} to keep it. Tap to log one.`;
  const past = Array.from({ length: pastCount }, (_, i) => 0.45 + (0.55 * (i + 1)) / Math.max(pastCount, 1));
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? 8 : 10, minHeight: 28 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {past.map((o, i) => <View key={i} style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: p.msHit, opacity: o }} />)}
        {sk.alive
          ? <View style={{ width: 17, height: 17, borderRadius: 8.5, borderWidth: 1.5, borderColor: p.msHitEdge, alignItems: "center", justifyContent: "center" }}><View style={{ width: 11, height: 11, borderRadius: 5.5, backgroundColor: p.msHit }} /></View>
          : <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderStyle: "dashed", borderColor: atRisk ? warn.line : p.muted, backgroundColor: atRisk ? warn.fill : "transparent" }} />}
      </View>
      <T numberOfLines={1} style={{ fontFamily: FONT.bodyBold, fontSize: 13, lineHeight: 17, flexShrink: 0 }}>{label}</T>
      {compact && !atRisk ? null : <T style={{ fontFamily: atRisk ? FONT.bodySemi : FONT.body, fontSize: 13, lineHeight: 17, color: atRisk ? warn.text : p.muted, flexShrink: 1 }} numberOfLines={1}>· {note}</T>}
    </View>
  );
  if (sk.alive) return <View testID="streak" accessible accessibilityLabel={a11y}>{body}</View>;
  return (
    <Pressable testID="streak" accessibilityRole="button" accessibilityLabel={a11y} onPress={onLog} hitSlop={{ top: 8, bottom: 8 }} style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}
