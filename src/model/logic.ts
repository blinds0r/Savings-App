import { Ctx, Item, Settings, SkinKey } from "./types";

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const pctOf = (t: number, g: number) => (g > 0 ? Math.min(t / g, 1) : 0);

export const fmt = (n: number) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const int = (n: number) => Math.round(n).toLocaleString("en-US");
export const pctTxt = (p: number) => (p > 0 && p < 0.1 ? (p * 100).toFixed(1) + "%" : Math.round(p * 100) + "%");

export const MAX_AMT = 100000;
/** Strict amount parsing: "$1,200", "12.5", ".99" are fine; "-5", "1.2.3", "abc" give NaN. */
export function parseAmt(v: unknown): number {
  const s = String(v == null ? "" : v).trim().replace(/^\$\s*/, "");
  if (!/^((\d{1,3}(,\d{3})+)|\d+)(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return NaN;
  return r2(parseFloat(s.replace(/,/g, "")));
}
export function amtProblem(raw: string, a: number): string {
  if (raw.trim() === "") return "";
  if (!(a >= 0)) return "Enter an amount like 12.50";
  if (a > MAX_AMT) return `Keep it under ${fmt(MAX_AMT)}`;
  return "";
}

/* ---------- dates (all local time) ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
export const nowAt = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const dateOf = (at: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):?(\d{2})?)?/.exec(at || "");
  if (!m) return new Date(0);
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
};
export const monthKey = (at: string) => String(at || "").slice(0, 7);
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const nowKey = (d = new Date()) => keyOf(d);
export const monthName = (key: string, long = false) =>
  new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1).toLocaleDateString("en-US", { month: long ? "long" : "short" });
export const nextMonthLabel = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/* ---------- the pile ---------- */
export const goalOf = (s: Settings) => (s.mode === "monthly" ? s.monthly : s.target);
export function computeCtx(items: Item[], s: Settings, now = new Date(), pendingAnim = 0, override: number | null = null): Ctx {
  const inPile = s.mode === "target" && s.pileStart ? items.filter((i) => i.at >= s.pileStart) : items;
  const total = r2(inPile.reduce((a, i) => a + (Number(i.amount) || 0), 0));
  const goal = goalOf(s);
  let raw = s.mode === "monthly" ? r2(items.filter((i) => monthKey(i.at) === nowKey(now)).reduce((a, i) => a + (Number(i.amount) || 0), 0)) : total;
  raw = Math.max(0, r2(raw - pendingAnim));
  if (override != null) raw = override;
  return { total, banked: s.mode === "target" ? s.banked || 0 : 0, raw, goal, t: Math.min(raw, goal), pct: pctOf(raw, goal), surplus: Math.max(0, r2(raw - goal)) };
}

/* ---------- milestones ---------- */
/** Celebrations fire at these percentages. */
export const PCT_MS = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100];
/** The six named milestones shown in the row are a subset of the celebration points. */
export const FR = [0.05, 0.1, 0.2, 0.4, 0.7, 1];
/** Summit camps sit at these heights of the mountain. */
export const CAMPS = [1 / 12, 1 / 6, 1 / 3, 1 / 2, 2 / 3, 1];
export const msAmounts = (goal: number) => FR.map((f) => r2(f * goal));
export const shortAmt = (m: number) => (m >= 1000 ? "$" + +(m / 1000).toFixed(m % 100 ? 2 : 1) + "k" : "$" + (m % 1 ? m.toFixed(0) : m));
export const crossed = (before: number, after: number) => PCT_MS.filter((p) => before * 100 < p - 1e-9 && after * 100 >= p - 1e-9);
export const REGION_NAMES = ["Core", "Inner arms", "Spiral", "Outer arms", "Halo", "Full galaxy"];
export const TREASURE_NAMES = ["Ring", "Key", "Gem", "Locket", "Pocket watch", "Crown"];

export const unitOf = (goal: number, N: number) => { const u = goal / N; return "$" + (Number.isInteger(u) ? u : +u.toFixed(2)); };
export const countOf = (pct: number, N: number) => (pct > 0 ? Math.max(1, Math.round(pct * N)) : 0);
export const UNITS: Partial<Record<SkinKey, { n: number; word: string }>> = { galaxy: { n: 150, word: "stars" }, firefly: { n: 300, word: "fireflies" }, tree: { n: 300, word: "leaves" } };

/* ---------- weekly run (calendar weeks, Monday start; step by days so DST never breaks it) ---------- */
export function weekStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); }
const prevWeek = (ws: number) => { const d = new Date(ws); d.setDate(d.getDate() - 7); return weekStart(d); };
export interface Streak { n: number; alive: boolean; daysLeft: number }
export function streakInfo(items: Item[], now = new Date()): Streak {
  const weeks = new Set(items.map((i) => weekStart(dateOf(i.at))));
  const cur = weekStart(now), alive = weeks.has(cur);
  let n = 0, w = alive ? cur : prevWeek(cur);
  while (weeks.has(w)) { n++; w = prevWeek(w); }
  const end = new Date(cur); end.setDate(end.getDate() + 7);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return { n, alive, daysLeft: Math.round((end.getTime() - today.getTime()) / 864e5) };
}
/** The soft reminder: only in the last 3 days of a week with no skip yet, when a run exists. */
export const streakBanner = (sk: Streak, on: boolean) =>
  on && sk.n > 0 && !sk.alive && sk.daysLeft <= 3
    ? `${sk.daysLeft === 1 ? "Today's the last day" : sk.daysLeft + " days left"} to keep your ${sk.n}-week run going. One skip is enough.`
    : "";

/* ---------- months strip ---------- */
export function monthsStrip(items: Item[], goal: number, raw: number, now = new Date()) {
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) keys.push(keyOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const tot: Record<string, number> = {};
  items.forEach((i) => { const k = monthKey(i.at); tot[k] = (tot[k] || 0) + (Number(i.amount) || 0); });
  const cur = nowKey(now);
  const rows = keys.map((k) => { const v = k === cur ? raw : tot[k] || 0; return { key: k, label: monthName(k), long: monthName(k, true), value: r2(v), pct: Math.min(v / goal, 1), over: v > goal, current: k === cur }; });
  return { rows, beaten: rows.filter((r) => r.value >= goal).length };
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
