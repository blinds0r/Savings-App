import type { VisualDef } from "./contract";
import { PROBE } from "./probe";
import { DEF as PIG } from "./pig";
import { DEF as CROW } from "./crow";
import { DEF as SUMMIT } from "./summit";
import { DEF as FIREFLY } from "./firefly";
import { DEF as TREE } from "./tree";
import { DEF as GALAXY } from "./galaxy";

/** All visuals by key (the app's skin keys). */
export const VISUALS: Record<string, VisualDef> = { probe: PROBE, glass: PIG, crow: CROW, summit: SUMMIT, firefly: FIREFLY, tree: TREE, galaxy: GALAXY };
