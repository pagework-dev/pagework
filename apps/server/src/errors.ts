import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * API errors carry a stable code, never a sentence: the web app turns the
 * code into words from its translation file (CLAUDE.md). Nothing about the
 * server's internals is ever sent.
 */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    detail: Record<string, unknown> = {},
  ) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export const notFound = (): ApiError => new ApiError(404, "not_found");
export const badRequest = (
  code = "bad_request",
  detail: Record<string, unknown> = {},
): ApiError => new ApiError(400, code, detail);
