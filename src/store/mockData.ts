import { Area, Board, Conference, Message, Packet } from './types';

export const mockBoards: Board[] = [
  {
    id: 'b1',
    name: 'ViSiON/3 HQ',
    host: 'bbs.vision3.io',
    port: 8666,
    handle: 'Zaphod',
    pass: 'hunter2',
    bbsId: 'V3HQ',
    sysop: 'Prime',
    node: '1',
  },
  {
    id: 'b2',
    name: 'Cathedral',
    host: 'cathedral.bbs.io',
    port: 8666,
    handle: 'Zaphod',
    pass: 'towel42',
    bbsId: 'CATHDRL',
    sysop: 'Deacon',
    node: '2',
  },
];

export const mockConferences: Conference[] = [
  { id: 'c0', number: 0, name: 'Local', tag: 'LOCAL', isNet: false },
  { id: 'c1', number: 1, name: 'fsxNet', tag: 'FSX_GEN', isNet: true },
  { id: 'c2', number: 2, name: 'V3Net', tag: 'V3_MAIN', isNet: true },
  { id: 'c3', number: 3, name: 'FidoNet', tag: 'FIDO', isNet: true },
];

export const mockAreas: Area[] = [
  { id: 'a0', conferenceId: 'c0', number: 1, name: 'General', tag: 'GENERAL' },
  { id: 'a1', conferenceId: 'c0', number: 2, name: 'Sysop Announcements', tag: 'ANNOUNCE' },
  { id: 'a2', conferenceId: 'c1', number: 1, name: 'fsxNet General', tag: 'FSX_GEN' },
  { id: 'a3', conferenceId: 'c1', number: 2, name: 'BBS Ads', tag: 'FSX_ADS' },
  { id: 'a4', conferenceId: 'c1', number: 3, name: 'Retro Computing', tag: 'FSX_RETRO' },
  { id: 'a5', conferenceId: 'c2', number: 1, name: 'V3 Development', tag: 'V3_DEV' },
  { id: 'a6', conferenceId: 'c2', number: 2, name: 'V3 Support', tag: 'V3_HELP' },
  { id: 'a7', conferenceId: 'c3', number: 1, name: 'FidoNews', tag: 'FIDONEWS' },
];

const art = [
  '╔══════════════════════════════╗',
  '║   ViSiON/3  ·  OFFLINE MAIL   ║',
  '╚══════════════════════════════╝',
  '',
].join('\n');

/** Private mail lives in "conference 0" — area a0 flagged private here. */
export const mockMessages: Message[] = [
  {
    id: 'm1',
    number: 1024,
    areaId: 'a0',
    subject: 'Welcome to ViSiON/3 HQ',
    from: 'Prime',
    to: 'Zaphod',
    date: '06-30-26',
    time: '22:14',
    isPrivate: true,
    preview: 'Glad to have you aboard. Your account is all set up and...',
    body:
      art +
      'Glad to have you aboard, Zaphod.\n\nYour account is all set up and ready. Pull a packet\nany time and reply offline — it all syncs back when\nyou upload your REP.\n\n  -- Prime',
  },
  {
    id: 'm2',
    number: 1025,
    areaId: 'a0',
    subject: 'Re: packet trouble',
    from: 'Deacon',
    to: 'Zaphod',
    date: '07-01-26',
    time: '08:02',
    isPrivate: true,
    preview: 'Try re-pulling — the newscan pointer only advances once...',
    body:
      'Try re-pulling — the newscan pointer only advances once\nthe packet is fully produced. If your download dropped,\nyou may just re-see the same mail.\n\nCheers,\nDeacon',
    reference: 1000,
  },
  {
    id: 'm3',
    number: 2048,
    areaId: 'a2',
    subject: 'fsxNet weekly nodelist',
    from: 'Avon',
    to: 'All',
    date: '06-29-26',
    time: '12:00',
    isPrivate: false,
    preview: 'The updated nodelist is attached to the file area. New...',
    body:
      'The updated nodelist is posted. New nodes this week:\n\n  21:4/158  The Undermountain\n  21:1/230  Cathedral BBS\n\nWelcome aboard, both of you.',
  },
  {
    id: 'm4',
    number: 2049,
    areaId: 'a2',
    subject: 'Re: fsxNet weekly nodelist',
    from: 'Blake',
    to: 'Avon',
    date: '06-29-26',
    time: '14:37',
    isPrivate: false,
    preview: 'Thanks Avon — got us added. The QWK gateway has been...',
    body: 'Thanks Avon — got us added.\n\nThe QWK gateway has been rock solid this month.',
    reference: 2048,
  },
  {
    id: 'm5',
    number: 4096,
    areaId: 'a5',
    subject: 'Phase 8 mobile client',
    from: 'Prime',
    to: 'All',
    date: '07-01-26',
    time: '09:30',
    isPrivate: false,
    preview: 'The React Native reader is coming together. Offline read...',
    body:
      'The React Native reader is coming together.\n\nOffline read/reply/upload all round-trips against the\nPhase 7 packet API now. CP437 art renders verbatim:\n\n  ░▒▓█ retro forever █▓▒░',
  },
];

export const mockLastPacket: Packet = {
  id: 'pkt1',
  bbsId: 'V3HQ',
  file: 'V3HQ.QWK',
  msgs: 5,
  confs: 4,
  areas: 8,
  kb: 47,
  date: '07-01-26 09:31',
};

export const mockPackets: Packet[] = [
  mockLastPacket,
  { id: 'pkt0', bbsId: 'V3HQ', file: 'V3HQ.QWK', msgs: 3, confs: 4, areas: 8, kb: 31, date: '06-30-26 22:15' },
  { id: 'pkt-cat', bbsId: 'CATHDRL', file: 'CATHDRL.QWK', msgs: 8, confs: 6, areas: 12, kb: 88, date: '06-28-26 19:40' },
];
