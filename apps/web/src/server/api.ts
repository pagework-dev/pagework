import { t, type MessageKey } from "../i18n/index.ts";

/**
 * Requests to the Pagework server this app came from. Requests that change
 * something carry the session's CSRF token (ARCHITECTURE.md,
 * Authentication); cookies are sent by the browser and never touched here.
 */

export class ApiFailure extends Error {
  readonly status: number;
  /** The server's error code, or "offline" / "unreachable" if it never answered. */
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(status: number, code: string, detail: Record<string, unknown>) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

let csrfToken = "";

export function useCsrfToken(token: string): void {
  csrfToken = token;
}

function failedToConnect(): ApiFailure {
  return new ApiFailure(0, navigator.onLine ? "unreachable" : "offline", {});
}

export async function request(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: { raw?: BodyInit; type?: string; keepalive?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") headers["x-csrf-token"] = csrfToken;
  let payload: BodyInit | undefined;
  if (options.raw !== undefined) {
    payload = options.raw;
    headers["content-type"] = options.type ?? "application/octet-stream";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      ...(payload === undefined ? {} : { body: payload }),
      ...(options.keepalive === true ? { keepalive: true } : {}),
    });
  } catch {
    throw failedToConnect();
  }
  if (res.ok) return res;
  let detail: Record<string, unknown>;
  try {
    detail = (await res.json()) as Record<string, unknown>;
  } catch {
    // A proxy in front of the server answered (502 and the like).
    throw new ApiFailure(res.status, "unreachable", {});
  }
  const code = typeof detail.error === "string" ? detail.error : "internal";
  throw new ApiFailure(res.status, code, detail);
}

export async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await request(method, path, body);
  return (await res.json()) as T;
}

/**
 * Server error codes in words. Listed one by one (not built from the code)
 * so every message is checked to exist and to be used.
 */
const MESSAGES: Record<string, MessageKey> = {
  offline: "error.offline",
  unreachable: "error.unreachable",
  internal: "error.internal",
  invalid_credentials: "error.invalid_credentials",
  account_disabled: "error.account_disabled",
  invalid_setup_code: "error.invalid_setup_code",
  already_set_up: "error.already_set_up",
  invalid_email: "error.invalid_email",
  password_too_short: "error.password_too_short",
  password_too_long: "error.password_too_long",
  wrong_password: "error.wrong_password",
  missing_field: "error.missing_field",
  field_too_long: "error.field_too_long",
  signed_out: "error.signed_out",
  cross_origin: "error.cross_origin",
  csrf_token: "error.csrf_token",
  password_change_required: "error.password_change_required",
};

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiFailure)) return t("error.internal");
  if (error.code === "too_many_attempts") {
    const minutes = Math.max(
      1,
      Math.ceil(Number(error.detail.retryAfter ?? 0) / 60),
    );
    return t(
      minutes === 1
        ? "error.too_many_attempts.one"
        : "error.too_many_attempts.other",
      { minutes },
    );
  }
  return t(MESSAGES[error.code] ?? "error.unknown");
}
