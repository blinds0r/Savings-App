export type SkinKey = "glass" | "crow" | "summit" | "firefly" | "tree" | "galaxy";
export type Mode = "target" | "monthly";

export interface Item {
  id: string;
  what: string;
  amount: number;
  /** Local time, "YYYY-MM-DDTHH:MM:SS" */
  at: string;
}

export interface Nudges {
  milestones: boolean;
  nudgeDays: 3 | 4 | 7;
  recap: boolean;
  streak: boolean;
}

export interface Settings {
  onboarded: boolean;
  mode: Mode;
  target: number;
  monthly: number;
  goalName: string;
  skin: SkinKey;
  /** The target that the "You did it." sheet has been answered for. */
  ackGoal: number;
  /** A target the goal sheet was dismissed for without choosing (shown again next launch). */
  motion: "full" | "calm";
  nudges: Nudges;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  mode: "target",
  target: 3000,
  monthly: 400,
  goalName: "",
  skin: "glass",
  ackGoal: 0,
  motion: "full",
  nudges: { milestones: true, nudgeDays: 4, recap: true, streak: true },
};

/** What a visual needs to draw itself. pct is 0..1 of the goal; surplus is dollars past it. */
export interface VisualState {
  pct: number;
  surplus: number;
  goal: number;
}

export interface Ctx {
  /** Every skip ever, in dollars. */
  total: number;
  /** What counts toward the current pile (all time, or this month). */
  raw: number;
  goal: number;
  /** raw capped at goal. */
  t: number;
  pct: number;
  surplus: number;
}
