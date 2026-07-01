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

/** Read packet bytes, or null if the file is missing. */
export async function readPacketBytes(id: string): Promise<Uint8Array | null> {
  const file = packetFile(id);
  if (!file.exists) return null;
  return await file.bytes();
}

/** Delete one packet's bytes (no-op if absent). */
export function deletePacketBytes(id: string): void {
  const file = packetFile(id);
  if (file.exists) file.delete();
}

/** Remove the entire packet cache directory. */
export function clearAllPacketBytes(): void {
  const dir = packetsDir();
  if (dir.exists) dir.delete();
}

/** Total bytes used by the packet cache. */
export function packetCacheSize(): number {
  const dir = packetsDir();
  return dir.exists ? dir.size ?? 0 : 0;
}
