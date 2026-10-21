jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
import { parseAmt, amtProblem, computeCtx, streakInfo, crossed, monthsStrip, weekStart, msAmounts, MAX_AMT } from "../logic";
import { mergeSettings } from "../store";
import { DEFAULT_SETTINGS, Item } from "../types";

const it_ = (id: string, at: string, amount = 10): Item => ({ id, what: "x" + id, amount, at });

describe("parseAmt edge cases", () => {
  test.each([["1,234,567.89", 1234567.89], [" 12 ", 12], ["$ 12", 12], ["12.", 12], ["007", 7], ["0.5", 0.5], ["100000", 100000]])("%s -> %s", (s, v) => expect(parseAmt(s)).toBe(v));
  test.each(["1e3", "12,34", "1,2345", ",100", "1,000,00", "+5", "１２", "12.5.", "NaN", "Infinity"])("%s is invalid", (s) => expect(parseAmt(s)).toBeNaN());
  test("null and undefined are invalid, not a crash", () => { expect(parseAmt(null)).toBeNaN(); expect(parseAmt(undefined)).toBeNaN(); });
  test("limits", () => { expect(amtProblem("100000", 100000)).toBe(""); expect(amtProblem("100001", 100001)).toMatch(/under/); expect(amtProblem("0", 0)).toBe(""); expect(parseAmt("99999999999999999999") > MAX_AMT).toBe(true); });
});

describe("settings merge / migration", () => {
  test("missing keys fall back to defaults, including nested nudges", () => {
    const m = mergeSettings({ onboarded: true, target: 250, nudges: { recap: false } as any });
    expect(m).toMatchObject({ onboarded: true, target: 250, monthly: 400, skin: "glass", mode: "target", nudges: { milestones: true, nudgeDays: 4, recap: false, streak: true } });
  });
  test("null / undefined give the defaults", () => { expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS); expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS); });
  test("an unknown skin key does not survive (it would crash PALETTES[skin].bg on launch)", () => {
    expect(mergeSettings({ skin: "pig" as any }).skin).toBe("glass");
    expect(mergeSettings({ skin: "galaxy" }).skin).toBe("galaxy");
  });
  test("bad mode or amounts fall back", () => {
    expect(mergeSettings({ mode: "weekly" as any }).mode).toBe("target");
    expect(mergeSettings({ target: "3000" as any, monthly: NaN }).target).toBe(3000);
    expect(mergeSettings({ target: 0, monthly: -5 })).toMatchObject({ target: 3000, monthly: 400 });
    expect(mergeSettings({ target: 1200 }).target).toBe(1200);
  });
});

describe("milestone crossing", () => {
  test("exact landing on a milestone counts once", () => { expect(crossed(0.049, 0.05)).toEqual([5]); expect(crossed(0.05, 0.05)).toEqual([]); });
  test("float noise does not skip a milestone", () => { const goal = 1000; expect(crossed(0, 0.5)).toEqual([5, 10, 15, 20, 30, 40, 50]); expect(crossed(149.99 / goal, 150 / goal)).toEqual([15]); expect(crossed(0.1 + 0.2 - 0.3, 0.05)).toEqual([5]); });
  test("past 100 nothing more fires", () => { expect(crossed(1, 1.5)).toEqual([]); expect(crossed(0.95, 1.5)).toEqual([100]); });
  test("row amounts are rounded to cents", () => { expect(msAmounts(333)).toEqual([16.65, 33.3, 66.6, 133.2, 233.1, 333]); });
});

describe("month boundaries (local time)", () => {
  const items = [it_("a", "2026-10-31T23:59:59", 50), it_("b", "2026-11-01T00:00:00", 7)];
  const s = { ...DEFAULT_SETTINGS, mode: "monthly" as const, monthly: 100 };
  test("Oct 31 23:59:59 belongs to October, Nov 1 00:00:00 to November", () => {
    expect(computeCtx(items, s, new Date(2026, 9, 31, 23, 59, 59)).raw).toBe(50);
    expect(computeCtx(items, s, new Date(2026, 10, 1, 0, 0, 0)).raw).toBe(7);
  });
  test("pending is held back from this month only, never below zero", () => {
    expect(computeCtx(items, s, new Date(2026, 10, 1), 7).raw).toBe(0);
    expect(computeCtx(items, s, new Date(2026, 10, 1), 999).raw).toBe(0);
    expect(computeCtx(items, s, new Date(2026, 10, 1), 7).total).toBe(57);
  });
  test("strip crosses a year boundary", () => {
    const m = monthsStrip([it_("a", "2026-12-05T10:00:00", 90)], 100, 10, new Date(2027, 1, 10));
    expect(m.rows.map((r) => r.key)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(m.rows[3]).toMatchObject({ value: 90, pct: 0.9, over: false });
    expect(m.rows[5]).toMatchObject({ value: 10, current: true });
    expect(m.beaten).toBe(0);
  });
  test("strip: current month that beats the goal counts as beaten, over flag uses raw", () => {
    const m = monthsStrip([], 100, 120, new Date(2026, 9, 21));
    expect(m.rows[5]).toMatchObject({ pct: 1, over: true }); expect(m.beaten).toBe(1);
  });
});

describe("week boundaries", () => {
  test("Sunday 23:59:59 and Monday 00:00:00 are different weeks", () => {
    expect(weekStart(new Date(2026, 9, 25, 23, 59, 59))).toBe(new Date(2026, 9, 19).getTime());
    expect(weekStart(new Date(2026, 9, 26, 0, 0, 0))).toBe(new Date(2026, 9, 26).getTime());
  });
  test("Monday has 7 days left, Sunday 1", () => {
    expect(streakInfo([], new Date(2026, 9, 26, 9)).daysLeft).toBe(7);
    expect(streakInfo([], new Date(2026, 11, 6, 9)).daysLeft).toBe(1);
  });
  test("several skips in one week count as one week; a gap breaks the run", () => {
    const sk = streakInfo([it_("a", "2026-10-20T09:00:00"), it_("b", "2026-10-21T09:00:00"), it_("c", "2026-10-13T09:00:00"), it_("d", "2026-09-29T09:00:00")], new Date(2026, 9, 21, 12));
    expect(sk).toMatchObject({ n: 2, alive: true });
  });
  test("a future-dated skip does not inflate the run", () => {
    expect(streakInfo([it_("a", "2026-11-20T09:00:00")], new Date(2026, 9, 21, 12)).n).toBe(0);
  });
});
