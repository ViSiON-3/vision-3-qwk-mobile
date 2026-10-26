/**
 * V3AREAS.JSON — ViSiON/3's sidecar entry in a QWK packet.
 *
 * CONTROL.DAT only carries a flat list of conference numbers and names, so a
 * reader cannot tell which areas belong to fsxNet, FidoNet or the local board.
 * The server adds this small JSON file (see the Phase 7 contract in
 * docs/design/design_handoff_qwk_mobile/PHASE8-KICKOFF.md) mapping each QWK
 * conference number to its message area and parent board conference. Standard
 * QWK readers ignore it. Older servers do not write it, so it is optional.
 */
import { decodeUtf8, encodeUtf8 } from './utf8';

export const AREA_INDEX_FILE = 'V3AREAS.JSON';
export const AREA_INDEX_VERSION = 1;

export interface AreaIndexConference {
  tag: string;
  name: string;
}

export interface AreaIndexArea {
  /** QWK conference number (CONTROL.DAT / NDX / message header). */
  qwk: number;
  /** The board's own area tag, e.g. "FSX_GEN". */
  tag: string;
  name: string;
  /** Parent conference tag; undefined when the area is ungrouped. */
  conference?: string;
  /** Area type: local, echomail, netmail, v3net, qwknet. */
  type?: string;
  /** Network key for networked areas, e.g. "fsxnet". */
  network?: string;
  /** Human-readable network name, when the server knows one (e.g. "fsxNet"). */
  networkName?: string;
}

export interface AreaIndex {
  version: number;
  /** Board conferences in display order (only those with exported areas). */
  conferences: AreaIndexConference[];
  /** Exported areas in CONTROL.DAT order. */
  areas: AreaIndexArea[];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function optStr(v: unknown): string | undefined {
  const s = str(v)?.trim();
  return s ? s : undefined;
}

/**
 * Parse the sidecar bytes. Packets come from a remote server, so the shape is
 * validated field by field: malformed entries are dropped, and anything that is
 * not a recognisable index at all yields undefined (caller falls back to the
 * flat CONTROL.DAT taxonomy). Unknown versions are still read best-effort.
 */
export function parseAreaIndex(bytes: Uint8Array): AreaIndex | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(decodeUtf8(bytes));
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const conferences: AreaIndexConference[] = [];
  const seenConf = new Set<string>();
  if (Array.isArray(obj.conferences)) {
    for (const c of obj.conferences) {
      if (!c || typeof c !== 'object') continue;
      const rec = c as Record<string, unknown>;
      const tag = optStr(rec.tag);
      if (!tag || seenConf.has(tag)) continue;
      seenConf.add(tag);
      conferences.push({ tag, name: optStr(rec.name) ?? tag });
    }
  }

  const areas: AreaIndexArea[] = [];
  const seenQwk = new Set<number>();
  if (Array.isArray(obj.areas)) {
    for (const a of obj.areas) {
      if (!a || typeof a !== 'object') continue;
      const rec = a as Record<string, unknown>;
      const qwk = typeof rec.qwk === 'number' && Number.isInteger(rec.qwk) && rec.qwk >= 0 ? rec.qwk : undefined;
      if (qwk === undefined || seenQwk.has(qwk)) continue;
      seenQwk.add(qwk);
      const name = optStr(rec.name) ?? '';
      areas.push({
        qwk,
        tag: optStr(rec.tag) ?? '',
        name,
        conference: optStr(rec.conference),
        type: optStr(rec.type),
        network: optStr(rec.network),
        networkName: optStr(rec.networkName),
      });
    }
  }

  if (!Array.isArray(obj.conferences) && !Array.isArray(obj.areas)) return undefined;
  const version = typeof obj.version === 'number' ? obj.version : AREA_INDEX_VERSION;
  return { version, conferences, areas };
}

/** Serialise an index for inclusion in a packet (sample/test packets). */
export function serializeAreaIndex(index: AreaIndex): Uint8Array {
  return encodeUtf8(JSON.stringify({ ...index, version: AREA_INDEX_VERSION }, null, 2));
}
