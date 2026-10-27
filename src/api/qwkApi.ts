/**
 * QWK Packet API client — the Phase 7 contract (see PHASE8-KICKOFF.md) plus
 * device pairing (issue #24 / vision-3-bbs#720).
 *
 * HTTPS, off by default on the BBS. Every request sends `X-V3-Client`; every
 * request except `login`, `challenge` and `login/device` sends
 * `Authorization: Bearer <token>`. Errors are JSON `{error, message}`; 429
 * carries `Retry-After`.
 *
 * Auth model: a password login yields a short-lived *pair* token that can only
 * register/list/unpair devices. Packets need a *device* token, obtained by
 * signing a one-time challenge with the paired device's private key.
 *
 * TLS fingerprint pinning is a separate (native) concern layered under `fetch`;
 * this module is transport-agnostic and unit-testable with an injected fetch.
 */
import { QwkApiError, QwkAuthError, QwkDeviceUnpairedError, QwkRateLimitError } from './errors';
import {
  ChallengeResult,
  DownloadProgress,
  DownloadResult,
  DownloadToFileResult,
  FetchLike,
  FetchResponseLike,
  LoginResult,
  PairResult,
  PairedDevice,
  QwkClientConfig,
  StreamResponseLike,
  UploadResult,
} from './types';

const DEFAULT_CLIENT_ID = 'vision3-mobile';
const DEFAULT_PORT = 8666;
const CLIENT_HEADER = 'X-V3-Client';
export const MAX_REP_BYTES = 16 * 1024 * 1024; // 16 MiB

function num(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function toApiError(res: StreamResponseLike): Promise<QwkApiError> {
  let code = `http_${res.status}`;
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body?.error) code = body.error;
    if (body?.message) message = body.message;
    else if (body?.error) message = body.error;
  } catch {
    try {
      const t = (await res.text()).trim();
      if (t) message = t;
    } catch {
      // keep defaults
    }
  }
  if (res.status === 429) {
    // Keep the server's code: `locked_out` (failed-login lockout) reads
    // differently to the user than a plain `rate_limited`.
    return new QwkRateLimitError(message, num(res.headers.get('Retry-After')), code);
  }
  return new QwkApiError(code, message, res.status);
}

export interface QwkClient {
  readonly baseUrl: string;
  /** True when a streaming transport is configured (downloadPacketToFile works). */
  readonly canDownloadToFile: boolean;
  /** Password login. On a pairing-capable server the token has `scope: 'pair'`
   * and is only good for the devices endpoints. */
  login(handle: string, password: string): Promise<LoginResult>;
  /** Register this device's public key (base64 DER SubjectPublicKeyInfo) under a
   * pair token. The returned ids are what a device login signs over. */
  pairDevice(pairToken: string, name: string, publicKey: string): Promise<PairResult>;
  /** The account's paired devices (either token scope). */
  listDevices(token: string): Promise<PairedDevice[]>;
  /** Unpair a device (either token scope). Resolves on 204; a 404 means it was
   * not paired (QwkApiError with the server code). */
  deleteDevice(token: string, deviceId: string): Promise<void>;
  /** Ask for a one-time login challenge for a device id (no token). */
  challenge(deviceId: string): Promise<ChallengeResult>;
  /** Exchange a signed challenge for a `scope: 'device'` token. Throws
   * QwkApiError `challenge_invalid` (get a new challenge) or
   * QwkDeviceUnpairedError (401 `unauthorized`: bad signature / not paired). */
  loginDevice(deviceId: string, challenge: string, signature: string): Promise<LoginResult>;
  /** Invalidate the token server-side. */
  logout(token: string): Promise<void>;
  downloadPacket(token: string): Promise<DownloadResult>;
  /** Stream the packet straight to `destPath` (no in-memory body). */
  downloadPacketToFile(
    token: string,
    destPath: string,
    onProgress?: DownloadProgress
  ): Promise<DownloadToFileResult>;
  uploadReply(token: string, rep: Uint8Array): Promise<UploadResult>;
}

