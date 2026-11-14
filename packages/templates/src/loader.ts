import { Validator, type OutputUnit } from "@cfworker/json-schema";
import { parse as parseYaml, YAMLError } from "yaml";
import schema from "../schema.json" with { type: "json" };
import type {
  Case,
  ColumnStyle,
  ElementName,
  ElementStyle,
  RunningStyle,
  Template,
  TextStyle,
  TitleArea,
} from "./types.ts";

/** A template file as written, after schema validation. */
export interface TemplateFile {
  schema: 1;
  id: string;
  name: string;
  extends?: string;
  [field: string]: unknown;
}

export class TemplateError extends Error {
  override name = "TemplateError";
}

type Json = Record<string, unknown>;

const fileValidator = new Validator(schema as object, "2020-12", false);

const POINTS_PER_UNIT = { pt: 1, in: 72, mm: 72 / 25.4 } as const;

// Sizes from ISO 216 (A4, 210 × 297 mm) and ANSI/ASME Y14.1 (Letter, 8.5 × 11 in).
const PAGE_SIZES = {
  a4: { width: "210mm", height: "297mm" },
  letter: { width: "8.5in", height: "11in" },
} as const;

const SCREENPLAY_ELEMENTS: readonly ElementName[] = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "centered",
  "lyrics",
];

const STAGE_ELEMENTS: readonly ElementName[] = [
  "act_heading",
  "scene_heading",
  "stage_direction",
  "character",
  "parenthetical",
  "dialogue",
  "lyrics",
];

/** Converts a length such as "1.5in", "25mm" or "12pt" to points. */
export function parseLength(value: string): number {
  const match = /^(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)(mm|in|pt)$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new TemplateError(
      `"${value}" is not a length; write a number followed by mm, in or pt`,
    );
  }
  return (
    Number(match[1]) * POINTS_PER_UNIT[match[2] as keyof typeof POINTS_PER_UNIT]
  );
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (!isObject(value)) return value;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== null) out[key] = withoutNulls(child);
  }
  return out;
}

function describeErrors(errors: readonly OutputUnit[]): string {
  // The validator reports every enclosing $ref and properties keyword too;
  // only the innermost failures say what is actually wrong.
  const wrapping = new Set(["$ref", "properties", "allOf", "anyOf", "$defs"]);
  const specific = errors.filter((e) => !wrapping.has(e.keyword));
  const shown = (specific.length > 0 ? specific : errors).map(
    (e) => `  ${e.instanceLocation.replace(/^#/, "") || "/"}: ${e.error}`,
  );
  return [...new Set(shown)].join("\n");
}

/**
 * Parses and validates one template file. `origin` names the file in error
 * messages.
 */
export function parseTemplate(source: string, origin: string): TemplateFile {
  let data: unknown;
  try {
    data = parseYaml(source);
  } catch (error) {
    const reason = error instanceof YAMLError ? error.message : String(error);
    throw new TemplateError(`${origin} is not valid YAML: ${reason}`);
  }
  const result = fileValidator.validate(withoutNulls(data));
  if (!result.valid) {
    throw new TemplateError(
      `${origin} does not match the template schema:\n${describeErrors(result.errors)}`,
    );
  }
  return data as TemplateFile;
}

/** Maps merge field by field; lists and plain values replace; null removes. */
function merge(parent: unknown, child: unknown): unknown {
  if (!isObject(parent) || !isObject(child)) return child;
  const out: Json = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (value === null) {
      out[key] = null;
    } else {
      out[key] = merge(parent[key], value);
    }
  }
  return out;
}

function chain(id: string, load: (id: string) => TemplateFile): TemplateFile[] {
  const files: TemplateFile[] = [];
  const seen: string[] = [];
  let next: string | undefined = id;
  while (next !== undefined) {
    if (seen.includes(next)) {
      throw new TemplateError(
        `Template inheritance has a cycle: ${[...seen, next].join(" → ")}`,
      );
    }
    seen.push(next);
    const file = load(next);
    if (file.id !== next) {
      throw new TemplateError(
        `Template file has id "${file.id}" but was loaded as "${next}"`,
      );
    }
    files.unshift(file);
    next = file.extends;
  }
  return files;
}

