import type { MessageKey } from "../i18n/index.ts";

/** An entry in a menu. `checked` makes it a checkbox, or with `radio` a radio item. */
export interface MenuItem {
  label: MessageKey;
  keys: string | null;
  run: () => unknown;
  disabled?: boolean;
  checked?: boolean;
  radio?: boolean;
}
