import { countOf, fmt, pctTxt, r2, unitOf } from "./model/logic";
import type { SkinKey } from "./model/types";
import type { SkinCopy } from "./theme";

export const SKINS: Record<SkinKey, SkinCopy> = {
  glass: { name: "Glass pig", swatch: ["#E2EEE7", "#E596AD"], ms: "dots", word: "full", desc: () => "Fills with coins",
    eyebrow: () => "Glass pig", listTitle: "What I skipped", btn: "Drop it in", toast: "Into the pig",
    sub: (c) => `${pctTxt(c.pct)} full · ${fmt(r2(c.goal - c.t))} to go`, overText: (s) => `${fmt(s)} spilling over` },
  crow: { name: "Crow's hoard", swatch: ["#B08A62", "#1C1A22"], ms: "treasures", word: "stashed", desc: () => "A crow stashes your coins",
    eyebrow: () => "The hoard", listTitle: "What the crow brought", btn: "Add a shiny thing", toast: "The crow stashed",
    sub: (c) => `The chest is ${pctTxt(c.pct)} full. ${fmt(r2(c.goal - c.t))} more to stash.`, overText: (s) => `${fmt(s)} piled around the chest` },
  summit: { name: "Summit", swatch: ["#E6EDF3", "#F26B3A"], ms: null, word: "climbed", desc: () => "Climb to a 3,000 m summit",
    eyebrow: () => "Ascent · 3,000 m", listTitle: "Trail log", btn: "Log a skip", toast: "Up the trail",
    sub: (c) => `climbed by skipping ${fmt(c.raw)} of stuff · ${pctTxt(c.pct)} up`, overText: (s) => `${fmt(s)} above the summit, by balloon` },
  firefly: { name: "Firefly jar", swatch: ["#0D1330", "#E6F57A"], ms: "dots", word: "glowing", desc: (g) => `A firefly per ${unitOf(g, 300)}`,
    eyebrow: (g) => `Firefly jar · one per ${unitOf(g, 300)}`, listTitle: "Caught so far", btn: "Catch another", toast: "Into the jar",
    sub: (c) => { const n = countOf(c.pct, 300); return `${n === 1 ? "1 firefly" : n + " fireflies"} glowing. The jar lights up at ${fmt(c.goal)}.`; }, overText: (s) => `${fmt(s)} worth glowing outside the jar` },
  tree: { name: "Money tree", swatch: ["#BFD9AE", "#2F6F73"], ms: "dots", word: "grown", desc: (g) => `A leaf per ${unitOf(g, 300)}`,
    eyebrow: (g) => `Money tree · a leaf per ${unitOf(g, 300)}`, listTitle: "Leaves grown", btn: "Add a skip", toast: "New leaves for",
    sub: (c) => { const n = countOf(c.pct, 300); return `${n === 1 ? "1 leaf" : n + " leaves"} on the branches`; }, overText: (s) => `${fmt(s)} of leaves on the ground`,
    chip: (p) => (p >= 1 ? "Harvest" : p >= 0.66 ? "Full canopy" : p >= 0.33 ? "Leafing out" : p >= 0.1 ? "Budding" : "Bare branches") },
  galaxy: { name: "Galaxy", swatch: ["#0B0A1A", "#FFD9A8"], ms: "regions", word: "lit", desc: (g) => `A star per ${unitOf(g, 150)}`,
    eyebrow: (g) => `Galaxy · a star per ${unitOf(g, 150)}`, listTitle: "Stars lit", btn: "Light a star", toast: "New star for",
    sub: (c) => `${countOf(c.pct, 150)} of 150 stars lit · ${pctTxt(c.pct)} of the way`, overText: (s) => `${fmt(s)} forming a second galaxy` },
};
export const OVER_NOUN: Record<SkinKey, string> = { glass: "coins spilling out around the pig", crow: "treasure piled around the chest", summit: "a balloon rising above the summit", firefly: "fireflies glowing outside the jar", tree: "leaves gathering on the ground", galaxy: "a second galaxy forming" };
export const SKIN_KEYS = Object.keys(SKINS) as SkinKey[];
