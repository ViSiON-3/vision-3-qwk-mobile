import { Area, Conference } from './types';
import type { AreaIndex } from '../qwk/areaIndex';

/**
 * The board's conference/area structure, derived at runtime from the synced
 * packet (Phase 8: server-driven, not static client config).
 *
 * Each QWK conference becomes one Area with a stable id `a<qwkConference>`, so
 * parsed messages map to an area purely by their conference number. Areas are
 * grouped into UI Conferences using the server's V3AREAS.JSON sidecar, which
 * names each area's parent board conference (fsxNet, FidoNet, Local Areas…)
 * exactly as the sysop configured it. Areas the sidecar leaves ungrouped are
 * grouped by their message network instead (fsxNet, FidoNet…), and those with
 * no network at all land in "Other Areas". Every area in a packet from an older
 * server with no sidecar falls under a single "All Areas" conference. Area
 * names are never parsed for structure. Conference 0 is private email (the
 * MAIL tab) and is excluded from the public taxonomy.
 */

export const PRIVATE_AREA_ID = 'mail';
export const PRIVATE_CONFERENCE = 0;

/** Group for areas with no board conference and no network (sidecar present). */
export const UNGROUPED_CONFERENCE_NAME = 'Other Areas';
export const UNGROUPED_CONFERENCE_TAG = 'OTHER';
/** Single group for every area when the packet has no sidecar (older server). */
export const FLAT_CONFERENCE_NAME = 'All Areas';
export const FLAT_CONFERENCE_TAG = 'ALL';

/** Display casing for well-known network keys; anything else gets a generic
 * "FooNet" treatment. Purely cosmetic — the key itself is the grouping. */
const NETWORK_DISPLAY_NAMES: Record<string, string> = {
  fsxnet: 'fsxNet',
  fidonet: 'FidoNet',
  dovenet: 'DOVE-Net',
  v3net: 'V3Net',
};

export function networkDisplayName(key: string, provided?: string): string {
  if (provided) return provided;
  const k = key.trim().toLowerCase();
  if (NETWORK_DISPLAY_NAMES[k]) return NETWORK_DISPLAY_NAMES[k];
  if (k.endsWith('net') && k.length > 3) return k[0].toUpperCase() + k.slice(1, -3) + 'Net';
  return k ? k[0].toUpperCase() + k.slice(1) : key;
}

/** Area types the BBS uses for areas fed by a message network. */
const NET_AREA_TYPES = new Set(['echomail', 'netmail', 'v3net', 'qwknet']);

/** Areas carry the QWK conference number they map to. */
export interface AreaConfig extends Area {
  qwkConference: number;
}

/** Stable UI area id for a QWK conference number (matches parsed messages). */
export function areaIdForConference(conf: number): string {
  return `a${conf}`;
}

function slug(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 12);
}

interface Group {
  conf: Conference;
  areas: AreaConfig[];
}

/**
 * Build the UI conference/area taxonomy from a packet's CONTROL.DAT conference
 * list plus the optional V3AREAS.JSON index. Conference 0 (private mail) is
 * skipped; every other CONTROL.DAT entry becomes an area (duplicate numbers keep
 * their first-seen name). Order: board conferences in display order (only those
 * holding an exported area), then one group per network for areas the board
 * left ungrouped (first-seen order), then "Other Areas" for the rest.
 * Deterministic given the inputs.
 */
