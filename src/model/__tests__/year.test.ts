import { yearSummary } from "../logic";
import type { Item } from "../types";

const it = (id: string, at: string, amount: number, what = id): Item => ({ id, at, amount, what });

describe("yearSummary", () => {
  const now = new Date(2026, 9, 21, 12);
  test("empty ledger", () => {
    const y = yearSummary([], 400, now);
    expect(y.total).toBe(0); expect(y.months).toEqual([]); expect(y.since).toBeNull();
  });
  test("months run from the first skip's month to now, with gaps as zero", () => {
    const y = yearSummary([it("a", "2026-07-03T10:00:00", 310), it("b", "2026-09-10T10:00:00", 520), it("c", "2026-10-02T10:00:00", 170)], 400, now);
    expect(y.months.map((m) => [m.label, m.value, m.beaten, m.current])).toEqual([["Jul", 310, false, false], ["Aug", 0, false, false], ["Sep", 520, true, false], ["Oct", 170, false, true]]);
    expect(y.total).toBe(1000); expect(y.since).toBe("July");
  });
  test("target mode never marks months beaten", () => {
    const y = yearSummary([it("a", "2026-10-01T10:00:00", 999)], null, now);
    expect(y.months[0].beaten).toBe(false);
  });
  test("top three by amount, typical is the median", () => {
    const xs = [5, 50, 160, 120, 95, 45].map((a, i) => it(String(i), `2026-10-0${i + 1}T10:00:00`, a));
    const y = yearSummary(xs, 400, now);
    expect(y.top.map((i) => i.amount)).toEqual([160, 120, 95]);
    expect(y.typical).toBe(72.5);
  });
  test("weekday only with five or more skips and a single winner", () => {
    const fri = ["2026-10-02", "2026-10-09", "2026-10-16"].map((d, i) => it("f" + i, d + "T10:00:00", 10));
    const other = [it("m", "2026-10-05T10:00:00", 10), it("t", "2026-10-06T10:00:00", 10)];
    expect(yearSummary([...fri, ...other], 400, now).weekday).toEqual({ name: "Fridays", n: 3 });
    expect(yearSummary(fri, 400, now).weekday).toBeNull();
  });
  test("running total ends at the total and never goes down", () => {
    const y = yearSummary([it("a", "2026-08-03T10:00:00", 30), it("b", "2026-07-03T10:00:00", 20)], 400, now);
    const vs = y.curve.map((c) => c.v);
    expect(vs[vs.length - 1]).toBe(50);
    vs.forEach((v, i) => { if (i) expect(v).toBeGreaterThanOrEqual(vs[i - 1]); });
    y.curve.forEach((c) => { expect(c.t).toBeGreaterThanOrEqual(0); expect(c.t).toBeLessThanOrEqual(1); });
  });
});
