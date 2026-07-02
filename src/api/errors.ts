/** Errors raised by the QWK Packet API client. */

/** A structured API error mapped from a `{error, message}` JSON body / HTTP status. */
export class QwkApiError extends Error {
  /** Machine code from the JSON body (`error`) or a synthetic one. */
  readonly code: string;
  readonly status: number;
  /** Seconds from a 429 `Retry-After` header, when present. */
  readonly retryAfter?: number;

  constructor(code: string, message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = 'QwkApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** 401 — token missing/expired/invalidated (e.g. BBS restart). Re-login and retry. */
export class QwkAuthError extends QwkApiError {
  constructor(message = 'Unauthorized', status = 401) {
    super('unauthorized', message, status);
    this.name = 'QwkAuthError';
  }
}

/** 429 — rate limited; `retryAfter` is the server's back-off in seconds. */
export class QwkRateLimitError extends QwkApiError {
  constructor(message: string, retryAfter?: number) {
    super('rate_limited', message, 429, retryAfter);
    this.name = 'QwkRateLimitError';
  }
}
