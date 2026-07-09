/**
 * Network orchestration: bind a Board's host/port/credentials to the QWK API
 * client + session, and translate API errors into user-facing messages.
 *
 * Kept free of React/filesystem/native deps so it's unit-testable with an
 * injected fetch; the store layers packet caching + parsing on top.
 */
import {
  createQwkClient,
  createPinnedFetch,
  PinningUnavailableError,
  QwkSession,
  QwkApiError,
  QwkAuthError,
  QwkRateLimitError,
  FetchLike,
  UploadResult,
} from '../api';
import { Board, Draft } from './types';
import { buildRepFromDrafts } from './repBuilder';

/**
 * Build a session for a board. A test/override fetch wins; otherwise a board
 * with a pinned fingerprint uses the native pinned transport, and one without
 * falls back to the platform fetch (fine for a real CA-signed cert).
 */
export function makeSession(board: Board, fetchImpl?: FetchLike): QwkSession {
  const fetch = fetchImpl ?? (board.fingerprint ? createPinnedFetch(board.fingerprint) : undefined);
  const client = createQwkClient({ host: board.host, port: board.port, fetch });
  return new QwkSession(client, { handle: board.handle, password: board.pass });
}

/** Compile the outbox to a .REP and upload it; the server de-dupes retries. */
export function pushDrafts(
  session: QwkSession,
  bbsId: string,
  drafts: Draft[],
  tagline = ''
): Promise<UploadResult> {
  return session.upload(buildRepFromDrafts(bbsId, drafts, tagline));
}

/** Map a thrown API/network error to a short, user-facing message. */
export function describeSyncError(e: unknown): string {
  if (e instanceof QwkAuthError) return 'Login failed — check handle and password.';
  if (e instanceof QwkRateLimitError) {
    return e.retryAfter ? `Rate limited — try again in ${e.retryAfter}s.` : 'Rate limited — try again shortly.';
  }
  if (e instanceof QwkApiError) {
    if (e.code === 'bad_packet') return 'Server rejected the packet (bad_packet).';
    if (e.code === 'too_large') return 'Reply packet is too large to upload.';
    return e.message || `Server error (${e.status}).`;
  }
  if (e instanceof PinningUnavailableError) return e.message;
  if (e instanceof Error) return e.message || 'Network error.';
  return 'Network error.';
}