// Reading helpers for the merged data. The schema has already checked types,
// so these only deal with values being absent.
function get(data: unknown, path: string): unknown {
  let value: unknown = data;
  for (const key of path.split(".")) {
    value = isObject(value) ? value[key] : undefined;
  }
  return value ?? undefined;
}

interface Reader {
  data: unknown;
  missing: string[];
  /** A value the merged template must have. Schema validation fixed its type. */
  value: (path: string) => unknown;
  text: (path: string) => string;
  flag: (path: string) => boolean;
  count: (path: string) => number;
  optional: <T>(path: string, fallback: T) => T;
  length: (path: string) => number;
  optionalLength: (path: string) => number | null;
}

function reader(data: unknown): Reader {
  const missing: string[] = [];
  const value = (path: string): unknown => {
    const found = get(data, path);
    if (found === undefined) missing.push(path);
    return found;
  };
  return {
    data,
    missing,
    value,
    text: (path) => {
      const found = value(path);
      return typeof found === "string" ? found : "";
    },
    flag: (path) => value(path) === true,
    count: (path) => Number(value(path) ?? 0),
    optional: <T>(path: string, fallback: T): T => {
      const found = get(data, path);
      return found === undefined ? fallback : (found as T);
    },
    length: (path) => {
      const found = value(path);
      return typeof found === "string" ? parseLength(found) : 0;
    },
    optionalLength: (path) => {
      const found = get(data, path);
      return typeof found === "string" ? parseLength(found) : null;
    },
  };
}

function elementStyle(r: Reader, path: string): ElementStyle {
  return {
    indent: r.optionalLength(`${path}.indent`) ?? 0,
    width: r.optionalLength(`${path}.width`),
    align: r.optional(`${path}.align`, "left"),
    case: r.optional<Case>(`${path}.case`, "as-written"),
    style: r.optional<TextStyle[]>(`${path}.style`, []),
    prefix: r.optional(`${path}.prefix`, ""),
    suffix: r.optional(`${path}.suffix`, ""),
    wrap: r.optional(`${path}.wrap`, null),
    spaceBefore: r.optional(`${path}.space_before`, 0),
  };
}

function columnStyle(r: Reader, path: string): ColumnStyle {
  return {
    indent: r.optionalLength(`${path}.indent`) ?? 0,
    width: r.optionalLength(`${path}.width`),
  };
}

function running(r: Reader, path: string): RunningStyle | null {
  if (get(r.data, path) === undefined) return null;
  const hasNumber = get(r.data, `${path}.page_number`) !== undefined;
  return {
    offset: r.length(`${path}.offset`),
    pageNumber: hasNumber
      ? {
          align: r.optional(`${path}.page_number.align`, "right"),
          format: r.optional(`${path}.page_number.format`, "{page}"),
          fromPage: r.optional(`${path}.page_number.from_page`, 1),
        }
      : null,
  };
}

function titleArea(r: Reader, path: string): TitleArea {
  return {
    top: r.optionalLength(`${path}.top`),
    fields: r.optional<string[]>(`${path}.fields`, []),
    spaceBetween: r.optional(`${path}.space_between`, 0),
  };
}

/**
 * Loads a template and everything it extends, merges them and converts the
 * result to points. `load` returns a parsed file for an id (see
 * {@link parseTemplate}); it is how callers supply files from disk, a bundle
 * or a database.
 */
