import { Area, Conference } from './types';

/**
 * The board's conference/area structure. In a full build this comes from the
 * server/board config; for the prototype it's static client config. Each area
 * maps to a QWK conference number; parsed packet messages are grouped into areas
 * by that number. Conference 0 is private email (the MAIL tab).
 */

export const PRIVATE_AREA_ID = 'mail';
export const PRIVATE_CONFERENCE = 0;

export const conferences: Conference[] = [
  { id: 'c0', number: 0, name: 'Local', tag: 'LOCAL', isNet: false },
  { id: 'c1', number: 1, name: 'fsxNet', tag: 'FSX_GEN', isNet: true },
  { id: 'c2', number: 2, name: 'V3Net', tag: 'V3_MAIN', isNet: true },
  { id: 'c3', number: 3, name: 'FidoNet', tag: 'FIDO', isNet: true },
];

/** Areas carry the QWK conference number they map to. */
export interface AreaConfig extends Area {
  qwkConference: number;
}

export const areas: AreaConfig[] = [
  { id: 'a0', conferenceId: 'c0', number: 1, name: 'General', tag: 'GENERAL', qwkConference: 1 },
  { id: 'a1', conferenceId: 'c0', number: 2, name: 'Sysop Announcements', tag: 'ANNOUNCE', qwkConference: 2 },
  { id: 'a2', conferenceId: 'c1', number: 1, name: 'fsxNet General', tag: 'FSX_GEN', qwkConference: 3 },
  { id: 'a3', conferenceId: 'c1', number: 2, name: 'BBS Ads', tag: 'FSX_ADS', qwkConference: 4 },
  { id: 'a4', conferenceId: 'c1', number: 3, name: 'Retro Computing', tag: 'FSX_RETRO', qwkConference: 5 },
  { id: 'a5', conferenceId: 'c2', number: 1, name: 'V3 Development', tag: 'V3_DEV', qwkConference: 6 },
  { id: 'a6', conferenceId: 'c2', number: 2, name: 'V3 Support', tag: 'V3_HELP', qwkConference: 7 },
  { id: 'a7', conferenceId: 'c3', number: 1, name: 'FidoNews', tag: 'FIDONEWS', qwkConference: 8 },
];

/** All conference numbers that appear in a packet's CONTROL.DAT (0 = personal). */
export function packetConferences(): { number: number; name: string }[] {
  const list = [{ number: PRIVATE_CONFERENCE, name: 'Personal' }];
  for (const a of areas) {
    const conf = conferences.find((c) => c.id === a.conferenceId);
    list.push({ number: a.qwkConference, name: `${conf?.name ?? ''}: ${a.name}` });
  }
  return list;
}

export function areaByQwkConference(conf: number): AreaConfig | undefined {
  return areas.find((a) => a.qwkConference === conf);
}

export function areasForConference(conferenceId: string): AreaConfig[] {
  return areas.filter((a) => a.conferenceId === conferenceId);
}
