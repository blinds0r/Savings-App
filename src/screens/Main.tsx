import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, ScrollView, StatusBar, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useFonts } from "expo-font";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { Figtree_700Bold } from "@expo-google-fonts/figtree/700Bold";
import { SKINS, SKIN_KEYS } from "../copy";
import { CAMPS, computeCtx, countOf, crossed, fmt, int, monthName, monthsStrip, msAmounts, nextMonthLabel, nowKey, pctOf, pctTxt, PCT_MS, r2, REGION_NAMES, shortAmt, streakBanner, streakInfo, TREASURE_NAMES, dateOf, monthKey } from "../model/logic";
import { load, store, useStore } from "../model/store";
import type { Item, Settings, VisualState } from "../model/types";
import { reschedule, setupNotifications } from "../notify";
import { FONT, PALETTES, SCENES } from "../theme";
import { Btn, Chip, IconBtn, Row, T, ThemeCtx, Toast, useTheme } from "../ui";
import { VisualSheet } from "./VisualGrid";
import { VISUALS } from "../visuals";
import type { SceneHandle } from "../visuals/contract";
import { Onboarding } from "./Onboarding";
import { GoalSheet, PreviewSheet, SettingsSheet, ShareSheet, SkipSheet } from "./sheets";

type SheetKind = null | "log" | "edit" | "settings" | "share" | "goal" | "preview" | "visual";

export function Main() {
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold });
  const { items, settings, loaded } = useStore();
  useEffect(() => { load(); }, []);
  if (!loaded || !fontsLoaded) return <View style={{ flex: 1, backgroundColor: PALETTES[settings.skin].bg }} />;
  if (!settings.onboarded) return <Onboarding initial={settings} onDone={(s) => store.saveSettings(s)} />;
  return <Home items={items} settings={settings} />;
}

