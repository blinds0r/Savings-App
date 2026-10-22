/** Scheduling logic in src/notify.ts, with expo-notifications mocked. Dates are local (TZ=America/New_York in the test command). */
const scheduled: { identifier: string; content: any; trigger: any }[] = [];
jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" }, AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(), setNotificationChannelAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })), requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => { scheduled.length = 0; }),
  scheduleNotificationAsync: jest.fn(async (n: any) => { scheduled.push(n); return n.identifier; }),
}));
import { reschedule, setupNotifications } from "../../notify";
import { DEFAULT_SETTINGS, Item } from "../types";

const it_ = (id: string, at: string, amount = 10): Item => ({ id, what: "x" + id, amount, at });
const byId = (id: string) => scheduled.find((n) => n.identifier === id);
const local = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();

beforeAll(async () => { expect(await setupNotifications()).toBe(true); });
afterEach(() => jest.useRealTimers());

describe("reschedule", () => {
  test("nothing is ever scheduled in the past; nudge is N days after the last skip at 10:00", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 12) }); // Wed Oct 21
    await reschedule([it_("a", "2026-10-20T19:30:00")], DEFAULT_SETTINGS);
    for (const n of scheduled) expect(n.trigger.date.getTime()).toBeGreaterThan(Date.now());
    expect(byId("nudge")!.trigger.date.getTime()).toBe(local(2026, 10, 24, 10));
  });
  test("nudge that would already have passed is not scheduled (one nudge per lapse)", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 12) });
    await reschedule([it_("a", "2026-10-10T19:30:00")], DEFAULT_SETTINGS);
    expect(byId("nudge")).toBeUndefined();
  });
  test("streak: nothing logged this week -> this Friday 18:00 with the run length", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 12) });
    await reschedule([it_("a", "2026-10-14T09:00:00"), it_("b", "2026-10-07T09:00:00")], DEFAULT_SETTINGS);
    const r = byId("weekly-run")!; expect(r.trigger.date.getTime()).toBe(local(2026, 10, 23, 18)); expect(r.content.title).toMatch(/2-week streak/);
  });
  test("streak: this week already covered -> next Friday 18:00 (the app may not be opened again before then)", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 12) });
    await reschedule([it_("c", "2026-10-20T09:00:00"), it_("a", "2026-10-14T09:00:00")], DEFAULT_SETTINGS);
    const r = byId("weekly-run")!; expect(r).toBeDefined(); expect(r.trigger.date.getTime()).toBe(local(2026, 10, 30, 18)); expect(r.content.title).toMatch(/2-week streak/);
  });
  test("streak: no run at all, or already past Friday evening -> nothing", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 12) });
    await reschedule([it_("a", "2026-09-30T09:00:00")], DEFAULT_SETTINGS); expect(byId("weekly-run")).toBeUndefined();
    jest.useFakeTimers({ now: new Date(2026, 9, 24, 12) }); // Sat
    await reschedule([it_("a", "2026-10-14T09:00:00")], DEFAULT_SETTINGS); expect(byId("weekly-run")).toBeUndefined();
  });
  test("recap: Sunday 19:00 with this week's numbers, only when something was logged this week", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 12) });
    await reschedule([it_("a", "2026-10-20T09:00:00", 25), it_("b", "2026-10-19T09:00:00", 5), it_("z", "2026-10-18T23:00:00", 500)], { ...DEFAULT_SETTINGS, target: 1000 });
    const r = byId("sunday-recap")!; expect(r.trigger.date.getTime()).toBe(local(2026, 10, 25, 19)); expect(r.content.body).toBe("2 skips, $30 saved. $470 to go.");
    await reschedule([it_("z", "2026-10-18T23:00:00", 500)], DEFAULT_SETTINGS); expect(byId("sunday-recap")).toBeUndefined();
  });
  test("toggles off remove the notification; each kind is scheduled at most once", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21, 12) });
    const items = [it_("a", "2026-10-20T09:00:00"), it_("b", "2026-10-14T09:00:00")];
    await reschedule(items, { ...DEFAULT_SETTINGS, nudges: { ...DEFAULT_SETTINGS.nudges, streak: false, recap: false } });
    expect(scheduled.map((n) => n.identifier)).toEqual(["nudge"]);
    await reschedule(items, DEFAULT_SETTINGS);
    expect(scheduled.map((n) => n.identifier).sort()).toEqual(["nudge", "sunday-recap", "weekly-run"]);
  });
});
