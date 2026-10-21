import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SKINS, SKIN_KEYS } from "../copy";
import { amtProblem, fmt, parseAmt } from "../model/logic";
import type { Mode, Settings, SkinKey } from "../model/types";
import { PALETTES } from "../theme";
import { BigAmount, Btn, Card, Chip, Field, Input, Row, T, ThemeCtx } from "../ui";
import { VISUALS } from "../visuals";

export function Onboarding({ initial, onDone }: { initial: Settings; onDone: (s: Partial<Settings>) => void }) {
  const ins = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [target, setTarget] = useState(String(initial.target));
  const [monthly, setMonthly] = useState(String(initial.monthly));
  const [name, setName] = useState(initial.goalName);
  const [skin, setSkin] = useState<SkinKey>(initial.skin);
  const [msg, setMsg] = useState("");
  const m = mode === "monthly", amtStr = m ? monthly : target, setAmt = m ? setMonthly : setTarget;
  const amt = parseAmt(amtStr), presets = m ? [200, 400, 800] : [1000, 3000, 5000];
  const p = PALETTES[step === 2 ? skin : "glass"];
  const goal = amt > 0 ? amt : 3000;
  const previews = useMemo(() => ({ pct: 0.42, surplus: 0, goal }), [goal]);
  return (
    <ThemeCtx.Provider value={p}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: ins.top + 16, paddingBottom: ins.bottom + 24, gap: 18 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Row style={{ justifyContent: "space-between" }}>
          <T kind="display" style={{ fontSize: 17 }}>Skipped It</T>
          <View accessibilityLabel={`Step ${step} of 2`} style={{ flexDirection: "row", gap: 6 }}>{[1, 2].map((i) => <View key={i} style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: i <= step ? p.fg : p.line }} />)}</View>
        </Row>
        {step === 1 ? (
          <>
            <View style={{ gap: 8 }}>
              <T kind="eyebrow">Step 1 · Your goal</T>
              <T kind="display" style={{ fontSize: 34, lineHeight: 36 }}>How do you want to save?</T>
              <T kind="muted">Every time you skip something you were about to buy, that money lands here instead.</T>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {([["target", "Toward a target", "One pile that grows until you reach it."], ["monthly", "A monthly goal", "A fresh pile every month. Beat it and the extra piles up beside it."]] as const).map(([v, t, d]) => (
                <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: mode === v }} onPress={() => { setMode(v); setMsg(""); }} style={[st.modeCard, { backgroundColor: p.surface, borderColor: mode === v ? p.fg : p.line }]}>
                  <T kind="semi" style={{ fontSize: 16 }}>{t}</T><T kind="note" style={{ fontSize: 13 }}>{d}</T>
                </Pressable>
              ))}
            </View>
            <Card>
              <Field label={m ? "Goal each month" : "Target"}><BigAmount testID="onbAmt" value={amtStr} onChange={(v) => { setAmt(v); setMsg(""); }} /></Field>
              <Row style={{ flexWrap: "wrap" }}>{presets.map((v) => <Chip key={v} title={fmt(v)} on={amt === v} onPress={() => setAmt(String(v))} />)}</Row>
              <T kind="note">{m ? "Pick something you can beat in a good month. Beating it is the fun part." : "A first target between $1,000 and $5,000 tends to work best: big enough to matter, close enough to feel."}</T>
            </Card>
            <Card>
              <Field label="Name it (optional)"><Input value={name} onChangeText={setName} maxLength={30} placeholder="Trip fund, new couch, rainy day…" /></Field>
              <T kind="note">A goal with a name is easier to protect when you{"'"}re standing at the checkout.</T>
            </Card>
            {msg ? <T kind="note" style={{ color: p.accent }}>{msg}</T> : null}
            <Btn big title="Set my goal" testID="onbNext" onPress={() => { const prob = amtProblem(amtStr, amt); if (!(amt > 0) || prob) { setMsg(prob || "Enter an amount above $0 to continue."); return; } setStep(2); }} />
          </>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <T kind="eyebrow">Step 2 · Your visual</T>
              <T kind="display" style={{ fontSize: 34, lineHeight: 36 }}>Choose how your savings look</T>
              <T kind="muted">Each skip adds to the picture. Change it anytime in Settings.</T>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {SKIN_KEYS.map((k) => { const V = VISUALS[k], on = skin === k; return (
                <Pressable key={k} testID={`vcard-${k}`} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setSkin(k)} style={[st.vcard, { backgroundColor: p.surface, borderColor: on ? p.accent : p.line, width: "48%" }]}>
                  <View style={{ borderRadius: 10, overflow: "hidden", backgroundColor: V.plain, height: 110 }}><V.Scene state={previews} width={160} height={110} motion={false} background={null} /></View>
                  <T kind="semi" style={{ fontSize: 14 }}>{SKINS[k].name}</T><T kind="note">{SKINS[k].desc(goal)}</T>
                </Pressable>); })}
            </View>
            <Row><Btn kind="ghost" title="Back" onPress={() => setStep(1)} /><Btn big title="Start saving" testID="onbDone" style={{ flex: 1 }} onPress={() => onDone({ onboarded: true, mode, target: m ? initial.target : amt, monthly: m ? amt : initial.monthly, goalName: name.trim(), skin, ackGoal: 0 })} /></Row>
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemeCtx.Provider>
  );
}
const st = StyleSheet.create({
  modeCard: { flex: 1, padding: 14, borderRadius: 18, borderWidth: 2, gap: 6 },
  vcard: { padding: 8, borderRadius: 16, borderWidth: 2, gap: 6 },
});
