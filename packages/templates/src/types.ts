/**
 * A template after `extends` is resolved, with every length converted to PDF
 * points (1/72 in). This is what the paginator reads.
 */

export type TextStyle = "bold" | "italic" | "underline";
export type Align = "left" | "right" | "center";
export type Case = "as-written" | "upper";

export type ScreenplayElementName =
  | "scene_heading"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "centered"
  | "lyrics";

export type StageElementName =
  | "act_heading"
  | "scene_heading"
  | "stage_direction"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "lyrics";

export type ElementName = ScreenplayElementName | StageElementName;

export interface ElementStyle {
  indent: number;
  /** Null: runs to the right margin. */
  width: number | null;
  align: Align;
  case: Case;
  style: TextStyle[];
  prefix: string;
  suffix: string;
  wrap: "parentheses" | "brackets" | null;
  spaceBefore: number;
}

export interface ColumnStyle {
  indent: number;
  width: number | null;
}

export interface DualDialogueStyle {
  indent: number;
  width: number | null;
  gap: number;
  spaceBefore: number;
  character: ColumnStyle;
  parenthetical: ColumnStyle;
  dialogue: ColumnStyle;
  lyrics: ColumnStyle;
}

export interface PageNumberStyle {
  align: Align;
  format: string;
  fromPage: number;
}

export interface RunningStyle {
  offset: number;
  pageNumber: PageNumberStyle | null;
}

export interface TitleArea {
  top: number | null;
  fields: string[];
  spaceBetween: number;
}

export interface TitlePageStyle {
  center: TitleArea;
  bottomLeft: TitleArea;
  bottomRight: TitleArea;
  title: { case: Case; style: TextStyle[] };
}

export interface Template {
  id: string;
  name: string;
  kind: "screenplay" | "stage";
  /** Base templates exist to be extended and can't be chosen for a script. */
  abstract: boolean;
  page: {
    width: number;
    height: number;
    margin: { top: number; bottom: number; left: number; right: number };
  };
  font: { family: "Courier Prime"; size: number; lineHeight: number };
  elements: Partial<Record<ElementName, ElementStyle>>;
  dualDialogue: DualDialogueStyle | null;
  pagination: {
    dialogue: {
      split: boolean;
      more: string;
      continued: string;
      minLinesEachSide: number;
    };
    characterContinued: { enabled: boolean; text: string };
    sceneContinued: { enabled: boolean; top: string; bottom: string };
    sceneHeading: { keepWithNext: number };
    sceneNumbers: "none" | "left" | "right" | "both";
  };
  sceneNumber: { left: number; right: number };
  header: RunningStyle | null;
  footer: RunningStyle | null;
  titlePage: TitlePageStyle | null;
}
