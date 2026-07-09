/** Public types for the QWK Packet API client (Phase 7 contract). */

export interface LoginResult {
  token: string;
  /** ISO timestamp when the token expires (default TTL 24h). */
  expiresAt: string;
}

/** Result of a packet download: either new bytes or "nothing new" (204). */
export type DownloadResult =
  | { kind: 'packet'; bytes: Uint8Array; messageCount: number }
  | { kind: 'none' };

/** Result of a streamed download: the bytes are already on disk (no in-memory
 * body), so only the metadata comes back. */
export type DownloadToFileResult = { kind: 'packet'; messageCount: number } | { kind: 'none' };

/** Progress callback for a streamed download (bytes so far, total or 0 if unknown). */
export type DownloadProgress = (written: number, total: number) => void;

/** Result of a REP upload (a normal 200; `wrongBBS` is not an error). */
export interface UploadResult {
  posted: number;
  skipped: number;
  duplicate: number;
  wrongBBS: boolean;
}

/** Minimal fetch surface so the client is injectable/testable. */
export interface FetchResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export interface FetchInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}
export type FetchLike = (url: string, init?: FetchInitLike) => Promise<FetchResponseLike>;

/** Response of a streamed download. On 200 the body is on disk (no json/text);
 * for 204/errors the small body is available so the client maps it like a fetch. */
export interface StreamResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}
/** Streams a GET's body straight to `destPath` (no in-memory body), reporting
 * byte progress. Injectable/testable like FetchLike. */
export type DownloadToFileLike = (
  url: string,
  init: FetchInitLike,
  destPath: string,
  onProgress?: (written: number, total: number) => void
) => Promise<StreamResponseLike>;

export interface QwkClientConfig {
  host: string;
  port?: number;
  /** Sent as X-V3-Client on every request (any non-empty value works). */
  clientId?: string;
  /** Injectable fetch (defaults to global fetch). */
  fetch?: FetchLike;
  /** Streaming download transport; when present, downloadPacketToFile works. */
  downloadToFile?: DownloadToFileLike;
}
