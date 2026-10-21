import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance, SchedulableTriggerInputTypes } from "expo-notifications";
import type { Item, Settings } from "./model/types";
import { computeCtx, fmt, streakInfo, weekStart, dateOf } from "./model/logic";

/* All notifications are scheduled on the phone itself (no server). We reschedule the whole set whenever
 * the app opens or a skip is logged, so the copy always reflects the latest numbers. Caps: one of each kind. */
const IDS = { nudge: "nudge", run: "weekly-run", recap: "sunday-recap" };
let ready = false;

export async function setupNotifications() {
  if (Platform.OS === "web") return false;
  try {
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "Skipped It", importance: AndroidImportance.DEFAULT });
    const p = await Notifications.getPermissionsAsync();
    let granted = p.granted;
    if (!granted && p.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    ready = granted; return granted;
  } catch { return false; }
}

const at = (base: Date, h: number, m = 0) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d; };

export async function reschedule(items: Item[], s: Settings) {
  if (Platform.OS === "web" || !ready) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    const c = computeCtx(items, s, now);
    const last = items.length ? dateOf(items[0].at) : null;
    // Nudge: N quiet days after the last skip (or after today if nothing logged yet), at 10:00.
    if (s.nudges.nudgeDays) {
      const base = last || now; const d = at(base, 10); d.setDate(d.getDate() + s.nudges.nudgeDays);
      if (d > now) await Notifications.scheduleNotificationAsync({ identifier: IDS.nudge, content: { title: "Skipped anything lately?", body: "Even a $4 coffee counts. Two taps and it's in." }, trigger: { type: SchedulableTriggerInputTypes.DATE, date: d } });
    }
    // Weekly run: a heads-up on Friday evening if there is a run and nothing logged this week yet.
    if (s.nudges.streak) {
      const sk = streakInfo(items, now);
      if (sk.n > 0 && !sk.alive) {
        const fri = new Date(weekStart(now)); fri.setDate(fri.getDate() + 4); const d = at(fri, 18);
        if (d > now) await Notifications.scheduleNotificationAsync({ identifier: IDS.run, content: { title: `Your ${sk.n}-week run ends Sunday`, body: "One skip this weekend keeps it going." }, trigger: { type: SchedulableTriggerInputTypes.DATE, date: d } });
      }
    }
    // Sunday recap at 19:00 with this week's numbers so far.
    if (s.nudges.recap) {
      const ws = weekStart(now), thisWeek = items.filter((i) => dateOf(i.at).getTime() >= ws);
      const sun = new Date(ws); sun.setDate(sun.getDate() + 6); const d = at(sun, 19);
      const tot = thisWeek.reduce((a, i) => a + i.amount, 0);
      if (d > now && thisWeek.length) await Notifications.scheduleNotificationAsync({ identifier: IDS.recap, content: { title: "Your week, skipped", body: `${thisWeek.length} skip${thisWeek.length === 1 ? "" : "s"}, ${fmt(tot)} saved. ${fmt(Math.max(c.goal - c.t, 0))} to go.` }, trigger: { type: SchedulableTriggerInputTypes.DATE, date: d } });
    }
  } catch {}
}
