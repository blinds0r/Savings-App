import React, { useRef, useState } from "react";
import { Platform, View } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { SKINS, SKIN_KEYS, OVER_NOUN } from "../copy";
import { amtProblem, fmt, parseAmt, pctOf, pctTxt, r2, UNITS, MAX_AMT } from "../model/logic";
import type { Ctx, Item, Mode, Settings, SkinKey } from "../model/types";
import { FONT } from "../theme";
import { BigAmount, Btn, Card, Chip, Field, Input, Row, Seg, Sheet, SRow, Switch, T, useTheme } from "../ui";

/* ---------- log / edit: just what it was and how much; the button stays off until both are filled in ---------- */
export function SkipSheet({ open, onClose, title, btn, item, ctx, skin, pending, onSubmit }: { open: boolean; onClose: () => void; title: string; btn: string; item?: Item | null; ctx: Ctx; skin: SkinKey; pending: number; onSubmit: (what: string, amount: number) => void }) {
  const [what, setWhat] = useState(item ? item.what : ""); const [amt, setAmt] = useState(item ? String(item.amount) : "");
  const a = parseAmt(amt), prob = amtProblem(amt, a), ok = a > 0 && a <= MAX_AMT && what.trim().length > 0;
  const u = UNITS[skin];
  let fb = prob;
  if (!fb && a > 0 && a <= MAX_AMT) {
    if (item) { const d = r2(a - item.amount); fb = d ? `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))} compared with before` : "Same amount as before"; }
    else { const np = pctOf(ctx.raw + a + pending, ctx.goal); fb = `You'd land at ${pctTxt(np)}${u ? ` · ${(a / (ctx.goal / u.n)).toFixed(1)} ${u.word}` : ""}`; }
  }
  const submit = () => { if (ok) onSubmit(what.trim(), a); };
  const p = useTheme();
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <T kind="display" style={{ fontSize: 26 }}>{title}</T>
      <Field label="What was it?"><Input testID="lw" value={what} onChangeText={setWhat} maxLength={80} autoFocus={!item} placeholder="Coffee, a cab, that thing in the cart…" returnKeyType="next" /></Field>
      <Field label="How much"><BigAmount testID="la" value={amt} onChange={setAmt} onSubmit={submit} /><T kind="semi" style={{ color: p.accent, fontSize: 14, minHeight: 20 }}>{fb}</T></Field>
      <Btn big testID="lgo" title={ok ? `${btn} · ${item ? "" : "+"}${fmt(a)}` : btn} disabled={!ok} onPress={submit} />
    </Sheet>
  );
}

/* ---------- share: a card captured as an image for WhatsApp ---------- */
export function ShareSheet({ open, onClose, ctx, s, skin, count, pct }: { open: boolean; onClose: () => void; ctx: Ctx; s: Settings; skin: SkinKey; count: number; pct: number | null }) {
  const p = useTheme(); const cardRef = useRef<any>(null); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const monthly = s.mode === "monthly", cfg = SKINS[skin];
  const text = monthly ? `I've skipped my way to ${fmt(ctx.raw)} this month (${pctTxt(ctx.pct)} of my ${fmt(ctx.goal)} goal) on Skipped It.` : `I've skipped my way to ${fmt(ctx.raw)} of ${fmt(ctx.goal)} (${pctTxt(ctx.pct)}) on Skipped It.`;
  const share = async () => {
    setBusy(true); setNote("");
    try {
      if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) { setNote("Sharing isn't available here."); return; }
      const uri = await captureRef(cardRef, { format: "png", quality: 1, result: "tmpfile" });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: text, UTI: "public.png" });
    } catch { setNote("Couldn't open the share sheet. Try again."); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} label="Share">
      <T kind="display" style={{ fontSize: 26 }}>Share it</T>
      <View ref={cardRef} collapsable={false} style={{ borderRadius: 18, padding: 18, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.line, gap: 6 }}>
        <T kind="eyebrow" style={{ fontSize: 11 }}>{pct ? `${pct}% ${cfg.word}` : "Skipped It"}{s.goalName ? ` · ${s.goalName}` : ""}</T>
        <T kind="display" style={{ fontSize: 44, lineHeight: 48 }}>{fmt(ctx.raw)}</T>
        <T>saved by skipping {count} thing{count === 1 ? "" : "s"}{monthly ? " this month" : ""}</T>
        <T kind="eyebrow" style={{ fontSize: 11 }}>{cfg.name} · {pctTxt(ctx.pct)}</T>
      </View>
      <T kind="note">Opens your phone{"'"}s share sheet with this card as a picture, so WhatsApp is one tap away.</T>
      {note ? <T kind="note" style={{ color: p.accent }}>{note}</T> : null}
      <Btn big title={busy ? "Opening…" : "Share"} disabled={busy} onPress={share} />
    </Sheet>
  );
}

