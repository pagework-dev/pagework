import type { Context } from "hono";
import { badRequest } from "./errors.ts";

/**
 * Request bodies, checked by hand: the API is small and a schema library
 * would be a dependency for a few dozen fields. Every field is read by
 * name, with a type and a length limit, and anything else is ignored.
 */

export type Body = Record<string, unknown>;

export async function jsonBody(c: Context): Promise<Body> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw badRequest("invalid_json");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw badRequest("invalid_json");
  return value as Body;
}

export function text(
  body: Body,
  field: string,
  options: { max: number; min?: number; optional?: false },
): string;
export function text(
  body: Body,
  field: string,
  options: { max: number; min?: number; optional: true },
): string | null;
export function text(
  body: Body,
  field: string,
  options: { max: number; min?: number; optional?: boolean },
): string | null {
  const value = body[field];
  if (value === undefined || value === null) {
    if (options.optional === true) return null;
    throw badRequest("missing_field", { field });
  }
  if (typeof value !== "string") throw badRequest("invalid_field", { field });
  if (value.length > options.max) throw badRequest("field_too_long", { field });
  if (value.length < (options.min ?? 0))
    throw badRequest("missing_field", { field });
  return value;
}

/** A trimmed, single-line name or title. */
export function name(body: Body, field: string, max = 200): string {
  const value = text(body, field, { max: max * 2 })
    .replace(/\s+/g, " ")
    .trim();
  if (value === "") throw badRequest("missing_field", { field });
  if (Array.from(value).length > max)
    throw badRequest("field_too_long", { field });
  return value;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An email address, trimmed and in lower case. */
export function email(body: Body, field = "email"): string {
  const value = text(body, field, { max: 254 }).trim().toLowerCase();
  if (!EMAIL.test(value)) throw badRequest("invalid_email", { field });
  return value;
}

export function oneOf<T extends string>(
  body: Body,
  field: string,
  choices: readonly T[],
): T {
  const value = body[field];
  const found = choices.find((c) => c === value);
  if (found === undefined) throw badRequest("invalid_field", { field });
  return found;
}

export function bool(body: Body, field: string): boolean {
  const value = body[field];
  if (typeof value !== "boolean") throw badRequest("invalid_field", { field });
  return value;
}

/** A UUID route parameter; anything else can't name a row. */
export function id(value: string | undefined): string {
  if (
    value === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw badRequest("invalid_id");
  return value;
}
