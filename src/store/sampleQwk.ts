import { buildQwkPacket, QwkMessageInput } from '../qwk';
import { packetConferences, PRIVATE_CONFERENCE } from './taxonomy';

/**
 * Sample message content used to synthesize a real .QWK packet for the offline
 * prototype (no live BBS yet). When the API client lands, this is replaced by a
 * downloaded packet; the parse/store/UI path downstream is identical.
 */
const art = [
  '╔══════════════════════════════╗',
  '║   ViSiON/3  ·  OFFLINE MAIL   ║',
  '╚══════════════════════════════╝',
  '',
].join('\n');

const SAMPLE_MESSAGES: QwkMessageInput[] = [
  {
    conference: PRIVATE_CONFERENCE,
    number: 1024,
    to: 'Zaphod',
    from: 'Prime',
    subject: 'Welcome to ViSiON/3 HQ',
    date: '06-30-26',
    time: '22:14',
    isPrivate: true,
    body: art + 'Glad to have you aboard, Zaphod.\n\nPull a packet any time and reply offline -- it all\nsyncs back when you upload your REP.\n\n  -- Prime',
    messageId: '<1024@v3hq>',
  },
  {
    conference: PRIVATE_CONFERENCE,
    number: 1025,
    to: 'Zaphod',
    from: 'Deacon',
    subject: 'Re: packet trouble',
    date: '07-01-26',
    time: '08:02',
    isPrivate: true,
    reference: 1024,
    inReplyTo: '<1024@v3hq>',
    body: 'Try re-pulling -- the newscan pointer only advances\nonce the packet is fully produced. If your download\ndropped, you may just re-see the same mail.\n\nCheers,\nDeacon',
  },
  {
    conference: 3,
    number: 2048,
    to: 'All',
    from: 'Avon',
    subject: 'fsxNet weekly nodelist',
    date: '06-29-26',
    time: '12:00',
    body: 'The updated nodelist is posted. New nodes this week:\n\n  21:4/158  The Undermountain\n  21:1/230  Cathedral BBS\n\nWelcome aboard, both of you.',
    messageId: '<2048@fsx>',
  },
  {
    conference: 3,
    number: 2049,
    to: 'Avon',
    from: 'Blake',
    subject: 'Re: fsxNet weekly nodelist',
    date: '06-29-26',
    time: '14:37',
    reference: 2048,
    inReplyTo: '<2048@fsx>',
    body: 'Thanks Avon -- got us added.\n\nThe QWK gateway has been rock solid this month.',
  },
  {
    conference: 6,
    number: 4096,
    to: 'All',
    from: 'Prime',
    subject: 'Phase 8 mobile client',
    date: '07-01-26',
    time: '09:30',
    body: 'The React Native reader is coming together.\n\nOffline read/reply/upload all round-trips against the\nPhase 7 packet API now. CP437 art renders verbatim:\n\n  ░▒▓█ retro forever █▓▒░',
  },
];

/** Build a realistic sample .QWK for a board (parsed by the real engine). */
export function buildSampleQwk(bbsId: string): Uint8Array {
  return buildQwkPacket({
    control: {
      bbsId,
      bbsName: 'ViSiON/3 HQ',
      sysop: 'Prime',
      conferences: packetConferences(),
    },
    messages: SAMPLE_MESSAGES,
  });
}

export const sampleMessageCount = SAMPLE_MESSAGES.length;