function Home({ items, settings: s }: { items: Item[]; settings: Settings }) {
  const p = PALETTES[s.skin], cfg = SKINS[s.skin], ins = useSafeAreaInsets(), { width } = useWindowDimensions();
  const [sheetState, setSheetState] = useState<{ kind: SheetKind; gen: number }>({ kind: null, gen: 0 });
  const sheet = sheetState.kind, sheetGen = sheetState.gen;
  // a new generation remounts the sheet with fresh fields; re-setting the kind that is already open (a double tap) keeps it
  const setSheet = useCallback((k: SheetKind) => setSheetState((p) => ({ kind: k, gen: k && k !== p.kind ? p.gen + 1 : p.gen })), []);
  const [editing, setEditing] = useState<Item | null>(null);
  const [toast, setToast] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [cele, setCele] = useState<{ title: string; line: string; pct: number } | null>(null);
  const [goalDemo, setGoalDemo] = useState(false);
  const [goalDismissed, setGoalDismissed] = useState(0);
  const [sharePct, setSharePct] = useState<number | null>(null);
  const [armed, setArmed] = useState<{ id: string; kind: "edit" | "rm" } | null>(null);
  // bumped when an add (and its milestone) has finished playing, so effects that wait on `busy` re-run
  const [settled, setSettled] = useState(0);
  // refreshed when the app comes back to the foreground, so a month or week boundary crossed while backgrounded is picked up
  const [now, setNow] = useState(() => new Date());
  const sceneRef = useRef<SceneHandle>(null);
  const busy = useRef(false); const queue = useRef<{ amount: number; what: string }[]>([]); const gen = useRef(0); const celeTimer = useRef<any>(null);
  const playAddRef = useRef<(amount: number, what: string) => Promise<void>>(async () => {});
  const ctx = useMemo(() => computeCtx(items, s, now, pending, preview), [items, s, now, pending, preview]);
  const ctxRef = useRef(ctx); useEffect(() => { ctxRef.current = ctx; }, [ctx]);
  const monthly = s.mode === "monthly", motion = s.motion !== "calm";
  const V = VISUALS[s.skin] || VISUALS.probe;
  const vState: VisualState = useMemo(() => ({ pct: ctx.pct, surplus: ctx.surplus, goal: ctx.goal }), [ctx.pct, ctx.surplus, ctx.goal]);
  const stageW = Math.min(width - 32, 420), stageH = Math.round(stageW * (V.box.h / V.box.w));

  // notifications: ask once, then keep the schedule fresh
  useEffect(() => { setupNotifications().then(() => reschedule(store.get().items, store.get().settings)); const sub = AppState.addEventListener("change", (st) => { if (st === "active") { setNow(new Date()); reschedule(store.get().items, store.get().settings); } }); return () => sub.remove(); }, []);
  useEffect(() => { reschedule(items, s); }, [items, s.nudges, s.mode, s.target, s.monthly]);

  // armed edit/remove buttons disarm after 3 s
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(null), 3000); return () => clearTimeout(t); }, [armed]);

  const showToast = (m: string) => { setToast(""); setTimeout(() => setToast(m), 20); };
  const hideCele = () => { clearTimeout(celeTimer.current); setCele(null); };
  const interrupt = useCallback(() => { gen.current++; busy.current = false; queue.current = []; setPending(0); sceneRef.current?.cancel(); hideCele(); }, []);
  // switching visuals unmounts the old scene: drop anything in flight (its promise may never resolve) and clear any celebration card
  useEffect(() => { const t = setTimeout(() => interrupt(), 0); return () => clearTimeout(t); }, [s.skin, interrupt]);

  const playMilestone = useCallback(async (pct: number, rawAfter?: number) => {
    const my = gen.current;
    busy.current = true;
    if (motion) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try { await sceneRef.current?.playMilestone(pct); } catch {}
    if (my !== gen.current) return;
    busy.current = false;
    // the ref is not refreshed until React has applied the setPending/setPreview from the add, so the caller passes the pile it knows; the ref alone would put the "to go" line off by the amount just added
    const c0 = ctxRef.current, raw = rawAfter ?? c0.raw, c = { ...c0, raw, t: Math.min(raw, c0.goal) };
    const goalSheetNext = pct >= 100 && s.mode === "target" && preview == null && s.ackGoal !== c.goal;
    if (goalSheetNext) return;
    const MS = msAmounts(c.goal), idx = MS.findIndex((m) => Math.abs(m - (pct / 100) * c.goal) < 0.01);
    let title = pct >= 100 ? (monthly ? "Month beaten." : "You did it.") : `${pct}% ${cfg.word}.`;
    if (idx >= 0 && cfg.ms === "regions") title = pct >= 100 ? "Full galaxy." : `${REGION_NAMES[idx]} lit.`;
    if (idx >= 0 && cfg.ms === "treasures") title = pct >= 100 ? "The crown is yours." : `The crow found a ${TREASURE_NAMES[idx].toLowerCase()}.`;
    const nextP = PCT_MS.find((q) => q > pct);
    const line = pct >= 100 ? `${fmt(c.goal)} of things you didn't buy.` : `${fmt(r2(Math.max(c.goal - c.t, 0)))} to go.${nextP ? ` Next stop ${nextP}%.` : ""}`;
    clearTimeout(celeTimer.current); setCele({ title, line, pct }); celeTimer.current = setTimeout(() => setCele(null), 9000);
  }, [motion, s.mode, s.ackGoal, preview, monthly, cfg]);

  /* A real add is already in the store but held back in `pending` (see logSkip) until its animation has played, so the
   * scene animates on the old state and the milestone check sees the true before/after. Queued adds stay held back too. */
  const playAdd = useCallback(async (amount: number, what: string) => {
    if (busy.current) { queue.current.push({ amount, what }); return; }
    const my = gen.current, rawAfter = r2(ctxRef.current.raw + amount), before = ctxRef.current.pct, after = pctOf(rawAfter, ctxRef.current.goal);
    busy.current = true;
    if (motion) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { await sceneRef.current?.playAdd(amount); } catch {}
    if (my !== gen.current) return;
    if (preview != null) setPreview((v) => r2((v ?? 0) + amount)); else setPending((v) => Math.max(0, r2(v - amount)));
    busy.current = false;
    showToast(`${cfg.toast}: ${what} +${fmt(amount)}`);
    const cr = crossed(before, after);
    if (cr.length && s.nudges.milestones) await playMilestone(cr[cr.length - 1], rawAfter);
    if (my !== gen.current) return;
    const q = queue.current.shift();
    if (q) setTimeout(() => playAddRef.current(q.amount, q.what), 50); else setSettled((n) => n + 1);
  }, [motion, preview, cfg, s.nudges.milestones, playMilestone]);
  useEffect(() => { playAddRef.current = playAdd; }, [playAdd]);

  // goal reached sheet
  useEffect(() => {
    if (s.mode === "target" && preview == null && ctx.total >= ctx.goal && s.ackGoal !== ctx.goal && goalDismissed !== ctx.goal && !busy.current && sheet == null) { setGoalDemo(false); setSheet("goal"); }
  }, [ctx.total, ctx.goal, s.ackGoal, s.mode, preview, goalDismissed, sheet, settled]);

  const closeSheet = () => { if (sheet === "goal" && !goalDemo) setGoalDismissed(ctx.goal); setSheet(null); setEditing(null); };
  const logSkip = (what: string, amount: number) => { setSheet(null); if (preview != null) { playAdd(amount, what); return; } setPending((v) => r2(v + amount)); store.addItem(what, amount); playAdd(amount, what); };
  const saveEdit = (what: string, amount: number) => { if (editing) store.updateItem(editing.id, { what, amount }); setSheet(null); setEditing(null); showToast("Updated"); };

  // derived display
  const MS = msAmounts(ctx.goal), nx = MS.find((m) => m > ctx.raw + 1e-9);
  const nxName = nx ? (cfg.ms === "treasures" ? "the " + TREASURE_NAMES[MS.indexOf(nx)].toLowerCase() : cfg.ms === "regions" ? REGION_NAMES[MS.indexOf(nx)].toLowerCase() : fmt(nx)) : "";
  const sk = streakInfo(items), banner = streakBanner(sk, s.nudges.streak);
  const avg = items.length ? fmt(r2(ctx.total / items.length)) : "–";
  const stats: [string, string][] = s.skin === "summit"
    ? (() => { const nc = CAMPS.find((f) => f > ctx.pct + 1e-9); return [["Skips", String(items.length)], ["Next camp", nc ? (nc === 1 ? "Summit" : fmt(Math.ceil(nc * ctx.goal))) : "Done"], ["To go", nc ? `${int((nc - ctx.pct) * 3000)} m` : "0 m"]] as [string, string][]; })()
    : s.skin === "galaxy" ? [["Stars", `${countOf(ctx.pct, 150)} / 150`], ["Skips", String(items.length)], ["To go", fmt(r2(Math.max(ctx.goal - ctx.t, 0)))]]
    : s.skin === "firefly" || s.skin === "tree" ? [[s.skin === "tree" ? "Leaves" : "Caught", `${countOf(ctx.pct, 300)} / 300`], ["Skips", String(items.length)], ["To go", fmt(r2(Math.max(ctx.goal - ctx.t, 0)))]]
    : [[s.skin === "crow" ? "Finds" : "Skips", String(items.length)], ["Average", avg], ["To go", fmt(r2(Math.max(ctx.goal - ctx.t, 0)))]];
  if (s.nudges.streak) stats[1] = ["Weekly run", sk.n ? `${sk.n} wk${sk.n === 1 ? "" : "s"}` : "–"];
  const strip = monthly ? monthsStrip(items, ctx.goal, ctx.raw) : null;
  const amountText = s.skin === "summit" ? `${int(ctx.pct * 3000)} m` : fmt(ctx.raw);
  const scene = SCENES[s.skin] || null, page = scene && V.backgrounds[scene] ? V.backgrounds[scene].page : p.bg;

  return (
    <ThemeCtx.Provider value={p}>
      <StatusBar barStyle={p.dark ? "light-content" : "dark-content"} />
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: ins.top + 12, paddingBottom: ins.bottom + 110, paddingHorizontal: 16, gap: 20 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <T kind="eyebrow" style={{ flex: 1 }} numberOfLines={2}>{monthly ? `${s.goalName ? s.goalName + " · " : ""}${monthName(nowKey(), true)} · ${fmt(ctx.goal)} a month` : `${s.goalName || cfg.eyebrow(ctx.goal)} · goal ${fmt(ctx.goal)}`}</T>
            <Row style={{ gap: 6 }}>
              <IconBtn label="Share progress" testID="shareBtn" onPress={() => { setSharePct(null); setSheet("share"); }}><Glyph kind="share" color={p.fg} /></IconBtn>
              <IconBtn label="Preview tools" testID="pvBtn" onPress={() => { if (busy.current) interrupt(); setSheet("preview"); }}><Glyph kind="eye" color={p.fg} /></IconBtn>
              <IconBtn label="Settings" testID="setBtn" onPress={() => setSheet("settings")}><Glyph kind="sliders" color={p.fg} /></IconBtn>
            </Row>
          </Row>
          <View style={{ gap: 6 }}>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap" }}>
              <T kind="display" testID="amount" style={{ fontSize: amountText.length > 11 ? 36 : amountText.length > 9 ? 44 : 60, lineHeight: amountText.length > 9 ? 48 : 62, fontVariant: ["tabular-nums"] }}>{amountText}</T>
              {preview != null ? <Pill text="Preview" /> : cfg.chip ? <Pill text={cfg.chip(ctx.pct)} /> : null}
            </Row>
            {ctx.surplus > 0 ? <T kind="muted" style={{ fontSize: 16 }}>{monthly ? "This month's goal beaten" : "Target reached"} · <T kind="bold" style={{ color: p.accent, fontSize: 16 }}>{cfg.overText(ctx.surplus)}</T></T>
              : <T kind="muted" style={{ fontSize: 16 }}>{cfg.sub(ctx)}{monthly ? ` · resets ${nextMonthLabel()}` : ""}</T>}
          </View>

          {/* stage: the scene band runs edge to edge behind the visual */}
          <View style={{ marginHorizontal: -16, backgroundColor: page, paddingVertical: scene ? 0 : 0 }}>
            <View style={{ alignSelf: "center", width: stageW, height: stageH }}>
              <V.Scene ref={sceneRef} state={vState} width={stageW} height={stageH} motion={motion} background={scene} />
            </View>
            {cele ? (
              <View style={[st.cele, { backgroundColor: p.surface, borderColor: p.line }]} accessibilityLiveRegion="polite">
                <T kind="display" style={{ fontSize: 26, lineHeight: 28 }}>{cele.title}</T>
                <T kind="note" style={{ fontSize: 14 }}>{cele.line}</T>
                <Row><Btn title="Share" onPress={() => { hideCele(); setSharePct(cele.pct); setSheet("share"); }} /><Btn kind="ghost" title="Keep going" onPress={hideCele} /></Row>
              </View>
            ) : null}
          </View>
          <Row style={{ justifyContent: "flex-end", marginTop: -4 }}>
            <Chip testID="skinBtn" title={`${SKINS[s.skin].name} · Change visual`} on={false} swatch={SKINS[s.skin].swatch} onPress={() => setSheet("visual")} />
          </Row>

          {strip ? (
            <View style={[st.card, { backgroundColor: p.surface }]}>
              <Row style={{ justifyContent: "space-between" }}><T kind="bold" style={{ fontSize: 13 }}>Month to month</T><T kind="note" style={{ fontSize: 13 }}>{strip.beaten} of 6 beaten</T></Row>
              <Row style={{ alignItems: "flex-end", height: 64, gap: 8 }}>
                {strip.rows.map((r) => <View key={r.key} style={{ flex: 1, alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }} accessibilityLabel={`${r.long}: ${fmt(r.value)}`}>
                  <View style={{ width: "100%", maxWidth: 34, flex: 1, borderRadius: 6, backgroundColor: p.line, overflow: "hidden", justifyContent: "flex-end" }}><View style={{ height: `${Math.round(r.pct * 100)}%`, backgroundColor: p.msHit }} />{r.over ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: p.accent }} /> : null}</View>
                  <T kind="note" style={{ fontSize: 11, color: r.current ? p.fg : p.muted, fontFamily: r.current ? FONT.bodyBold : FONT.body }}>{r.label}</T>
                </View>)}
              </Row>
            </View>
          ) : null}

          {cfg.ms ? (
            <View style={[st.card, { backgroundColor: p.surface }]}>
              <Row style={{ justifyContent: "space-between" }}><T kind="bold" style={{ fontSize: 14 }}>{cfg.ms === "treasures" ? "Treasures to unlock" : cfg.ms === "regions" ? "Regions to light" : "Milestones"}</T><T kind="note" style={{ fontSize: 13, flexShrink: 1, textAlign: "right" }}>{nx ? `${fmt(r2(nx - ctx.raw))} to ${nxName}` : cfg.ms === "regions" ? "Fully lit" : "All reached"}</T></Row>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                {MS.map((m, i) => { const hit = ctx.raw >= m - 1e-9, next = m === nx; const col = hit ? p.msHit : next ? p.msNext : p.msOff; return (
                  <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                    {cfg.ms === "dots" ? <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: hit ? p.msHitEdge : next ? p.msNext : p.msOff, backgroundColor: hit ? p.msHit : "transparent" }} /> : <Glyph kind={cfg.ms === "regions" ? "star" : (["ring", "key", "gem", "locket", "watch", "crown"][i] as any)} color={col} fill={hit} />}
                    {cfg.ms === "regions" ? <T kind="note" style={{ fontSize: 10, textAlign: "center", color: hit || next ? p.fg : p.muted }}>{REGION_NAMES[i]}</T> : null}
                    <T kind="bold" style={{ fontSize: 12, color: hit || next ? p.fg : p.muted }}>{shortAmt(m)}</T>
                  </View>); })}
              </Row>
            </View>
          ) : null}

          <Row style={{ gap: 10 }}>{stats.map(([k, v]) => <View key={k} style={[st.stat, { backgroundColor: p.surface }]}><T kind="eyebrow" style={{ fontSize: 11 }}>{k}</T><T numberOfLines={1} style={{ fontFamily: FONT.displayMed, fontSize: v.length > 8 ? 16 : v.length > 6 ? 19 : 22, fontVariant: ["tabular-nums"] }}>{v}</T></View>)}</Row>
          {banner ? <View style={[st.banner, { backgroundColor: p.surface2, borderColor: p.line }]}><Glyph kind="clock" color={p.accent} /><T kind="note" style={{ flex: 1, fontSize: 13 }}>{banner}</T></View> : null}

          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: "space-between" }}><T kind="display" style={{ fontSize: 22 }}>{cfg.listTitle}</T><T kind="eyebrow">{items.length} skip{items.length === 1 ? "" : "s"}</T></Row>
            <View style={{ borderTopWidth: 1, borderTopColor: p.line }}>
              {!items.length ? <T kind="muted" style={{ paddingVertical: 16 }}>Nothing yet. Add the first thing you skipped.</T> : null}
              {items.map((it, i) => {
                const sep = monthly && (i === 0 || (monthKey(items[i - 1].at) === nowKey()) !== (monthKey(it.at) === nowKey())) ? (monthKey(it.at) === nowKey() ? "This month" : "Earlier") : null;
                const aEd = armed?.id === it.id && armed.kind === "edit", aRm = armed?.id === it.id && armed.kind === "rm";
                return (
                  <View key={it.id}>
                    {sep ? <T kind="eyebrow" style={{ fontSize: 11, paddingTop: 10, paddingBottom: 4 }}>{sep}</T> : null}
                    <View style={[st.li, { borderBottomColor: p.line }]}>
                      <View style={[st.ico, { backgroundColor: p.ico, borderBottomColor: p.icoEdge }]} />
                      <View style={{ flex: 1, minWidth: 0 }}><T kind="semi" numberOfLines={2}>{it.what || "Something"}</T><T kind="note">{dateOf(it.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</T></View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${it.what}, ${fmt(it.amount)}`} testID={`amt-${it.id}`} onPress={() => { if (aEd) { setArmed(null); setEditing(it); setSheet("edit"); } else setArmed({ id: it.id, kind: "edit" }); }} style={[st.amtBtn, aEd && { backgroundColor: p.fg }]}>
                        <T style={{ fontFamily: aEd ? FONT.bodySemi : FONT.displayMed, fontSize: aEd ? 14 : 17, color: aEd ? p.bg : p.accent, fontVariant: ["tabular-nums"] }}>{aEd ? "Edit" : `+${fmt(it.amount)}`}</T>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${it.what}`} testID={`rm-${it.id}`} onPress={() => { if (aRm) { setArmed(null); store.deleteItem(it.id); } else setArmed({ id: it.id, kind: "rm" }); }} style={st.rm}>
                        <T style={{ fontFamily: aRm ? FONT.bodyBold : FONT.body, fontSize: aRm ? 13 : 16, color: aRm ? p.accent : p.muted }}>{aRm ? "Remove?" : "×"}</T>
                      </Pressable>
                    </View>
                  </View>);
              })}
            </View>
          </View>
        </ScrollView>

        <View style={[st.fab, { bottom: ins.bottom + 18 }]}><Btn big testID="logBtn" title={cfg.btn} icon={<Glyph kind="plus" color={p.btnFg} />} onPress={() => { setEditing(null); setSheet("log"); }} style={st.fabBtn} /></View>
        <Toast msg={toast} />

        <SkipSheet key={`log-${sheetGen}`} open={sheet === "log"} onClose={closeSheet} title="What did you skip?" btn={cfg.btn} ctx={ctx} skin={s.skin} pending={pending} onSubmit={logSkip} />
        <SkipSheet key={`edit-${sheetGen}`} open={sheet === "edit"} onClose={closeSheet} title="Edit this skip" btn="Save" item={editing} ctx={ctx} skin={s.skin} pending={0} onSubmit={saveEdit} />
        <VisualSheet open={sheet === "visual"} onClose={closeSheet} skin={s.skin} goal={ctx.goal} pct={ctx.pct} onPick={(k) => { if (busy.current) interrupt(); store.saveSettings({ skin: k }); }} />
        <SettingsSheet key={`set-${sheetGen}`} open={sheet === "settings"} onClose={closeSheet} s={s} onSave={(patch) => { setSheet(null); store.saveSettings(patch); showToast("Saved"); }} onRedo={() => { setSheet(null); store.saveSettings({ onboarded: false }); }} />
        <ShareSheet open={sheet === "share"} onClose={closeSheet} ctx={ctx} s={s} skin={s.skin} count={monthly ? items.filter((i) => monthKey(i.at) === nowKey(now)).length : items.length} pct={sharePct} />
        <GoalSheet key={`goal-${sheetGen}`} open={sheet === "goal"} onClose={closeSheet} ctx={goalDemo ? { ...ctx, total: ctx.goal + 85 } : ctx} s={s} skin={s.skin} demo={goalDemo}
          onKeep={() => { setSheet(null); store.saveSettings({ ackGoal: ctx.goal }); }}
          onNewTarget={(v) => { setSheet(null); store.saveSettings({ target: v, ackGoal: 0 }); }}
          onMonthly={(v) => { setSheet(null); store.saveSettings({ mode: "monthly", monthly: v, ackGoal: ctx.goal }); }}
          onShare={() => { if (!goalDemo) store.saveSettings({ ackGoal: ctx.goal }); setSharePct(100); setSheet("share"); }} />
        <PreviewSheet open={sheet === "preview"} onClose={closeSheet} ctx={ctx} preview={preview}
          onPreview={(v) => setPreview(v)}
          onAdd={(a, w) => { setSheet(null); if (preview == null) setPreview(ctx.raw); setTimeout(() => playAddRef.current(a, w), 350); }}
          onMilestone={() => { setSheet(null); setTimeout(() => playMilestone(PCT_MS.find((q) => q > ctxRef.current.pct * 100 + 1e-9) || 100), 350); }}
          onGoal={() => { setSheet(null); setTimeout(() => { setGoalDemo(true); setSheet("goal"); }, 350); }}
          onShare={() => { setSharePct(null); setSheet("share"); }}
          onExit={() => { setPreview(null); setSheet(null); }} />
      </View>
    </ThemeCtx.Provider>
  );
}