/* ---------- goal reached ---------- */
function Card2({ title, sub, onPress, testID }: { title: string; sub: string; onPress: () => void; testID: string }) {
  const p = useTheme();
  return <Btn kind="ghost" testID={testID} title="" onPress={onPress} style={{ alignItems: "flex-start", paddingVertical: 12, borderRadius: 18, borderWidth: 2, backgroundColor: p.surface }} icon={<View style={{ gap: 4, flex: 1 }}><T kind="semi" style={{ fontSize: 16 }}>{title}</T><T kind="note" style={{ fontSize: 13 }}>{sub}</T></View>} />;
}
export function GoalSheet({ open, onClose, ctx, s, skin, demo, onKeep, onNewTarget, onMonthly, onShare }: { open: boolean; onClose: () => void; ctx: Ctx; s: Settings; skin: SkinKey; demo?: boolean; onKeep: () => void; onNewTarget: (v: number) => void; onMonthly: (v: number) => void; onShare: () => void }) {
  const p = useTheme(); const [more, setMore] = useState<"new" | "monthly" | null>(null); const [v, setV] = useState(""); const [err, setErr] = useState("");
  return (
    <Sheet open={open} onClose={onClose} label="Goal reached">
      <T kind="display" style={{ fontSize: 26 }}>You did it.</T>
      <T kind="muted">{fmt(ctx.total)} of things you chose not to buy{s.goalName ? `, for ${s.goalName}` : ""}. What now?</T>
      <Card2 testID="grKeep" title="Keep going" sub={`Same target. Everything past it shows up as ${OVER_NOUN[skin]}.`} onPress={() => (demo ? onClose() : onKeep())} />
      <Card2 testID="grNew" title="Set a new target" sub="A fresh pile toward something bigger." onPress={() => { setMore("new"); setV(String(Math.max(1000, Math.round((ctx.goal * 2) / 500) * 500))); }} />
      <Card2 testID="grMonthly" title="Switch to a monthly goal" sub="A fresh pile every month. Beat it and the extra piles up." onPress={() => { setMore("monthly"); setV(String(s.monthly)); }} />
      {more ? (
        <Card>
          <Field label={more === "new" ? "New target" : "Goal each month"}><BigAmount value={v} onChange={setV} /></Field>
          {err ? <T kind="note" style={{ color: p.accent }}>{err}</T> : null}
          <Btn big title={more === "new" ? "Set it" : "Switch"} onPress={() => { const n = parseAmt(v); if (demo) return onClose(); const prob = amtProblem(v, n); if (prob) return setErr(prob); if (more === "new") { if (n > ctx.total) onNewTarget(n); else setErr(`Pick something above ${fmt(ctx.total)}.`); } else if (n > 0) onMonthly(n); else setErr("Enter an amount above $0."); }} />
        </Card>
      ) : null}
      <Btn kind="ghost" big title="Share this first" onPress={onShare} />
    </Sheet>
  );
}

