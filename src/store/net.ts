/**
 * Network orchestration: bind a Board's host/port/pairing to the QWK API
 * client + session, and translate API errors into user-facing messages.
 *
 * Kept free of React/filesystem deps so it's unit-testable with an injected
 * fetch and signer; the store layers packet caching + parsing on top.
 */
import {
  createQwkClient,
  createPinnedFetch,
  createPinnedDownloadToFile,
  createNativeDeviceSigner,
  deviceKeyAlias,
  PinningUnavailableError,
  DeviceKeyUnavailableError,
  DeviceKeyMissingError,
  QwkClient,
  QwkSession,
  QwkApiError,
  QwkAuthError,
  QwkDeviceUnpairedError,
  QwkRateLimitError,
  DeviceSigner,
  FetchLike,
  UploadResult,
} from '../api';
import { Board, Draft } from './types';
import { buildRepFromDrafts } from './repBuilder';

/** `makeSession` on a board that has not paired yet. */
export class BoardNotPairedError extends Error {
  constructor() {
    super('This phone is not paired with the board yet — enter your password to pair.');
    this.name = 'BoardNotPairedError';
  }
}

/**
 * Build an API client for a board. A test/override fetch wins; otherwise a
 * board with a pinned fingerprint uses the native pinned transport, and one
 * without falls back to the platform fetch (fine for a real CA-signed cert).
 */
export function makeClient(board: Board, fetchImpl?: FetchLike): QwkClient {
  const fetch = fetchImpl ?? (board.fingerprint ? createPinnedFetch(board.fingerprint) : undefined);
  // A pinned board also gets the native streaming transport, so large packets
  // download straight to disk (no in-memory base64 blob) with real progress.
  const downloadToFile = board.fingerprint ? createPinnedDownloadToFile(board.fingerprint) : undefined;
  return createQwkClient({ host: board.host, port: board.port, fetch, downloadToFile });
}

/** The signer for a board's device key (one hardware key per board). */
export function boardSigner(board: Board): DeviceSigner {
  return createNativeDeviceSigner(deviceKeyAlias(board.id));
}

/** Build a device-login session for a paired board. */
export function makeSession(board: Board, fetchImpl?: FetchLike, signer?: DeviceSigner): QwkSession {
  if (!board.pairing) throw new BoardNotPairedError();
  return new QwkSession(makeClient(board, fetchImpl), {
    deviceId: board.pairing.deviceId,
    boardId: board.pairing.boardId,
    signer: signer ?? boardSigner(board),
  });
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

/** True for errors that mean "this phone must pair again" (the store drops the
 * board's pairing so Connect asks for the password). */
export function needsRepair(e: unknown): boolean {
  return e instanceof QwkDeviceUnpairedError || e instanceof DeviceKeyMissingError;
}

const inSeconds = (s?: number) => (s ? `try again in ${s}s.` : 'try again shortly.');

/** Map a thrown API/network error to a short, user-facing message. */
export function describeSyncError(e: unknown): string {
  if (e instanceof QwkDeviceUnpairedError) return 'This phone is no longer paired — enter your password to pair again.';
  if (e instanceof QwkAuthError) {
    // The pairing login names the problem; a bare 401 on an authed call means
    // the re-login also failed.
    return e.message && e.message !== 'Unauthorized' ? e.message : 'Not authorized — dial in again.';
  }
  if (e instanceof QwkRateLimitError) {
    if (e.code === 'locked_out') return `Locked out after failed logins — ${inSeconds(e.retryAfter)}`;
    return `Rate limited — ${inSeconds(e.retryAfter)}`;
  }
  if (e instanceof QwkApiError) {
    switch (e.code) {
      case 'bad_packet':
        return 'Server rejected the packet (bad_packet).';
      case 'too_large':
        return 'Reply packet is too large to upload.';
      case 'logon_level':
        return 'This account may not log in (access level) — contact the sysop.';
      case 'intro_pending':
        return 'Log in by terminal once to send your new-user introduction, then try again.';
      case 'device_required':
        return 'Session has no device access — dial in again.';
      case 'password_login_required':
        return 'Pairing needs a password login — enter your password.';
      case 'too_many_devices':
        return 'This account already has the maximum number of paired devices — unpair one first.';
      case 'key_exists':
        return 'This key is already paired — try again to generate a new one.';
      case 'bad_key':
        return 'The server rejected this phone’s key.';
      case 'challenge_invalid':
        return 'Login challenge expired — try again.';
      default:
        return e.message || `Server error (${e.status}).`;
    }
  }
  if (e instanceof PinningUnavailableError || e instanceof DeviceKeyUnavailableError) return e.message;
  if (e instanceof DeviceKeyMissingError || e instanceof BoardNotPairedError) return e.message;
  if (e instanceof Error) return e.message || 'Network error.';
  return 'Network error.';
}
