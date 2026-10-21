import React from "react";
import { Text, View } from "react-native";
import { FR, shortAmt } from "../model/logic";
import type { SkinKey } from "../model/types";
import { FONT } from "../theme";

/* Milestone ladder: six stacked segments on the left of the stage, one per named milestone, each sized to the gap it
 * covers. Reached segments are solid in the visual's accent, the current one part-filled, the rest a faint track. */
const LADDER: Record<SkinKey, { fill: string; track: string; ink: string; inkMuted: string; glow?: string; halo?: string }> = {
  glass: { fill: "#D9A441", track: "rgba(40,30,50,0.14)", ink: "#4A3A2A", inkMuted: "rgba(74,58,42,0.6)", halo: "rgba(226,238,231,0.85)" },
  crow: { fill: "#E4B351", track: "rgba(60,36,18,0.28)", ink: "#FFF3D6", inkMuted: "rgba(255,243,214,0.7)", halo: "rgba(0,0,0,0.35)" },
  summit: { fill: "#F26B3A", track: "rgba(29,42,58,0.16)", ink: "#1D2A3A", inkMuted: "rgba(29,42,58,0.6)", halo: "rgba(226,232,239,0.85)" },
  firefly: { fill: "#E8FF7A", track: "rgba(255,255,255,0.14)", ink: "#E8FF7A", inkMuted: "rgba(255,255,255,0.55)", glow: "rgba(232,255,122,0.6)" },
  tree: { fill: "#2E7D45", track: "rgba(255,255,255,0.55)", ink: "#1F4D2C", inkMuted: "rgba(31,77,44,0.6)", halo: "rgba(227,238,220,0.85)" },
  galaxy: { fill: "#FFD9A8", track: "rgba(255,255,255,0.14)", ink: "#FFD9A8", inkMuted: "rgba(255,255,255,0.55)", glow: "rgba(255,217,168,0.5)" },
};
const GAP = 3, W = 8, INSET = 14;

export function Ladder({ skin, pct, goal, height, side = "left", testID }: { skin: SkinKey; pct: number; goal: number; height: number; side?: "left" | "right"; testID?: string }) {
  const c = LADDER[skin];
  const H = Math.max(60, height - INSET * 2 - GAP * (FR.length - 1));
  const p = Math.max(0, Math.min(pct, 1));
  // reached index: the highest milestone at or below p; current segment is the next one
  const segs = FR.map((fr, i) => {
    const prev = i ? FR[i - 1] : 0, span = fr - prev, h = Math.max(6, Math.round(span * H));
    const bottom = FR.slice(0, i).reduce((a, f, j) => a + Math.max(6, Math.round((f - (j ? FR[j - 1] : 0)) * H)) + GAP, 0);
    const done = p >= fr - 1e-9, frac = done ? 1 : p > prev ? (p - prev) / span : 0;
    return { key: i, fr, h, bottom, done, frac, prev };
  });
  const cur = segs.find((x) => !x.done);
  const last = [...segs].reverse().find((x) => x.done);
  const edge = side === "left" ? { left: INSET } : { right: INSET };
  const labelEdge = side === "left" ? { left: INSET + W + 6 } : { right: INSET + W + 6 };
  const labelStyle = { fontFamily: FONT.bodySemi, fontSize: 10, lineHeight: 12, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 } as const;
  const glow = c.glow ? { shadowColor: c.fill, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null;
  return (
    <View pointerEvents="none" testID={testID} accessibilityLabel={`${Math.round(p * 100)}% of the way, ${last ? `${shortAmt(last.fr * goal)} reached` : "no milestone yet"}`} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
      {segs.map((sg) => (
        <View key={sg.key} style={[{ position: "absolute", bottom: INSET + sg.bottom, width: W, height: sg.h, borderRadius: 3, backgroundColor: c.track, overflow: "hidden" }, edge]}>
          {sg.frac > 0 ? <View style={[{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.round(sg.h * sg.frac), backgroundColor: c.fill, borderRadius: 3 }, sg.done ? glow : null]} /> : null}
        </View>
      ))}
      {last ? <Text style={[labelStyle, labelEdge, { position: "absolute", bottom: INSET + last.bottom + last.h - 12, color: c.ink, backgroundColor: c.halo }]}>{shortAmt(last.fr * goal)} ✓</Text> : null}
      {cur ? <Text style={[labelStyle, labelEdge, { position: "absolute", bottom: INSET + cur.bottom + cur.h - 12, color: c.inkMuted, backgroundColor: c.halo }]}>{shortAmt(cur.fr * goal)}</Text> : null}
      {cur && cur.fr < 1 ? <Text style={[labelStyle, labelEdge, { position: "absolute", bottom: INSET + segs[segs.length - 1].bottom + segs[segs.length - 1].h - 12, color: c.inkMuted, backgroundColor: c.halo }]}>{shortAmt(goal)}</Text> : null}
    </View>
  );
}
