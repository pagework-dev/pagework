import { plainText, type Element } from "@pagework/fountain";

export interface SceneEntry {
  /** 1-based source line of the heading. */
  line: number;
  /** As printed: the template's scene number rule uses the same count. */
  number: string;
  heading: string;
}

export function scenesOf(elements: readonly Element[]): SceneEntry[] {
  const scenes: SceneEntry[] = [];
  for (const el of elements) {
    if (el.type !== "scene_heading") continue;
    scenes.push({
      line: el.lines[0],
      number: el.sceneNumber ?? String(scenes.length + 1),
      heading: plainText(el.content).toUpperCase(),
    });
  }
  return scenes;
}

/** Whether two scene lists would show the same navigator. */
export function sameScenes(a: SceneEntry[], b: SceneEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => {
      const o = b[i];
      return (
        o?.line === s.line && o.number === s.number && o.heading === s.heading
      );
    })
  );
}

/** The scene a 1-based source line is in, or null before the first heading. */
export function sceneAt(scenes: SceneEntry[], line: number): SceneEntry | null {
  let found: SceneEntry | null = null;
  for (const scene of scenes) {
    if (scene.line > line) break;
    found = scene;
  }
  return found;
}