function Pill({ text }: { text: string }) { const p = useTheme(); return <View style={{ backgroundColor: p.fg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6 }}><T style={{ fontFamily: FONT.bodyBold, fontSize: 12, color: p.bg }}>{text}</T></View>; }

/* Small line icons drawn with Skia-free primitives (plain Views) to keep the UI light. */
function Glyph({ kind, color, fill }: { kind: "share" | "eye" | "sliders" | "plus" | "clock" | "star" | "ring" | "key" | "gem" | "locket" | "watch" | "crown"; color: string; fill?: boolean }) {
  const { Svg } = require("./glyphs");
  return <Svg kind={kind} color={color} fill={fill} />;
}

const st = StyleSheet.create({
  card: { borderRadius: 18, padding: 14, gap: 10 },
  stat: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2, minWidth: 0 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderStyle: "dashed", borderRadius: 14, padding: 12 },
  li: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  ico: { width: 26, height: 26, borderRadius: 13, borderBottomWidth: 2 },
  amtBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  rm: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: "center", alignItems: "center" },
  fab: { position: "absolute", left: 16, right: 16 },
  fabBtn: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  cele: { position: "absolute", left: 16, right: 16, bottom: 0, maxWidth: 360, alignSelf: "center", borderRadius: 18, borderWidth: 1, padding: 14, gap: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
});
