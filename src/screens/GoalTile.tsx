import React from "react";
import { View } from "react-native";
import { fmt, pctTxt, r2 } from "../model/logic";
import { FONT } from "../theme";
import { T, useTheme } from "../ui";

/* Target mode: the goal in its own tile above the amount ("Saving for Longines HQ · Goal $3,000"), with a progress
 * bar and how far there is to go. Replaces the small eyebrow and the vertical milestone ladder. */
export function GoalTile({ name, goal, t, pct, surplus }: { name: string; goal: number; t: number; pct: number; surplus: number }) {
  const p = useTheme();
  const done = surplus > 0 || pct >= 1;
  const fill = Math.max(0, Math.min(pct, 1));
  const left = done ? "Goal reached" : `${pctTxt(pct)} there`;
  const right = surplus > 0 ? `${fmt(surplus)} over` : done ? "" : `${fmt(r2(Math.max(goal - t, 0)))} to go`;
  return (
    <View testID="goalTile" accessible accessibilityLabel={`Saving for ${name}. Goal ${fmt(goal)}. ${left}${right ? `, ${right}` : ""}.`}
      style={{ backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T kind="eyebrow" style={{ fontSize: 11 }}>Saving for</T>
          <T numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONT.display, fontSize: 24, lineHeight: 28, color: p.fg, letterSpacing: -0.4 }}>{name}</T>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <T kind="eyebrow" style={{ fontSize: 11 }}>Goal</T>
          <T style={{ fontFamily: FONT.display, fontSize: 24, lineHeight: 28, color: p.fg, letterSpacing: -0.4, fontVariant: ["tabular-nums"] }}>{fmt(goal)}</T>
        </View>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: p.line, overflow: "hidden" }}>
        <View testID="goalBar" style={{ width: `${fill * 100}%`, height: 10, borderRadius: 5, backgroundColor: p.msHit }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <T style={{ fontFamily: FONT.bodyBold, fontSize: 13, lineHeight: 17, color: p.fg }}>{left}</T>
        {right ? <T style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 17, color: p.muted }}>{right}</T> : null}
      </View>
    </View>
  );
}
