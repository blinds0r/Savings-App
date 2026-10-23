import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SKINS, SKIN_KEYS } from "../copy";
import type { SkinKey } from "../model/types";
import { Sheet, T, useTheme } from "../ui";
import { VISUALS } from "../visuals";

/* The six visual tiles with live previews. Used by onboarding step 2 and the "Change visual" sheet on the home screen. */
export function VisualGrid({ skin, goal, pct = 0.42, onPick }: { skin: SkinKey; goal: number; pct?: number; onPick: (k: SkinKey) => void }) {
  const p = useTheme();
  const previews = useMemo(() => ({ pct, surplus: 0, goal }), [pct, goal]);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {SKIN_KEYS.map((k) => { const V = VISUALS[k], on = skin === k; return (
        <Pressable key={k} testID={`vcard-${k}`} accessibilityRole="button" accessibilityState={{ selected: on }} aria-selected={on} onPress={() => onPick(k)} style={[st.vcard, { backgroundColor: p.surface, borderColor: on ? p.accent : p.line, width: "48%" }]}>
          <View style={{ borderRadius: 10, overflow: "hidden", backgroundColor: V.plain, height: 110 }}><V.Scene state={previews} width={160} height={110} motion={false} background={null} /></View>
          <T kind="semi" style={{ fontSize: 14 }}>{SKINS[k].name}</T><T kind="note">{SKINS[k].desc(goal)}</T>
        </Pressable>); })}
    </View>
  );
}

export function VisualSheet({ open, onClose, skin, goal, pct, onPick }: { open: boolean; onClose: () => void; skin: SkinKey; goal: number; pct: number; onPick: (k: SkinKey) => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Change visual">
      <View style={{ gap: 4 }}>
        <T kind="eyebrow">Your visual</T>
        <T kind="display" style={{ fontSize: 24 }}>Choose how your savings look</T>
        <T kind="muted">Your saves stay the same; only the picture changes.</T>
      </View>
      <VisualGrid skin={skin} goal={goal} pct={Math.max(0.05, Math.min(pct, 1))} onPick={(k) => { onPick(k); onClose(); }} />
      <View style={{ height: 4 }} />
    </Sheet>
  );
}

const st = StyleSheet.create({ vcard: { padding: 8, borderRadius: 16, borderWidth: 2, gap: 6 } });
