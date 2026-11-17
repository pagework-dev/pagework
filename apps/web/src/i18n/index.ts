import messages from "./en-AU.json";

/**
 * Interface text (ARCHITECTURE.md, Interface text and spelling). Components
 * never contain user-facing strings; they call `t` with a key from the
 * translation file. English (Australian) is the source language.
 */

export type MessageKey = keyof typeof messages;

const table: Record<string, string> = messages;

/** Replaces `{name}` placeholders. Numbers are formatted for the locale. */
export function t(
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const text = table[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === "number" ? numberFormat.format(value) : value;
  });
}

const numberFormat = new Intl.NumberFormat("en-AU");

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(table, key);
}
