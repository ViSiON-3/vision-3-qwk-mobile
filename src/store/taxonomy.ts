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
 * exactly as the sysop configured it. Areas the sidecar leaves ungrouped — and
 * every area in a packet from an older server with no sidecar — fall under a
 * single "Local" conference. Area names are never parsed for structure.
 * Conference 0 is private email (the MAIL tab) and is excluded from the public
 * taxonomy.
 */

export const PRIVATE_AREA_ID = 'mail';
export const PRIVATE_CONFERENCE = 0;

/** Name/tag of the group holding areas with no board conference. */
export const UNGROUPED_CONFERENCE_NAME = 'Local';
export const UNGROUPED_CONFERENCE_TAG = 'LOCAL';

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
 * their first-seen name). Conferences appear in the board's display order, only
 * when they hold at least one exported area, with the ungrouped "Local" bucket
 * last. Deterministic given the inputs.
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
  const ungrouped: Group = {
    conf: { id: '', number: 0, name: UNGROUPED_CONFERENCE_NAME, tag: UNGROUPED_CONFERENCE_TAG, isNet: false },
    areas: [],
  };

  const seen = new Set<number>();
  for (const qc of qwkConferences) {
    if (qc.number === PRIVATE_CONFERENCE || seen.has(qc.number)) continue;
    seen.add(qc.number);

    const meta = indexAreas.get(qc.number);
    const group = (meta?.conference && groups.get(meta.conference)) || ungrouped;
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
  for (const g of [...groups.values(), ungrouped]) {
    if (g.areas.length === 0) continue;
    const id = `c${conferences.length}`;
    g.conf.id = id;
    g.conf.number = conferences.length;
    conferences.push(g.conf);
    for (const a of g.areas) areas.push({ ...a, conferenceId: id });
  }
  return { conferences, areas };
}

export function areaByQwkConference(areas: AreaConfig[], conf: number): AreaConfig | undefined {
  return areas.find((a) => a.qwkConference === conf);
}

export function areasForConference(areas: AreaConfig[], conferenceId: string): AreaConfig[] {
  return areas.filter((a) => a.conferenceId === conferenceId);
}
