import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** A random token for a cookie or a single-use link: 256 bits, URL-safe. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What the database stores in place of a token: an HMAC keyed with
 * PAGEWORK_SECRET. Someone with a copy of the database still can't use
 * the sessions or links in it.
 */
export function tokenHash(secret: string, token: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A code a person can type: 12 characters in groups of four (60 bits). */
export function newCode(): string {
  const chars = [...randomBytes(12)]
    .map((b) => CODE_ALPHABET[b % 32] ?? "A")
    .join("");
  return chars.match(/.{4}/g)?.join("-") ?? chars;
}

/** Accepts a code typed in any case, with or without its dashes. */
export function normaliseCode(code: string): string {
  const plain = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return plain.match(/.{1,4}/g)?.join("-") ?? "";
}
