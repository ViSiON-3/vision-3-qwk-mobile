/**
 * Per-board credential storage in the OS keychain (expo-secure-store). Board
 * passwords are kept here, NOT in the AsyncStorage snapshot (which is plaintext
 * and lands in device backups). Degrades to a safe no-op / '' when the native
 * module is unavailable (tests / a build without it).
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

// SecureStore keys allow [A-Za-z0-9._-]; board ids are base36+prefix, sanitize anyway.
const passKey = (boardId: string) => `v3qwk_pass_${boardId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

/** Store (or clear, when blank) a board's password in the keychain. */
export async function setBoardPassword(boardId: string, pass: string): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    if (pass) await s.setItemAsync(passKey(boardId), pass);
    else await s.deleteItemAsync(passKey(boardId));
  } catch (e) {
    console.warn('secrets: failed to store board password', e);
  }
}

/** Read a board's password from the keychain ('' if absent/unavailable). */
export async function getBoardPassword(boardId: string): Promise<string> {
  const s = store();
  if (!s) return '';
  try {
    return (await s.getItemAsync(passKey(boardId))) ?? '';
  } catch {
    return '';
  }
}

/** Remove a board's stored password (best-effort). */
export async function deleteBoardPassword(boardId: string): Promise<void> {
  const s = store();
  if (!s) return;
  try {
    await s.deleteItemAsync(passKey(boardId));
  } catch {
    /* ignore */
  }
}
