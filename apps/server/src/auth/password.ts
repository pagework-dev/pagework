import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * argon2id password hashing (ARCHITECTURE.md, Authentication) with Node's
 * built-in implementation. Parameters follow the OWASP recommendation
 * (19 MiB, 2 passes, 1 lane). Hashes are stored in the standard PHC
 * format, so the parameters can be raised later and old hashes still verify.
 */

export interface Argon2Params {
  memory: number;
  passes: number;
  parallelism: number;
}

export const DEFAULT_PARAMS: Argon2Params = {
  memory: 19456,
  passes: 2,
  parallelism: 1,
};

const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

/** Shortest and longest passwords accepted. The cap stops hashing huge inputs. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 256;

function derive(
  password: string,
  salt: Buffer,
  params: Argon2Params,
  tagLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: password,
        nonce: salt,
        tagLength,
        memory: params.memory,
        passes: params.passes,
        parallelism: params.parallelism,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

const b64 = (bytes: Buffer): string =>
  bytes.toString("base64").replace(/=+$/, "");

export async function hashPassword(
  password: string,
  params: Argon2Params = DEFAULT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const tag = await derive(password, salt, params, TAG_LENGTH);
  const settings = `m=${String(params.memory)},t=${String(params.passes)},p=${String(params.parallelism)}`;
  return `$argon2id$v=19$${settings}$${b64(salt)}$${b64(tag)}`;
}

const PHC =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const match = PHC.exec(stored);
  if (match === null) return false;
  const [, m, t, p, salt, tag] = match;
  const expected = Buffer.from(tag ?? "", "base64");
  const actual = await derive(
    password,
    Buffer.from(salt ?? "", "base64"),
    { memory: Number(m), passes: Number(t), parallelism: Number(p) },
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}

/** True when a hash was made with weaker settings than today's. */
export function needsRehash(stored: string): boolean {
  const match = PHC.exec(stored);
  if (match === null) return true;
  return (
    Number(match[1]) < DEFAULT_PARAMS.memory ||
    Number(match[2]) < DEFAULT_PARAMS.passes
  );
}

let dummy: Promise<string> | null = null;

/**
 * Spends the same time as checking a real password, so a sign-in for an
 * address with no account can't be told apart by how long it takes.
 */
export async function verifyNothing(password: string): Promise<false> {
  dummy ??= hashPassword("pagework-timing-equaliser");
  await verifyPassword(password, await dummy);
  return false;
}

export type PasswordProblem = "password_too_short" | "password_too_long";

export function passwordProblem(password: string): PasswordProblem | null {
  if (Array.from(password).length < PASSWORD_MIN) return "password_too_short";
  if (password.length > PASSWORD_MAX) return "password_too_long";
  return null;
}
