import { migration as m0001 } from "./0001-initial.ts";
import type { Migration } from "./types.ts";

/**
 * Every migration, in order. Names sort in the order they run; a released
 * name never changes.
 */
export const MIGRATIONS: Readonly<Record<string, Migration>> = {
  "0001-initial": m0001,
};
