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

/** 401 — token missing/expired/invalidated (e.g. BBS restart), or a bad
 * handle/password on the pairing login. Logging in again may help. */
export class QwkAuthError extends QwkApiError {
  constructor(message = 'Unauthorized', status = 401) {
    super('unauthorized', message, status);
    this.name = 'QwkAuthError';
  }
}

/** 401 `unauthorized` from `login/device` — this phone is no longer paired
 * (unpaired elsewhere, or the account password changed). A device login will
 * keep failing; the user must enter the password and pair again. */
export class QwkDeviceUnpairedError extends QwkApiError {
  constructor(message = 'This device is no longer paired') {
    super('device_unpaired', message, 401);
    this.name = 'QwkDeviceUnpairedError';
  }
}

/** 429 — rate limited (`rate_limited`) or locked out after failed logins
 * (`locked_out`); `retryAfter` is the server's back-off in seconds. */
export class QwkRateLimitError extends QwkApiError {
  constructor(message: string, retryAfter?: number, code = 'rate_limited') {
    super(code, message, 429, retryAfter);
    this.name = 'QwkRateLimitError';
  }
}
