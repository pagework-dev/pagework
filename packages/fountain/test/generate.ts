/**
 * Builds long Fountain scripts from a seed, for incremental-parsing and
 * performance tests. The text is assembled from short phrases written for
 * this repository; it reads like a script only at a glance, which is all the
 * tests need.
 */

/** Small, fast, seedable PRNG (mulberry32), so every run sees the same script. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(next: () => number, items: readonly T[]): T {
  const item = items[Math.floor(next() * items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

const PLACES = [
  "HARBOUR OFFICE",
  "SEA WALL",
  "BUS SHELTER",
  "KITCHEN",
  "FERRY DECK",
  "BACK LANE",
  "LIGHTHOUSE STAIRS",
  "MOTEL CAR PARK",
];
const TIMES = ["DAY", "NIGHT", "DAWN", "LATER", "CONTINUOUS"];
const NAMES = ["MARGUERITE", "TOM", "AUNTIE JO", "DEV", "PRIYA", "OLD KEMP"];
const ACTIONS = [
  "Rain needles the window. A kettle starts to tick as it heats.",
  "She counts the coins twice, then a third time, and pockets them.",
  "The ferry horn sounds somewhere out past the breakwater.",
  "He sets the map down, smooths it flat with both hands and waits.",
  "Gulls fight over a chip packet. Nobody moves to stop them.",
  "A torch beam crosses the wall, stops on the calendar, moves on.",
];
const LINES = [
  "You said the tide turns at six.",
  "I said it turns. I never said when.",
  "Leave the light on for her, would you?",
  "We have until the bus comes. That's all.",
  "If he asks, I was here the whole time.",
  "Nobody keeps a boat they can't sail.",
];
const ASIDES = ["(quietly)", "(not looking up)", "(beat)", "(to Dev)"];

/** About one printed page per scene on US Letter. */
export function generateScript(pages: number, seed = 1): string {
  const next = random(seed);
  const out: string[] = [
    "Title: The Long Tide",
    "Credit: Written by",
    "Author: Pagework test generator",
    "",
  ];
  for (let scene = 1; scene <= pages; scene++) {
    out.push(
      `${pick(next, ["INT.", "EXT."])} ${pick(next, PLACES)} - ${pick(next, TIMES)}`,
      "",
    );
    const beats = 11 + Math.floor(next() * 5);
    let last = "";
    for (let beat = 0; beat < beats; beat++) {
      if (next() < 0.35) {
        out.push(pick(next, ACTIONS), "");
        continue;
      }
      let name = pick(next, NAMES);
      if (name === last) name = pick(next, NAMES);
      last = name;
      out.push(next() < 0.1 ? `${name} (V.O.)` : name);
      if (next() < 0.25) out.push(pick(next, ASIDES));
      out.push(pick(next, LINES));
      if (next() < 0.4) out.push(pick(next, LINES));
      out.push("");
    }
    if (next() < 0.2) out.push("CUT TO:", "");
  }
  return out.join("\n");
}
