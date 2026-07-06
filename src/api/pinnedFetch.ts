/**
 * A `FetchLike` that pins the server's TLS certificate fingerprint, backed by
 * the native QwkTls module. Slots directly into `createQwkClient({ fetch })`,
 * so the rest of the client is unchanged. Throws PinningUnavailableError when
 * there's no native module (Expo Go) — the app surfaces that as a clear
 * "needs a dev build" message.
 */
import { FetchLike, FetchResponseLike } from './types';
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
      headers: {
        get: (name) => {
          const lower = name.toLowerCase();
          for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k];
          return null;
        },
      },
      arrayBuffer: async () => decode().slice().buffer,
      text: async () => utf8Decode(decode()),
      json: async () => JSON.parse(utf8Decode(decode())),
    };
  };
}
