/**
 * QWK Packet API client — the Phase 7 contract (see PHASE8-KICKOFF.md).
 *
 * HTTPS, off by default on the BBS. Every request sends `X-V3-Client`; every
 * request except login sends `Authorization: Bearer <token>`. Errors are JSON
 * `{error, message}`; 429 carries `Retry-After`.
 *
 * TLS fingerprint pinning is a separate (native) concern layered under `fetch`;
 * this module is transport-agnostic and unit-testable with an injected fetch.
 */
import { QwkApiError, QwkAuthError, QwkRateLimitError } from './errors';
import {
  DownloadProgress,
  DownloadResult,
  DownloadToFileResult,
  FetchLike,
  FetchResponseLike,
  LoginResult,
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
  if (res.status === 429) return new QwkRateLimitError(message, num(res.headers.get('Retry-After')));
  return new QwkApiError(code, message, res.status);
}

export interface QwkClient {
  readonly baseUrl: string;
  /** True when a streaming transport is configured (downloadPacketToFile works). */
  readonly canDownloadToFile: boolean;
  login(handle: string, password: string): Promise<LoginResult>;
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
