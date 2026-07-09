/**
 * A `FetchLike` that pins the server's TLS certificate fingerprint, backed by
 * the native QwkTls module. Slots directly into `createQwkClient({ fetch })`,
 * so the rest of the client is unchanged. Throws PinningUnavailableError when
 * there's no native module (Expo Go) — the app surfaces that as a clear
 * "needs a dev build" message.
 */
import { DownloadToFileLike, FetchLike, FetchResponseLike, StreamResponseLike } from './types';
import { normalizeFingerprint } from './fingerprint';
import { toBase64, fromBase64 } from './base64';
import { getNativeQwkTls } from '../native/QwkTls';

export class PinningUnavailableError extends Error {
  constructor() {
    super('TLS pinning needs a development build — not available in Expo Go.');
    this.name = 'PinningUnavailableError';
  }
}

const utf8Decode = (bytes: Uint8Array): string =>
  typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(bytes) : String.fromCharCode(...bytes);

/** Case-insensitive header lookup over a plain header map (native returns one). */
function headerGetter(headers: Record<string, string>): (name: string) => string | null {
  return (name) => {
    const lower = name.toLowerCase();
    for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k];
    return null;
  };
}

let downloadSeq = 0;

/**
 * Trust-on-first-use: open an unpinned handshake to the server and return its
 * leaf cert's SHA-256 (bare upper-hex), so the sysop can review + pin it instead
 * of pasting the fingerprint by hand. Throws PinningUnavailableError without a
 * dev build. The caller is responsible for showing the value for confirmation —
 * TOFU trusts whatever cert answers first, so a human must verify it.
 */
export async function probeServerFingerprint(host: string, port: number): Promise<string> {
  const native = getNativeQwkTls();
  if (!native) throw new PinningUnavailableError();
  return normalizeFingerprint(await native.getFingerprint(host, port));
}

/** Build a pinned fetch for a given SHA-256 fingerprint (any separator format). */
export function createPinnedFetch(fingerprint: string): FetchLike {
  const pinnedSha256 = normalizeFingerprint(fingerprint);

  return async (url, init): Promise<FetchResponseLike> => {
    const native = getNativeQwkTls();
    if (!native) throw new PinningUnavailableError();

    const body = init?.body;
    const res = await native.request({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      bodyUtf8: typeof body === 'string' ? body : undefined,
      bodyBase64: body != null && typeof body !== 'string' ? toBase64(body) : undefined,
      pinnedSha256,
    });

    const headers = res.headers ?? {};
    let bytes: Uint8Array | null = null; // decoded lazily and cached
    const decode = () => (bytes ??= fromBase64(res.bodyBase64 ?? ''));
    return {
      status: res.status,
      headers: { get: headerGetter(headers) },
      arrayBuffer: async () => decode().slice().buffer,
      text: async () => utf8Decode(decode()),
      json: async () => JSON.parse(utf8Decode(decode())),
    };
  };
}

/**
 * A `DownloadToFileLike` that streams a pinned GET straight to `destPath` via the
 * native module — the body never enters JS memory or crosses the bridge as
 * base64. Byte progress arrives on the native onDownloadProgress event,
 * correlated by a per-call id. Throws PinningUnavailableError without a dev build.
 */
export function createPinnedDownloadToFile(fingerprint: string): DownloadToFileLike {
  const pinnedSha256 = normalizeFingerprint(fingerprint);

  return async (url, init, destPath, onProgress): Promise<StreamResponseLike> => {
    const native = getNativeQwkTls();
    if (!native) throw new PinningUnavailableError();

    const requestId = `dl${++downloadSeq}`;
    const sub = onProgress
      ? native.addListener('onDownloadProgress', (p) => {
          if (p.id === requestId) onProgress(p.written, p.total);
        })
      : undefined;
    try {
      const res = await native.downloadToFile(
        { url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, pinnedSha256 },
        destPath,
        requestId
      );
      const headers = res.headers ?? {};
      const body = () => fromBase64(res.bodyBase64 ?? ''); // only present for non-200
      return {
        status: res.status,
        headers: { get: headerGetter(headers) },
        json: async () => JSON.parse(utf8Decode(body())),
        text: async () => utf8Decode(body()),
      };
    } finally {
      sub?.remove();
    }
  };
}