export function buildTaxonomy(
  qwkConferences: { number: number; name: string }[],
  areaIndex?: AreaIndex
): { conferences: Conference[]; areas: AreaConfig[] } {
  const indexAreas = new Map(areaIndex?.areas.map((a) => [a.qwk, a]) ?? []);
  const groups = new Map<string, Group>(); // conference tag -> group
  for (const c of areaIndex?.conferences ?? []) {
    if (groups.has(c.tag)) continue;
    groups.set(c.tag, {
      conf: { id: '', number: 0, name: c.name, tag: slug(c.tag) || slug(c.name) || 'CONF', isNet: false },
      areas: [],
    });
  }
  const netGroups = new Map<string, Group>(); // lower-cased network key -> group
  const ungrouped: Group = areaIndex
    ? { conf: { id: '', number: 0, name: UNGROUPED_CONFERENCE_NAME, tag: UNGROUPED_CONFERENCE_TAG, isNet: false }, areas: [] }
    : { conf: { id: '', number: 0, name: FLAT_CONFERENCE_NAME, tag: FLAT_CONFERENCE_TAG, isNet: false }, areas: [] };

  const seen = new Set<number>();
  for (const qc of qwkConferences) {
    if (qc.number === PRIVATE_CONFERENCE || seen.has(qc.number)) continue;
    seen.add(qc.number);

    const meta = indexAreas.get(qc.number);
    let group = meta?.conference ? groups.get(meta.conference) : undefined;
    if (!group && meta?.network) {
      const key = meta.network.trim().toLowerCase();
      group = netGroups.get(key);
      if (!group) {
        group = {
          conf: {
            id: '',
            number: 0,
            name: networkDisplayName(key, meta.networkName),
            tag: slug(key) || 'NET',
            isNet: true,
          },
          areas: [],
        };
        netGroups.set(key, group);
      }
    }
    if (!group) group = ungrouped;
    const name = (meta?.name || qc.name).trim() || `Conference ${qc.number}`;
    const tag = (meta?.tag && slug(meta.tag)) || slug(name) || `CONF${qc.number}`;
    if (group !== ungrouped && meta && ((meta.type && NET_AREA_TYPES.has(meta.type)) || meta.network)) {
      group.conf.isNet = true;
    }
    group.areas.push({
      id: areaIdForConference(qc.number),
      conferenceId: '', // assigned below once conference ids are final
      number: group.areas.length + 1,
      name,
      tag,
      qwkConference: qc.number,
    });
  }

  const conferences: Conference[] = [];
  const areas: AreaConfig[] = [];
  for (const g of [...groups.values(), ...netGroups.values(), ungrouped]) {
    if (g.areas.length === 0) continue;
    const id = `c${conferences.length}`;
    g.conf.id = id;
    g.conf.number = conferences.length;
    conferences.push(g.conf);
    for (const a of g.areas) areas.push({ ...a, conferenceId: id });
  }
  return { conferences, areas };
}

/** The conference directory parsed from one cached packet. */
export interface PacketDirectory {
  qwkConferences: { number: number; name: string }[];
  areaIndex?: AreaIndex;
}

/**
 * Decide which areas the board currently has, from the cached packets of one
 * board (newest first). A packet's V3AREAS.JSON lists exactly the areas the user
 * is subscribed to on the server, so the newest packet that carries one is
 * authoritative: areas known only from older packets (areas since untagged, or
 * packets from before the server wrote the sidecar) are dropped rather than
 * shown ungrouped. Their messages stay cached and reappear if the area comes
 * back. With no sidecar anywhere (older servers, other BBS software) the
 * directory is the union of every packet's CONTROL.DAT, as before.
 */
export function currentDirectory(packets: PacketDirectory[]): PacketDirectory {
  const union = new Map<number, string>(); // first-seen (newest) name per number
  for (const p of packets) {
    for (const c of p.qwkConferences) if (!union.has(c.number)) union.set(c.number, c.name);
  }
  const all = [...union.entries()].map(([number, name]) => ({ number, name }));

  const current = packets.find((p) => p.areaIndex)?.areaIndex;
  if (!current) return { qwkConferences: all };

  const live = new Set(current.areas.map((a) => a.qwk));
  return {
    qwkConferences: all.filter((c) => c.number === PRIVATE_CONFERENCE || live.has(c.number)),
    areaIndex: current,
  };
}

export function areaByQwkConference(areas: AreaConfig[], conf: number): AreaConfig | undefined {
  return areas.find((a) => a.qwkConference === conf);
}

export function areasForConference(areas: AreaConfig[], conferenceId: string): AreaConfig[] {
  return areas.filter((a) => a.conferenceId === conferenceId);
}