/* ---------- settings ---------- */
export function SettingsSheet({ open, onClose, s, onSave, onRedo }: { open: boolean; onClose: () => void; s: Settings; onSave: (patch: Partial<Settings>) => void; onRedo: () => void }) {
  const [mode, setMode] = useState<Mode>(s.mode); const [amt, setAmt] = useState(String(s.mode === "monthly" ? s.monthly : s.target)); const [name, setName] = useState(s.goalName); const [skin, setSkin] = useState<SkinKey>(s.skin); const [nud, setNud] = useState(s.nudges); const [calm, setCalm] = useState(s.motion === "calm");
  const [err, setErr] = useState("");
  const p = useTheme();
  return (
    <Sheet open={open} onClose={onClose} label="Settings">
      <T kind="display" style={{ fontSize: 26 }}>Settings</T>
      <T kind="eyebrow">Goal</T>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <SRow label="Kind" right={<Seg options={[{ v: "target", label: "Target" }, { v: "monthly", label: "Monthly" }]} value={mode} onChange={(v) => { setMode(v); setAmt(String(v === "monthly" ? s.monthly : s.target)); setErr(""); }} />} />
        <SRow label={mode === "monthly" ? "Goal each month" : "Target"} right={<Input value={amt} onChangeText={(v) => { setAmt(v); setErr(""); }} keyboardType="decimal-pad" inputMode="decimal" style={{ width: 140 }} />} />
        <SRow label="Name" sub="Optional" last right={<Input value={name} onChangeText={setName} maxLength={30} placeholder="Trip fund" style={{ width: 160 }} />} />
      </Card>
      {err ? <T kind="note" style={{ color: p.accent }}>{err}</T> : null}
      <T kind="eyebrow">Visual</T>
      <Row style={{ flexWrap: "wrap" }}>{SKIN_KEYS.map((k) => <Chip key={k} title={SKINS[k].name} on={skin === k} onPress={() => setSkin(k)} />)}</Row>
      <T kind="eyebrow">Notifications</T>
      <T kind="note">All on by default. Scheduled on this phone; nothing leaves it.</T>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <SRow label="Milestones" sub="At 5, 10, 15, 20%, then every 10%" right={<Switch label="Milestones" on={nud.milestones} onChange={(v) => setNud({ ...nud, milestones: v })} />} />
        <SRow label="Nudge me" sub="If I haven't logged in a while" right={<Seg options={[{ v: 3, label: "3 days" }, { v: 4, label: "4 days" }, { v: 7, label: "7 days" }]} value={nud.nudgeDays} onChange={(v) => setNud({ ...nud, nudgeDays: v as 3 | 4 | 7 })} />} />
        <SRow label="Sunday recap" sub="What you skipped this week" right={<Switch label="Sunday recap" on={nud.recap} onChange={(v) => setNud({ ...nud, recap: v })} />} />
        <SRow label="Weekly run" sub="One skip a week keeps it going, with a heads-up before the week ends" last right={<Switch label="Weekly run" on={nud.streak} onChange={(v) => setNud({ ...nud, streak: v })} />} />
      </Card>
      <T kind="eyebrow">Motion</T>
      <Card style={{ paddingVertical: 4, gap: 0 }}><SRow label="Calmer motion" sub="Skip the animations and just update the picture" last right={<Switch label="Calmer motion" on={calm} onChange={setCalm} />} /></Card>
      <Btn big title="Save" testID="sSave" onPress={() => { const v = parseAmt(amt); if (!(v > 0) || amtProblem(amt, v)) { setErr(amtProblem(amt, v) || "Enter an amount above $0."); return; } const patch: Partial<Settings> = { mode, skin, goalName: name.trim(), motion: calm ? "calm" : "full", nudges: nud }; if (mode === "monthly") patch.monthly = v; else { patch.target = v; if (v !== s.target) patch.ackGoal = 0; } onSave(patch); }} />
      <Btn kind="ghost" big title="Start onboarding again" onPress={onRedo} />
      <T kind="note" style={{ textAlign: "center" }}>Skipped It · test build</T>
    </Sheet>
  );
}

/* ---------- preview tray ---------- */
export function PreviewSheet({ open, onClose, ctx, preview, onPreview, onAdd, onMilestone, onGoal, onShare, onExit }: { open: boolean; onClose: () => void; ctx: Ctx; preview: number | null; onPreview: (v: number) => void; onAdd: (a: number, what: string) => void; onMilestone: () => void; onGoal: () => void; onShare: () => void; onExit: () => void }) {
  const p = useTheme(); const cur = preview ?? ctx.raw;
  const steps = [0, 0.05, 0.12, 0.25, 0.5, 0.75, 0.95, 1, 1.25, 1.5].map((f) => Math.round(ctx.goal * f));
  return (
    <Sheet open={open} onClose={onClose} label="Preview">
      <T kind="display" style={{ fontSize: 26 }}>Preview</T>
      <T kind="note">Try the animations without logging anything. Nothing here is saved.</T>
      <Field label="Pretend total"><Row style={{ flexWrap: "wrap" }}>{steps.map((v) => <Chip key={v} title={fmt(v)} on={cur === v} onPress={() => onPreview(v)} />)}</Row><T kind="note">Past the goal shows the overflow.</T></Field>
      <Field label="Play an add"><Row style={{ flexWrap: "wrap" }}>{[[6, "Coffee"], [50, "Delivery"], [140, "Jacket"]].map(([a, w]) => <Chip key={a} title={`${w} · $${a}`} onPress={() => onAdd(a as number, w as string)} />)}</Row></Field>
      <Field label="Moments"><Row style={{ flexWrap: "wrap" }}><Chip title="Milestone reward" onPress={onMilestone} /><Chip title="Goal reached" onPress={onGoal} /><Chip title="Share card" onPress={onShare} /></Row></Field>
      <Btn kind="ghost" big title="Back to real numbers" onPress={onExit} />
      <View style={{ height: 1, backgroundColor: p.line }} />
    </Sheet>
  );
}
