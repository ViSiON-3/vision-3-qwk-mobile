import { Area, Conference } from './types';

/**
 * The board's conference/area structure, derived at runtime from the synced
 * packet's CONTROL.DAT (Phase 8: server-driven, not static client config).
 *
 * Each QWK conference becomes one Area with a stable id `a<qwkConference>`, so
 * parsed messages map to an area purely by their conference number. Areas are
 * grouped into UI Conferences by an optional "Network: Area" name prefix — e.g.
 * "fsxNet: General" groups under a networked "fsxNet" conference, while a bare
 * "General Discussion" falls under a local conference. Conference 0 is private
 * email (the MAIL tab) and is excluded from the public taxonomy.
 */

export const PRIVATE_AREA_ID = 'mail';
export const PRIVATE_CONFERENCE = 0;

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

/**
 * Build the UI conference/area taxonomy from a packet's CONTROL.DAT conference
 * list. Conference 0 (private mail) is skipped; the rest each become an area,
 * grouped into conferences by a "Network:" name prefix. Duplicate conference
 * numbers keep their first-seen name. Deterministic given the input order.
 */
export function buildTaxonomy(
  qwkConferences: { number: number; name: string }[]
): { conferences: Conference[]; areas: AreaConfig[] } {
  const conferences: Conference[] = [];
  const areas: AreaConfig[] = [];
  const byNet = new Map<string, Conference>();
  const areaCount = new Map<string, number>(); // conferenceId -> areas assigned so far
  const seen = new Set<number>();

  for (const qc of qwkConferences) {
    if (qc.number === PRIVATE_CONFERENCE || seen.has(qc.number)) continue;
    seen.add(qc.number);

    const colon = qc.name.indexOf(':');
    const isNet = colon > 0;
    const netName = (isNet ? qc.name.slice(0, colon) : 'Local').trim() || 'Local';
    const areaName = (isNet ? qc.name.slice(colon + 1) : qc.name).trim() || `Conference ${qc.number}`;

    // Namespace the grouping key by net-ness so the bare-name "Local" fallback
    // can't merge with a network literally named "Local:".
    const netKey = (isNet ? 'N:' : 'L:') + netName;
    let conf = byNet.get(netKey);
    if (!conf) {
      conf = { id: `c${byNet.size}`, number: byNet.size, name: netName, tag: slug(netName) || 'LOCAL', isNet };
      byNet.set(netKey, conf);
      conferences.push(conf);
    }

    const number = (areaCount.get(conf.id) ?? 0) + 1;
    areaCount.set(conf.id, number);
    areas.push({
      id: areaIdForConference(qc.number),
      conferenceId: conf.id,
      number,
      name: areaName,
      tag: slug(areaName) || `CONF${qc.number}`,
      qwkConference: qc.number,
    });
  }
  return { conferences, areas };
}

export function areaByQwkConference(areas: AreaConfig[], conf: number): AreaConfig | undefined {
  return areas.find((a) => a.qwkConference === conf);
}

export function areasForConference(areas: AreaConfig[], conferenceId: string): AreaConfig[] {
  return areas.filter((a) => a.conferenceId === conferenceId);
}