export function createQwkClient(config: QwkClientConfig): QwkClient {
  const port = config.port ?? DEFAULT_PORT;
  const clientId = config.clientId || DEFAULT_CLIENT_ID;
  const baseUrl = `https://${config.host}:${port}/api/qwk/`;
  const doFetch: FetchLike =
    config.fetch ?? ((url, init) => fetch(url, init as unknown as RequestInit) as unknown as Promise<FetchResponseLike>);

  const baseHeaders = (token?: string): Record<string, string> => {
    const h: Record<string, string> = { [CLIENT_HEADER]: clientId };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  return {
    baseUrl,
    canDownloadToFile: !!config.downloadToFile,

    async login(handle, password) {
      const res = await doFetch(`${baseUrl}login`, {
        method: 'POST',
        headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password }),
      });
      if (res.status === 200) return (await res.json()) as LoginResult;
      if (res.status === 401) throw new QwkAuthError('Invalid handle or password');
      throw await toApiError(res);
    },

    async pairDevice(pairToken, name, publicKey) {
      const res = await doFetch(`${baseUrl}devices`, {
        method: 'POST',
        headers: { ...baseHeaders(pairToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, publicKey }),
      });
      if (res.status === 201 || res.status === 200) {
        const body = (await res.json()) as Partial<PairResult>;
        if (!body.deviceId || !body.boardId) {
          throw new QwkApiError('bad_response', 'pairing response lacks deviceId/boardId', res.status);
        }
        return { deviceId: body.deviceId, boardId: body.boardId };
      }
      if (res.status === 401) throw new QwkAuthError('Pairing login expired — enter the password again');
      throw await toApiError(res); // 400 bad_key, 403 password_login_required, 409 key_exists/too_many_devices
    },

    async listDevices(token) {
      const res = await doFetch(`${baseUrl}devices`, { method: 'GET', headers: baseHeaders(token) });
      if (res.status === 200) {
        const body = (await res.json()) as unknown;
        return Array.isArray(body) ? (body as PairedDevice[]) : [];
      }
      if (res.status === 401) throw new QwkAuthError();
      throw await toApiError(res);
    },

    async deleteDevice(token, deviceId) {
      const res = await doFetch(`${baseUrl}devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
        headers: baseHeaders(token),
      });
      if (res.status === 204 || res.status === 200) return;
      if (res.status === 401) throw new QwkAuthError();
      throw await toApiError(res); // 404 when not paired
    },

    async challenge(deviceId) {
      const res = await doFetch(`${baseUrl}challenge`, {
        method: 'POST',
        headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as Partial<ChallengeResult>;
        if (!body.challenge) throw new QwkApiError('bad_response', 'challenge response lacks challenge', 200);
        return { challenge: body.challenge, expiresAt: body.expiresAt ?? '' };
      }
      throw await toApiError(res); // 429 rate limited, 503 store full
    },

    async loginDevice(deviceId, challenge, signature) {
      const res = await doFetch(`${baseUrl}login/device`, {
        method: 'POST',
        headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, challenge, signature }),
      });
      if (res.status === 200) return (await res.json()) as LoginResult;
      if (res.status === 401) {
        const err = await toApiError(res);
        // `challenge_invalid` (expired/reused/mismatched) is retryable with a
        // fresh challenge; anything else on 401 means the key is not accepted.
        if (err.code === 'challenge_invalid') throw err;
        throw new QwkDeviceUnpairedError();
      }
      throw await toApiError(res); // 429 locked_out, 403 logon_level / intro_pending
    },

    async logout(token) {
      const res = await doFetch(`${baseUrl}logout`, { method: 'POST', headers: baseHeaders(token) });
      if (res.status >= 200 && res.status < 300) return;
      throw await toApiError(res);
    },

    async downloadPacket(token) {
      const res = await doFetch(`${baseUrl}packet`, { method: 'GET', headers: baseHeaders(token) });
      if (res.status === 204) return { kind: 'none' };
      if (res.status === 200) {
        // Bytes are only "committed" once fully received (server advances the
        // newscan pointer on produce) — read the whole body before returning.
        const buf = await res.arrayBuffer();
        return {
          kind: 'packet',
          bytes: new Uint8Array(buf),
          messageCount: num(res.headers.get('X-QWK-Messages')) ?? 0,
        };
      }
      if (res.status === 401) throw new QwkAuthError();
      if (res.status === 429) throw await toApiError(res);
      throw await toApiError(res);
    },

    async downloadPacketToFile(token, destPath, onProgress) {
      if (!config.downloadToFile) throw new QwkApiError('no_stream', 'streaming download not configured', 0);
      // The server advances the newscan pointer on produce, so a 200 here is a
      // commitment — the bytes are fully written to destPath before we return.
      const res = await config.downloadToFile(
        `${baseUrl}packet`,
        { method: 'GET', headers: baseHeaders(token) },
        destPath,
        onProgress
      );
      if (res.status === 204) return { kind: 'none' };
      if (res.status === 200) {
        return { kind: 'packet', messageCount: num(res.headers.get('X-QWK-Messages')) ?? 0 };
      }
      if (res.status === 401) throw new QwkAuthError();
      throw await toApiError(res);
    },

    async uploadReply(token, rep) {
      if (rep.length > MAX_REP_BYTES) {
        throw new QwkApiError('too_large', `REP exceeds ${MAX_REP_BYTES} bytes`, 413);
      }
      const res = await doFetch(`${baseUrl}reply`, {
        method: 'POST',
        headers: { ...baseHeaders(token), 'Content-Type': 'application/zip' },
        body: rep,
      });
      if (res.status === 200) {
        const body = (await res.json()) as Partial<UploadResult>;
        return {
          posted: body.posted ?? 0,
          skipped: body.skipped ?? 0,
          duplicate: body.duplicate ?? 0,
          wrongBBS: body.wrongBBS ?? false,
        };
      }
      if (res.status === 401) throw new QwkAuthError();
      throw await toApiError(res); // 400 bad_packet, 429, etc.
    },
  };
}
