/**
 * On-device packet byte cache. Stores raw .QWK/.REP zip bytes as files under the
 * app document directory; packet metadata lives in the persisted store. Uses the
 * expo-file-system File/Directory API (synchronous write, async read).
 */
import { Directory, File, Paths } from 'expo-file-system';

const DIR_NAME = 'packets';

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
  try {
    const file = packetFile(id);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn(`packetCache: failed to delete ${id}`, e);
  }
}

/** Remove the entire packet cache directory (best-effort). */
export function clearAllPacketBytes(): void {
  try {
    const dir = packetsDir();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('packetCache: failed to clear cache', e);
  }
}

/** Total bytes used by the packet cache (0 if the size can't be read). */
export function packetCacheSize(): number {
  try {
    const dir = packetsDir();
    return dir.exists ? dir.size ?? 0 : 0;
  } catch {
    return 0;
  }
}
