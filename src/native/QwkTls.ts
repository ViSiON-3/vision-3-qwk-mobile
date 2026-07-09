/**
 * Binding to the native `QwkTls` module (Expo Modules API). Performs HTTPS
 * requests that pin the server cert's SHA-256 fingerprint — the piece RN's
 * built-in `fetch` can't do. Present only in a dev/production build; absent in
 * Expo Go (and in tests / Node), where `getNativeQwkTls()` returns null.
 */

export interface NativeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** UTF-8 text body (JSON login). Mutually exclusive with bodyBase64. */
  bodyUtf8?: string;
  /** Binary body (REP zip), base64. Mutually exclusive with bodyUtf8. */
  bodyBase64?: string;
  /** Expected server cert fingerprint: 64 upper-hex chars, no separators. */
  pinnedSha256: string;
}

export interface NativeResponse {
  status: number;
  headers: Record<string, string>;
  /** Response body, base64 (may be empty for 204). */
  bodyBase64: string;
}

export interface NativeDownloadOptions {
  url: string;
  method?: string;
  headers: Record<string, string>;
  pinnedSha256: string;
}

export interface NativeDownloadResult {
  status: number;
  headers: Record<string, string>;
  /** Present on 200: bytes written to destPath (body is on disk, not returned). */
  bytesWritten?: number;
  /** Present for non-200 (204/errors): the small body, base64. */
  bodyBase64?: string;
}

export interface NativeEventSubscription {
  remove(): void;
}

export interface NativeQwkTls {
  request(options: NativeRequest): Promise<NativeResponse>;
  /** Trust-on-first-use: return the server's leaf cert SHA-256 (64 upper-hex). */
  getFingerprint(host: string, port: number): Promise<string>;
  /** Stream a pinned GET to destPath; body never enters memory. `requestId`
   * correlates the onDownloadProgress events. */
  downloadToFile(
    options: NativeDownloadOptions,
    destPath: string,
    requestId: string
  ): Promise<NativeDownloadResult>;
  addListener(
    event: 'onDownloadProgress',
    listener: (payload: { id: string; written: number; total: number }) => void
  ): NativeEventSubscription;
}

let cached: NativeQwkTls | null | undefined;

/** The native module, or null when unavailable (Expo Go / tests). */
export function getNativeQwkTls(): NativeQwkTls | null {
  if (cached !== undefined) return cached;
  try {
    // Lazy require so importing this file never pulls native code into Node/tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo-modules-core');
    cached = requireNativeModule('QwkTls') as NativeQwkTls;
  } catch {
    cached = null;
  }
  return cached;
}
