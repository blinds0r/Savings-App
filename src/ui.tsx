import React, { createContext, useContext, useEffect, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, TextStyle, KeyboardAvoidingView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT, Palette, PALETTES } from "./theme";

export const ThemeCtx = createContext<Palette>(PALETTES.glass);
export const useTheme = () => useContext(ThemeCtx);

/* ---------- text ---------- */
export function T({ style, kind = "body", children, ...rest }: { style?: TextStyle | TextStyle[]; kind?: "body" | "med" | "semi" | "bold" | "display" | "eyebrow" | "muted" | "note"; children?: React.ReactNode } & React.ComponentProps<typeof Text>) {
  const p = useTheme();
  const base: TextStyle =
    kind === "display" ? { fontFamily: FONT.display, color: p.fg, letterSpacing: -0.8 }
    : kind === "eyebrow" ? { fontFamily: FONT.bodyBold, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: p.muted }
    : kind === "muted" ? { fontFamily: FONT.body, fontSize: 15, color: p.muted, lineHeight: 21 }
    : kind === "note" ? { fontFamily: FONT.body, fontSize: 12, color: p.muted, lineHeight: 17 }
    : { fontFamily: kind === "bold" ? FONT.bodyBold : kind === "semi" ? FONT.bodySemi : kind === "med" ? FONT.bodyMed : FONT.body, fontSize: 15, color: p.fg, lineHeight: 21 };
  return <Text {...rest} style={[base, style]}>{children}</Text>;
}

/* ---------- buttons ---------- */
export function Btn({ title, onPress, kind = "primary", big, disabled, dim, style, icon, testID }: { title: string; onPress?: () => void; kind?: "primary" | "ghost"; big?: boolean; disabled?: boolean; dim?: boolean; style?: ViewStyle; icon?: React.ReactNode; testID?: string }) {
  const p = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.btn, big && s.btnBig, kind === "primary" ? { backgroundColor: p.btnBg } : { backgroundColor: "transparent", borderWidth: 1, borderColor: p.line }, (disabled || dim) && { opacity: 0.45 }, pressed && !disabled && !dim && { opacity: 0.85 }, style]}>
      {icon}
      <Text style={{ fontFamily: FONT.bodyBold, fontSize: big ? 16 : 15, color: kind === "primary" ? p.btnFg : p.fg }}>{title}</Text>
    </Pressable>
  );
}
export function IconBtn({ onPress, label, children, testID }: { onPress: () => void; label: string; children: React.ReactNode; testID?: string }) {
  const p = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.iconBtn, { backgroundColor: p.surface, borderColor: p.line }, pressed && { opacity: 0.7 }]}>{children}</Pressable>;
}
export function Chip({ title, on, onPress, swatch, testID }: { title: string; on?: boolean; onPress: () => void; swatch?: [string, string]; testID?: string }) {
  const p = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!on }} aria-selected={!!on} onPress={onPress} style={[s.chip, { borderColor: on ? p.fg : p.line, backgroundColor: on ? p.fg : p.surface2 }, swatch && { paddingLeft: 6 }]}>
      {swatch && <View style={[s.swatch, { backgroundColor: swatch[0] }]}><View style={[s.swatchDot, { backgroundColor: swatch[1] }]} /></View>}
      <Text style={{ fontFamily: FONT.bodySemi, fontSize: 14, color: on ? p.bg : p.fg }}>{title}</Text>
    </Pressable>
  );
}
export function Seg<Tv extends string | number>({ options, value, onChange }: { options: { v: Tv; label: string }[]; value: Tv; onChange: (v: Tv) => void }) {
  const p = useTheme();
  return (
    <View style={[s.seg, { borderColor: p.line }]}>
      {options.map((o) => <Pressable key={String(o.v)} accessibilityRole="button" accessibilityState={{ selected: o.v === value }} aria-selected={o.v === value} onPress={() => onChange(o.v)} style={[s.segBtn, o.v === value && { backgroundColor: p.fg }]}><Text style={{ fontFamily: FONT.bodyMed, fontSize: 14, color: o.v === value ? p.bg : p.fg }}>{o.label}</Text></Pressable>)}
    </View>
  );
}
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const p = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} aria-checked={on} accessibilityLabel={label} onPress={() => onChange(!on)} style={s.switchHit}>
      <View style={[s.switchTrack, { backgroundColor: on ? p.btnBg : p.line }]}><View style={[s.switchKnob, { transform: [{ translateX: on ? 20 : 0 }], backgroundColor: on && p.dark ? p.bg : "#FFFFFF" }]} /></View>
    </Pressable>
  );
}

