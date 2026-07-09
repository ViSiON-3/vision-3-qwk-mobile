/**
 * On-device packet byte cache. Stores raw .QWK/.REP zip bytes as files under the
 * app document directory; packet metadata lives in the persisted store. Uses the
 * expo-file-system File/Directory API (synchronous write, async read).
 */
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

const DIR_NAME = 'packets';

// Web fallback: expo-file-system has no web support, so `expo start --web`
// (used for browser-driven manual passes) keeps packet bytes in memory for the
// session instead. Nothing survives a reload — acceptable for a dev/debug
// target, never used on device. packetFilePath() stays native-only: it is only
// reached via the pinned transport's streaming path (canStreamToFile).
const WEB = Platform.OS === 'web';
const webCache = new Map<string, Uint8Array>();

function packetsDir(): Directory {
  return new Directory(Paths.document, DIR_NAME);
}

function ensureDir(): Directory {
  const dir = packetsDir();
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function packetFile(id: string): File {
  return new File(ensureDir(), `${id}.qwk`);
}

/** Persist packet bytes under a packet id. */
export function writePacketBytes(id: string, bytes: Uint8Array): void {
  if (WEB) {
    webCache.set(id, bytes);
    return;
  }
  const file = packetFile(id);
  if (!file.exists) file.create();
  file.write(bytes);
}

/** Absolute filesystem path of a packet's cache file, for a native streamed
 * write (no `file://` scheme — native uses `URL(fileURLWithPath:)`). The
 * directory is ensured to exist. */
export function packetFilePath(id: string): string {
  return packetFile(id).uri.replace(/^file:\/\//, '');
}

/** Read packet bytes, or null if the file is missing/unreadable (a corrupt or
 * permission-denied file shouldn't crash a reparse — treat it as absent). */
export async function readPacketBytes(id: string): Promise<Uint8Array | null> {
  if (WEB) return webCache.get(id) ?? null;
  try {
    const file = packetFile(id);
    if (!file.exists) return null;
    return await file.bytes();
  } catch (e) {
    console.warn(`packetCache: failed to read ${id}`, e);
    return null;
  }
}

/** Delete one packet's bytes (best-effort; no-op if absent/undeletable). */
export function deletePacketBytes(id: string): void {
  if (WEB) {
    webCache.delete(id);
    return;
  }
  try {
    const file = packetFile(id);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn(`packetCache: failed to delete ${id}`, e);
  }
}

/** Remove the entire packet cache directory (best-effort). */
export function clearAllPacketBytes(): void {
  if (WEB) {
    webCache.clear();
    return;
  }
  try {
    const dir = packetsDir();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('packetCache: failed to clear cache', e);
  }
}

/** Total bytes used by the packet cache (0 if the size can't be read). */
export function packetCacheSize(): number {
  if (WEB) return [...webCache.values()].reduce((n, b) => n + b.length, 0);
  try {
    const dir = packetsDir();
    return dir.exists ? dir.size ?? 0 : 0;
  } catch {
    return 0;
  }
}
