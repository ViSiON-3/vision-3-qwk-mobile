/**
 * Top-level QWK packet reader: unzip -> CONTROL.DAT + HEADERS.DAT + MESSAGES.DAT
 * (+ the optional V3AREAS.JSON sidecar)
 * -> structured model. fflate handles the zip (RN-safe, no Node zlib).
 */
import { unzipSync } from 'fflate';
import { parseControlDat } from './control';
import { parseHeadersDat } from './headers';
import { parseMessagesDat } from './messages';
import { parseAreaIndex, AREA_INDEX_FILE } from './areaIndex';
import { QwkPacket } from './types';

/** Case-insensitive lookup of a file within an unzipped packet. */
function findFile(files: Record<string, Uint8Array>, name: string): Uint8Array | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(files)) {
    // Match on basename so pathed entries (e.g. "./CONTROL.DAT") still resolve.
    const base = key.split(/[\\/]/).pop() ?? key;
    if (base.toLowerCase() === lower) return files[key];
  }
  return undefined;
}

/** Read a .QWK packet (zip bytes) into a structured, offline-ready model. */
export function readQwkPacket(zipBytes: Uint8Array): QwkPacket {
  const files = unzipSync(zipBytes);

  const controlBytes = findFile(files, 'CONTROL.DAT');
  if (!controlBytes) throw new Error('Invalid QWK packet: CONTROL.DAT missing');
  const control = parseControlDat(controlBytes);

  const headerBytes = findFile(files, 'HEADERS.DAT');
  const headers = headerBytes ? parseHeadersDat(headerBytes) : undefined;

  const messageBytes = findFile(files, 'MESSAGES.DAT');
  const messages = messageBytes
    ? parseMessagesDat(messageBytes, { headers, stripKludgeLines: true })
    : [];

  const conferenceNames = new Map<number, string>();
  for (const c of control.conferences) conferenceNames.set(c.number, c.name);

  const indexBytes = findFile(files, AREA_INDEX_FILE);
  const areaIndex = indexBytes ? parseAreaIndex(indexBytes) : undefined;

  return { control, messages, conferenceNames, areaIndex };
}

export { unzipSync };
