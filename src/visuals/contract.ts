import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { VisualState } from "../model/types";

/**
 * CONTRACT for a visual (one file per visual under src/visuals/<key>/).
 *
 * A visual is a Skia <Canvas> that draws the scene for `state` and plays animations on demand.
 * Everything is a pure function of (state, time): keep a Reanimated clock for the resting animation,
 * and two progress values `addT` / `msT` that run 0 -> 1 while an add or milestone plays.
 * Heavy static content (a heap of 150 coins, 300 leaves) must be drawn with <Atlas> or cached in a Picture,
 * never as hundreds of individually animated components.
 */
export interface SceneHandle {
  /** Play the add animation for `amount` dollars on the CURRENT state. Resolves when done; the host then updates `state`. */
  playAdd(amount: number): Promise<void>;
  /** Play the milestone reward for `pct` (5, 10, ... 100). Resolves when done. */
  playMilestone(pct: number): Promise<void>;
  /** Cancel anything in flight (visual switch, preview). */
  cancel(): void;
}
export interface SceneProps {
  state: VisualState;
  /** Pixel size of the canvas; the scene's own coordinate box is scaled to fit (xMidYMid meet). */
  width: number;
  height: number;
  /** false = skip animations, jump to end states. */
  motion: boolean;
  /** Draw the chosen background scene behind the visual (null = plain). */
  background: string | null;
}
export type SceneComponent = ForwardRefExoticComponent<SceneProps & RefAttributes<SceneHandle>>;

export interface VisualDef {
  key: string;
  /** The scene's coordinate box: x, y, width, height (matches the prototype's SVG viewBox). */
  box: { x: number; y: number; w: number; h: number };
  /** Plain background colour behind the whole scene. */
  plain: string;
  /** Available backgrounds, keyed; each has a page colour for the UI around it. */
  backgrounds: Record<string, { name: string; page: string }>;
  Scene: SceneComponent;
}

/** Fit a box into width x height, centred (xMidYMid meet). Returns scale and translation. */
export function fitBox(box: VisualDef["box"], width: number, height: number) {
  const scale = Math.min(width / box.w, height / box.h);
  const tx = (width - box.w * scale) / 2 - box.x * scale;
  const ty = (height - box.h * scale) / 2 - box.y * scale;
  return { scale, tx, ty };
}
