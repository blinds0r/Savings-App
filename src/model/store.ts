import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, Item, Settings, SkinKey } from "./types";
import { newId, nowAt, r2 } from "./logic";

/* A small persisted store: everything lives on this phone. */
interface State { items: Item[]; settings: Settings; loaded: boolean }
let state: State = { items: [], settings: DEFAULT_SETTINGS, loaded: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const KEY_ITEMS = "skippedit.items", KEY_SETTINGS = "skippedit.settings";

const SKIN_KEYS: SkinKey[] = ["glass", "crow", "summit", "firefly", "tree", "galaxy", "rocket"];
const pos = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
/** Fill in missing keys and drop values the app cannot render (an old or unknown skin key, a bad mode or amount), so one stale entry never bricks launch. */
export const mergeSettings = (s: Partial<Settings> | null | undefined): Settings => {
  const m: Settings = { ...DEFAULT_SETTINGS, ...(s || {}), nudges: { ...DEFAULT_SETTINGS.nudges, ...((s && s.nudges) || {}) } };
  if (!SKIN_KEYS.includes(m.skin)) m.skin = DEFAULT_SETTINGS.skin;
  if (m.mode !== "target" && m.mode !== "monthly") m.mode = DEFAULT_SETTINGS.mode;
  m.target = pos(m.target, DEFAULT_SETTINGS.target); m.monthly = pos(m.monthly, DEFAULT_SETTINGS.monthly);
  m.banked = pos(m.banked, 0); m.bankedGoals = Math.max(0, Math.floor(pos(m.bankedGoals, 0))); if (typeof m.pileStart !== "string") m.pileStart = "";
  return m;
};
const sortItems = (items: Item[]) => [...items].sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));

export async function load() {
  try {
    const [i, s] = await AsyncStorage.multiGet([KEY_ITEMS, KEY_SETTINGS]);
    const items = i[1] ? (JSON.parse(i[1]) as Item[]) : [];
    const settings = mergeSettings(s[1] ? JSON.parse(s[1]) : null);
    state = { items: sortItems(items.filter((x) => x && x.id)), settings, loaded: true };
  } catch { state = { ...state, loaded: true }; }
  emit();
}
async function persistItems() { try { await AsyncStorage.setItem(KEY_ITEMS, JSON.stringify(state.items)); } catch {} }
async function persistSettings() { try { await AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(state.settings)); } catch {} }

export const store = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  addItem(what: string, amount: number, at = nowAt()): Item {
    const item: Item = { id: newId(), what: what.trim(), amount: r2(amount), at };
    state = { ...state, items: sortItems([item, ...state.items]) }; emit(); persistItems(); return item;
  },
  updateItem(id: string, patch: Partial<Pick<Item, "what" | "amount">>) {
    state = { ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch, amount: patch.amount != null ? r2(patch.amount) : i.amount } : i)) }; emit(); persistItems();
  },
  deleteItem(id: string) { state = { ...state, items: state.items.filter((i) => i.id !== id) }; emit(); persistItems(); },
  saveSettings(patch: Partial<Settings>) {
    state = { ...state, settings: mergeSettings({ ...state.settings, ...patch, nudges: { ...state.settings.nudges, ...(patch.nudges || {}) } }) }; emit(); persistSettings();
  },
  /** Test/preview helper: replace everything in memory (not persisted). */
  _set(next: Partial<State>) { state = { ...state, ...next }; emit(); },
};

export function useStore(): State { return useSyncExternalStore(store.subscribe, store.get, store.get); }