export function resolveTemplate(
  id: string,
  load: (id: string) => TemplateFile,
): Template {
  const files = chain(id, load);
  const merged = files.reduce<unknown>((acc, file) => merge(acc, file), {});
  const data = withoutNulls(merged);
  const r = reader(data);

  const kind = r.value("kind") as "screenplay" | "stage";
  const allowed = kind === "stage" ? STAGE_ELEMENTS : SCREENPLAY_ELEMENTS;
  const declared = Object.keys(r.optional<Json>("elements", {})).filter(
    (name) => name !== "dual_dialogue",
  );
  const foreign = declared.filter(
    (name) => !allowed.includes(name as ElementName),
  );
  if (foreign.length > 0) {
    throw new TemplateError(
      `Template "${id}" is a ${kind} template but defines ${foreign.join(", ")}`,
    );
  }

  const size = r.value("page.size") as
    string | { width: string; height: string } | undefined;
  const dimensions =
    typeof size === "string"
      ? PAGE_SIZES[size as keyof typeof PAGE_SIZES]
      : size;

  const elements: Partial<Record<ElementName, ElementStyle>> = {};
  for (const name of allowed) {
    r.value(`elements.${name}`);
    elements[name] = elementStyle(r, `elements.${name}`);
  }

  const dual = get(data, "elements.dual_dialogue") !== undefined;
  const sceneNumbers = r.value(
    "pagination.scene_numbers",
  ) as Template["pagination"]["sceneNumbers"];
  const hasTitlePage = get(data, "title_page") !== undefined;

  const template: Template = {
    id,
    name: r.text("name"),
    kind,
    abstract: id.startsWith("base/"),
    page: {
      width: dimensions === undefined ? 0 : parseLength(dimensions.width),
      height: dimensions === undefined ? 0 : parseLength(dimensions.height),
      margin: {
        top: r.length("page.margin.top"),
        bottom: r.length("page.margin.bottom"),
        left: r.length("page.margin.left"),
        right: r.length("page.margin.right"),
      },
    },
    font: {
      family: r.text("font.family") as Template["font"]["family"],
      size: r.length("font.size"),
      lineHeight: r.length("font.line_height"),
    },
    elements,
    dualDialogue: dual
      ? {
          indent: r.optionalLength("elements.dual_dialogue.indent") ?? 0,
          width: r.optionalLength("elements.dual_dialogue.width"),
          gap: r.length("elements.dual_dialogue.gap"),
          spaceBefore: r.optional("elements.dual_dialogue.space_before", 0),
          character: columnStyle(r, "elements.dual_dialogue.character"),
          parenthetical: columnStyle(r, "elements.dual_dialogue.parenthetical"),
          dialogue: columnStyle(r, "elements.dual_dialogue.dialogue"),
          lyrics: columnStyle(r, "elements.dual_dialogue.lyrics"),
        }
      : null,
    pagination: {
      dialogue: {
        split: r.flag("pagination.dialogue.split"),
        more: r.text("pagination.dialogue.more"),
        continued: r.text("pagination.dialogue.continued"),
        minLinesEachSide: r.count("pagination.dialogue.min_lines_each_side"),
      },
      characterContinued: {
        enabled: r.flag("pagination.character_continued.enabled"),
        text: r.text("pagination.character_continued.text"),
      },
      sceneContinued: {
        enabled: r.flag("pagination.scene_continued.enabled"),
        top: r.text("pagination.scene_continued.top"),
        bottom: r.text("pagination.scene_continued.bottom"),
      },
      sceneHeading: {
        keepWithNext: r.count("pagination.scene_heading.keep_with_next"),
      },
      sceneNumbers,
    },
    sceneNumber:
      sceneNumbers === "none"
        ? { left: 0, right: 0 }
        : {
            left: r.length("scene_number.left"),
            right: r.length("scene_number.right"),
          },
    header: running(r, "header"),
    footer: running(r, "footer"),
    titlePage: hasTitlePage
      ? {
          center: titleArea(r, "title_page.center"),
          bottomLeft: titleArea(r, "title_page.bottom_left"),
          bottomRight: titleArea(r, "title_page.bottom_right"),
          title: {
            case: r.optional<Case>("title_page.title.case", "as-written"),
            style: r.optional<TextStyle[]>("title_page.title.style", []),
          },
        }
      : null,
  };

  if (r.missing.length > 0) {
    throw new TemplateError(
      `Template "${id}" is incomplete after inheritance. Missing:\n${r.missing.map((p) => `  ${p}`).join("\n")}`,
    );
  }
  return template;
}
