import { parseAmt, amtProblem, computeCtx, streakInfo, streakBanner, crossed, msAmounts, shortAmt, monthsStrip, dateOf } from "../logic";
import { DEFAULT_SETTINGS, Item } from "../types";

const it_ = (id: string, at: string, amount = 10): Item => ({ id, what: "x" + id, amount, at });

describe("parseAmt", () => {
  test.each([["12.5", 12.5], ["$1,200", 1200], [".99", 0.99], ["20", 20], ["0", 0]])("%s -> %s", (s, v) => expect(parseAmt(s)).toBe(v));
  test.each(["-5", "1.2.3", "abc", "1,20", "12.345"])("%s is invalid", (s) => expect(parseAmt(s)).toBeNaN());
  test("problems", () => {
    expect(amtProblem("", NaN)).toBe("");
    expect(amtProblem("abc", NaN)).toMatch(/like 12.50/);
    expect(amtProblem("200000", 200000)).toMatch(/under/);
  });
});

describe("computeCtx", () => {
  const items = [it_("a", "2026-10-20T10:00:00", 50), it_("b", "2026-09-02T10:00:00", 500)];
  const now = new Date(2026, 9, 21, 9);
  test("target mode counts everything", () => {
    const c = computeCtx(items, { ...DEFAULT_SETTINGS, target: 1000 }, now);
    expect(c).toMatchObject({ total: 550, raw: 550, t: 550, pct: 0.55, surplus: 0 });
  });
  test("monthly mode counts this month only, with surplus", () => {
    const c = computeCtx(items, { ...DEFAULT_SETTINGS, mode: "monthly", monthly: 40 }, now);
    expect(c).toMatchObject({ raw: 50, t: 40, pct: 1, surplus: 10 });
  });
  test("pending animation amounts are held back", () => {
    expect(computeCtx(items, { ...DEFAULT_SETTINGS, target: 1000 }, now, 50).raw).toBe(500);
  });
});

describe("milestones", () => {
  test("row amounts", () => { expect(msAmounts(1000)).toEqual([50, 100, 200, 400, 700, 1000]); expect(shortAmt(1500)).toBe("$1.5k"); expect(shortAmt(50)).toBe("$50"); });
  test("crossing", () => { expect(crossed(0.04, 0.11)).toEqual([5, 10]); expect(crossed(0.5, 0.5)).toEqual([]); expect(crossed(0.99, 1)).toEqual([100]); });
});

describe("weekly run", () => {
  const prev2 = [it_("a", "2026-10-14T12:00:00"), it_("b", "2026-10-07T12:00:00")];
  test("Fri with run 2 and nothing this week -> 3 days left", () => {
    const sk = streakInfo(prev2, new Date(2026, 9, 23, 10));
    expect(sk).toEqual({ n: 2, alive: false, daysLeft: 3 });
    expect(streakBanner(sk, true)).toMatch(/3 days left.*2-week/);
  });
  test("Wed -> no banner", () => expect(streakBanner(streakInfo(prev2, new Date(2026, 9, 21, 10)), true)).toBe(""));
  test("no run -> no banner", () => expect(streakBanner(streakInfo([it_("b", "2026-09-30T12:00:00")], new Date(2026, 9, 23, 10)), true)).toBe(""));
  test("DST end (NY): Mon Nov 2 with the two weeks before -> 3", () => {
    const sk = streakInfo([it_("d", "2026-11-02T09:00:00"), it_("c", "2026-10-27T09:00:00"), it_("e", "2026-10-20T09:00:00")], new Date(2026, 10, 2, 15));
    expect(sk.n).toBe(3);
  });
  test("DST start: Mar 15 2027 -> 3", () => {
    const sk = streakInfo([it_("d", "2027-03-15T09:00:00"), it_("c", "2027-03-09T09:00:00"), it_("e", "2027-03-02T09:00:00")], new Date(2027, 2, 15, 15));
    expect(sk.n).toBe(3);
  });
  test("Sunday 23:30 is still the same week", () => {
    expect(streakInfo([it_("c", "2026-10-25T23:00:00"), ...prev2], new Date(2026, 9, 25, 23, 30))).toMatchObject({ n: 3, alive: true, daysLeft: 1 });
  });
});

describe("months strip", () => {
  test("six months, current uses raw", () => {
    const m = monthsStrip([it_("a", "2026-08-10T10:00:00", 500)], 300, 120, new Date(2026, 9, 21));
    expect(m.rows.map((r) => r.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(m.rows[3]).toMatchObject({ value: 500, over: true });
    expect(m.rows[5]).toMatchObject({ value: 120, current: true });
    expect(m.beaten).toBe(1);
  });
});

test("dateOf parses local dates", () => { const d = dateOf("2026-10-20T19:52:00"); expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 20, 19]); });
