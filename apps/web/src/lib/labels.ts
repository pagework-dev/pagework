import { t, type MessageKey } from "../i18n/index.ts";
import type { LineKind } from "../editor/lines.ts";

export function kindLabel(kind: LineKind): string {
  return t(`element.${kind}` satisfies MessageKey);
}
