import React from "react";
import { Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* Test-build crash catcher. JS errors (including Reanimated worklet errors, which are re-thrown on the JS
 * thread) are written to storage before the app dies; the next launch shows them with a Share button so the
 * report can be sent on. Render errors are caught by the boundary and shown in place. */
const KEY = "skippedit.lastCrash";
export type CrashInfo = { message: string; stack: string; at: string; fatal: boolean };

type EU = { getGlobalHandler?: () => ((e: unknown, fatal?: boolean) => void) | undefined; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
const describe = (e: unknown): { message: string; stack: string } => {
  const err = e as { message?: unknown; stack?: unknown } | null;
  return { message: String(err?.message ?? e), stack: String(err?.stack ?? "").slice(0, 6000) };
};

let installed = false;
export function installCrashHandler() {
  if (installed || Platform.OS === "web") return;
  installed = true;
  const eu = (globalThis as unknown as { ErrorUtils?: EU }).ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler?.();
  eu.setGlobalHandler((e, fatal) => {
    const info: CrashInfo = { ...describe(e), at: new Date().toISOString(), fatal: !!fatal };
    AsyncStorage.setItem(KEY, JSON.stringify(info)).catch(() => {});
    // Give the write a moment to land before the default handler takes the process down.
    setTimeout(() => prev?.(e, fatal), fatal ? 400 : 0);
  });
}

export async function readLastCrash(): Promise<CrashInfo | null> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? (JSON.parse(raw) as CrashInfo) : null; } catch { return null; }
}
export function clearLastCrash() { return AsyncStorage.removeItem(KEY).catch(() => {}); }

const report = (c: CrashInfo) => `Skipped It crash ${c.at}${c.fatal ? " (fatal)" : ""}\n${c.message}\n\n${c.stack}`;

export function CrashCard({ crash, title, onDismiss, onRetry }: { crash: CrashInfo; title: string; onDismiss: () => void; onRetry?: () => void }) {
  const btn = { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#1B1A2E" } as const;
  const bt = { color: "#fff", fontWeight: "700" as const, fontSize: 15 };
  return (
    <View style={{ backgroundColor: "#FFF4E8", borderColor: "#E0B48A", borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 17, fontWeight: "800", color: "#1B1A2E" }}>{title}</Text>
      <Text style={{ fontSize: 14, color: "#1B1A2E" }} selectable>{crash.message}</Text>
      <ScrollView style={{ maxHeight: 140 }} nestedScrollEnabled><Text selectable style={{ fontSize: 11, color: "#555", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{crash.stack}</Text></ScrollView>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Pressable onPress={() => Share.share({ message: report(crash) }).catch(() => {})} style={btn}><Text style={bt}>Share report</Text></Pressable>
        {onRetry ? <Pressable onPress={onRetry} style={btn}><Text style={bt}>Try again</Text></Pressable> : null}
        <Pressable onPress={onDismiss} style={[btn, { backgroundColor: "#D9D4CC" }]}><Text style={[bt, { color: "#1B1A2E" }]}>Dismiss</Text></Pressable>
      </View>
    </View>
  );
}

/* Shows the previous launch's crash (if any) above the app, and catches render errors. */
export class CrashShell extends React.Component<{ children: React.ReactNode }, { err: CrashInfo | null; last: CrashInfo | null; key: number }> {
  state = { err: null as CrashInfo | null, last: null as CrashInfo | null, key: 0 };
  static getDerivedStateFromError(e: unknown) { return { err: { ...describe(e), at: new Date().toISOString(), fatal: true } }; }
  componentDidCatch(e: unknown) { AsyncStorage.setItem(KEY, JSON.stringify({ ...describe(e), at: new Date().toISOString(), fatal: true })).catch(() => {}); }
  componentDidMount() { installCrashHandler(); readLastCrash().then((last) => { if (last) this.setState({ last }); }); }
  dismiss = () => { clearLastCrash(); this.setState({ last: null, err: null }); };
  retry = () => { clearLastCrash(); this.setState((s) => ({ err: null, last: null, key: s.key + 1 })); };
  render() {
    const { err, last, key } = this.state;
    if (err) return <View style={{ flex: 1, backgroundColor: "#F3EFE8", justifyContent: "center", padding: 16 }}><CrashCard crash={err} title="Something went wrong" onDismiss={this.retry} onRetry={this.retry} /></View>;
    return (
      <View style={{ flex: 1 }} key={key}>
        {this.props.children}
        {last ? <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, top: 56 }}><CrashCard crash={last} title="The app closed unexpectedly last time" onDismiss={this.dismiss} /></View> : null}
      </View>
    );
  }
}
