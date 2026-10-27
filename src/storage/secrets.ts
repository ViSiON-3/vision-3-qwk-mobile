/**
 * Keychain (expo-secure-store) housekeeping. Earlier builds kept each board's
 * password here; with device pairing (issue #24) the app never holds a
 * password, so the only job left is to purge those legacy entries on startup.
 * Degrades to a safe no-op when the native module is unavailable (tests / a
 * build without it).
 */
let mod: typeof import('expo-secure-store') | null | undefined;

function store(): typeof import('expo-secure-store') | null {
  if (mod === undefined) {
    try {
      // Lazy require so tests/Node don't pull native code at import time.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('expo-secure-store');
    } catch {
      mod = null;
    }
  }
  return mod ?? null;
}

// The key format the pre-pairing builds used; kept only so it can be deleted.
const legacyPassKey = (boardId: string) => `v3qwk_pass_${boardId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

/** Remove a board's password left by a pre-pairing build (best-effort). */
export async function purgeLegacyBoardPassword(boardId: string): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    await s.deleteItemAsync(legacyPassKey(boardId));
  } catch {
    /* ignore */
  }
}