/* ---------- fields ---------- */
export type TextInputRef = React.ComponentRef<typeof TextInput>;
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 6 }}><T kind="eyebrow" style={{ fontSize: 11 }}>{label}</T>{children}</View>;
}
export function Input(props: TextInputProps & { big?: boolean; ref?: React.Ref<TextInputRef> }) {
  const p = useTheme();
  return <TextInput placeholderTextColor={p.muted} {...props} style={[s.input, { color: p.fg, backgroundColor: p.surface, borderColor: p.line }, props.style]} />;
}
export function BigAmount({ value, onChange, autoFocus, onSubmit, testID, returnKeyType = "done", invalid, ref }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; onSubmit?: () => void; testID?: string; returnKeyType?: "done" | "next"; invalid?: boolean; ref?: React.Ref<TextInputRef> }) {
  const p = useTheme(); const [focus, setFocus] = useState(false);
  return (
    <View style={[s.bigAmt, { borderBottomColor: invalid ? p.err : focus ? p.fg : p.line }]}>
      <Text style={{ fontFamily: FONT.displayMed, fontSize: 34, color: p.muted }}>$</Text>
      <TextInput ref={ref} testID={testID} value={value} onChangeText={onChange} autoFocus={autoFocus} aria-invalid={invalid || undefined} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} keyboardType="decimal-pad" inputMode="decimal" placeholder="0" placeholderTextColor={p.line} returnKeyType={returnKeyType} submitBehavior={returnKeyType === "next" ? "submit" : undefined} onSubmitEditing={onSubmit}
        style={{ flex: 1, minWidth: 0, fontFamily: FONT.display, fontSize: 48, color: p.fg, padding: 0, letterSpacing: -1, fontVariant: ["tabular-nums"], ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) }} />
    </View>
  );
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { const p = useTheme(); return <View style={[s.card, { backgroundColor: p.surface }, style]}>{children}</View>; }
export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>; }
export function SRow({ label, sub, right, last }: { label: string; sub?: string; right: React.ReactNode; last?: boolean }) {
  const p = useTheme();
  return <View style={[s.srow, !last && { borderBottomWidth: 1, borderBottomColor: p.line }]}><View style={{ flex: 1, minWidth: 0 }}><T kind="med">{label}</T>{sub ? <T kind="note">{sub}</T> : null}</View>{right}</View>;
}

/* ---------- bottom sheet ---------- */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const p = useTheme(); const ins = useSafeAreaInsets(); const { height } = useWindowDimensions();
  const [y] = useState(() => new Animated.Value(700));
  // `shown` stays true while the sheet slides away, so the Modal never unmounts for a frame between open and closing
  const [shown, setShown] = useState(false);
  // the scrim only closes once the slide-in has finished, so the second tap of a double tap on the opener does not land on it
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (open) { const t = setTimeout(() => { setShown(true); setReady(false); }, 0); Animated.timing(y, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) setReady(true); }); return () => clearTimeout(t); }
    if (!shown) return; // never opened: nothing to slide away
    const done = setTimeout(() => { setShown(false); setReady(false); }, 260);
    Animated.timing(y, { toValue: 700, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    return () => clearTimeout(done);
  }, [open, y, shown]);
  if (!open && !shown) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" disabled={!open || !ready} onPress={onClose} style={s.scrim} />
      <KeyboardAvoidingView behavior="padding" style={{ justifyContent: "flex-end", flex: 1 }} pointerEvents="box-none">
        <Animated.View accessibilityViewIsModal accessibilityLabel={label} pointerEvents={open ? "auto" : "none"} style={[s.sheet, { backgroundColor: p.bg, paddingBottom: ins.bottom + 20, maxHeight: height * 0.9, transform: [{ translateY: y }] }]}>
          <View style={[s.grab, { backgroundColor: p.line }]} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>{children}</ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- toast ---------- */
export function Toast({ msg }: { msg: string }) {
  const p = useTheme(); const [o] = useState(() => new Animated.Value(0)); const ins = useSafeAreaInsets();
  useEffect(() => { if (!msg) return; o.setValue(0); Animated.sequence([Animated.timing(o, { toValue: 1, duration: 200, useNativeDriver: true }), Animated.delay(2400), Animated.timing(o, { toValue: 0, duration: 250, useNativeDriver: true })]).start(); }, [msg]);
  if (!msg) return null;
  return <Animated.View pointerEvents="none" style={[s.toast, { backgroundColor: p.fg, opacity: o, bottom: ins.bottom + 84 }]}><Text style={{ fontFamily: FONT.bodySemi, color: p.bg, fontSize: 14 }}>{msg}</Text></Animated.View>;
}

const s = StyleSheet.create({
  btn: { minHeight: 46, borderRadius: 14, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btnBig: { minHeight: 54, borderRadius: 16 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  swatchDot: { width: 12, height: 12, borderRadius: 6 },
  seg: { flexDirection: "row", borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  segBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  switchHit: { width: 56, height: 44, justifyContent: "center", alignItems: "center" },
  switchTrack: { width: 48, height: 28, borderRadius: 14, justifyContent: "center", paddingHorizontal: 3 },
  switchKnob: { width: 22, height: 22, borderRadius: 11 },
  input: { fontFamily: FONT.body, fontSize: 16, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 },
  bigAmt: { flexDirection: "row", alignItems: "baseline", gap: 4, borderBottomWidth: 2, paddingBottom: 6 },
  card: { borderRadius: 18, padding: 16, gap: 12 },
  srow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,.45)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 },
  grab: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  toast: { position: "absolute", alignSelf: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, maxWidth: "90%" },
});
