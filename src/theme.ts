import type { SkinKey } from "./model/types";

export interface Palette {
  bg: string; surface: string; surface2: string; fg: string; muted: string; line: string;
  accent: string; btnBg: string; btnFg: string;
  msHit: string; msHitEdge: string; msNext: string; msOff: string;
  ico: string; icoEdge: string;
  dark: boolean;
}

/* One deliberate look per visual (the page takes its colour from the chosen background scene where there is one). */
export const PALETTES: Record<SkinKey, Palette> = {
  glass: { bg: "#E2EEE7", surface: "#F7FBF9", surface2: "#F0F7F3", fg: "#2B2330", muted: "#4F6559", line: "#CFE0D6", accent: "#A8435D", btnBg: "#2B2330", btnFg: "#FFFFFF", msHit: "#E3A92B", msHitEdge: "#B07A12", msNext: "#D9637F", msOff: "#9DB5A8", ico: "#F2C14E", icoEdge: "#B07A12", dark: false },
  crow: { bg: "#EADFCF", surface: "#F5EEE3", surface2: "#EFE5D6", fg: "#24190F", muted: "#6B5440", line: "#D6C6AF", accent: "#7A4E0A", btnBg: "#1C1A22", btnFg: "#F2C14E", msHit: "#F2C14E", msHitEdge: "#7A4E0A", msNext: "#1C1A22", msOff: "#5F6F7B", ico: "#F2C14E", icoEdge: "#8A5A00", dark: false },
  summit: { bg: "#E2E8EF", surface: "#F4F7FA", surface2: "#EDF2F7", fg: "#1D2A3A", muted: "#52637A", line: "#B9C6D4", accent: "#C24A1F", btnBg: "#1D2A3A", btnFg: "#FFFFFF", msHit: "#F26B3A", msHitEdge: "#C24A1F", msNext: "#1D2A3A", msOff: "#9AAABD", ico: "#F26B3A", icoEdge: "#F26B3A", dark: false },
  firefly: { bg: "#0D1330", surface: "#151C40", surface2: "#121939", fg: "#EAF0FF", muted: "#9AA6CF", line: "#27305A", accent: "#E6F57A", btnBg: "#E6F57A", btnFg: "#0D1330", msHit: "#E6F57A", msHitEdge: "#E6F57A", msNext: "#EAF0FF", msOff: "#3A4475", ico: "#F4FF9E", icoEdge: "#F4FF9E", dark: true },
  tree: { bg: "#E3EEDC", surface: "#F2F7EE", surface2: "#EAF2E4", fg: "#26301F", muted: "#55654C", line: "#CCDCC3", accent: "#2F6F73", btnBg: "#2F6F73", btnFg: "#FFFFFF", msHit: "#4FA66A", msHitEdge: "#2F8F57", msNext: "#2F6F73", msOff: "#C9B8A5", ico: "#5DBB7A", icoEdge: "#2F8F57", dark: false },
  galaxy: { bg: "#0B0A1A", surface: "#14122A", surface2: "#110F24", fg: "#F3EEFF", muted: "#A49DCF", line: "#2A2650", accent: "#FFD9A8", btnBg: "#FFD9A8", btnFg: "#0B0A1A", msHit: "#FFD9A8", msHitEdge: "#FFD9A8", msNext: "#F3EEFF", msOff: "#4A4580", ico: "#FFD9A8", icoEdge: "#FFD9A8", dark: true },
};

export const FONT = { display: "BricolageGrotesque_800ExtraBold", displayMed: "BricolageGrotesque_700Bold", body: "Figtree_400Regular", bodyMed: "Figtree_500Medium", bodySemi: "Figtree_600SemiBold", bodyBold: "Figtree_700Bold" };

/* The user's chosen background per visual (null = plain). */
export const SCENES: Partial<Record<SkinKey, string>> = { crow: "attic", summit: "valley", tree: "garden" };

export interface SkinCopy {
  name: string; swatch: [string, string]; ms: "dots" | "treasures" | "regions" | null; word: string; desc: (goal: number) => string;
  eyebrow: (goal: number) => string; listTitle: string; btn: string; toast: string;
  sub: (c: { pct: number; goal: number; t: number; raw: number }) => string; overText: (s: number) => string; chip?: (pct: number) => string;
}
