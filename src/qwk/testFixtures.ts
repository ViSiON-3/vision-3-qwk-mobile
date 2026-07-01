/**
 * Test helpers for constructing raw QWK bytes. Not a test suite (no *.test.ts),
 * imported by the engine tests to build fixtures at the byte level.
 */
import { BLOCK_SIZE, writeField, writeAsciiInt, writeUint16LE, concatBytes } from './bytes';
import { encodeCp437 } from './cp437';

const EOL = 0xe3;

export function producerBlock(text = 'Produced by ViSiON/3 QWK API Test'): Uint8Array {
  const b = new Uint8Array(BLOCK_SIZE).fill(0x20);
  writeField(b, 0, BLOCK_SIZE, text);
  return b;
}

export interface MsgFields {
  status?: string;
  number?: number;
  date?: string;
  time?: string;
  to?: string;
  from?: string;
  subject?: string;
  password?: string;
  reference?: number;
  conference?: number;
  logical?: number;
  active?: boolean;
  netTag?: boolean;
  body: string;
}

/** Build one message (header block + 0xE3-encoded body blocks). */
export function messageBlocks(f: MsgFields): Uint8Array {
  const lines = f.body.split('\n');
  const parts: Uint8Array[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push(new Uint8Array([EOL]));
    parts.push(encodeCp437(lines[i]));
  }
  const bodyRaw = concatBytes(parts);
  const textBlocks = Math.max(1, Math.ceil(bodyRaw.length / BLOCK_SIZE));
  const body = new Uint8Array(textBlocks * BLOCK_SIZE).fill(0x20);
  body.set(bodyRaw, 0);

  const h = new Uint8Array(BLOCK_SIZE).fill(0x20);
  writeField(h, 0, 1, f.status ?? ' ');
  writeAsciiInt(h, 1, 7, f.number ?? 1);
  writeField(h, 8, 8, f.date ?? '07-01-26');
  writeField(h, 16, 5, f.time ?? '12:00');
  writeField(h, 21, 25, f.to ?? 'ALL');
  writeField(h, 46, 25, f.from ?? 'SYSOP');
  writeField(h, 71, 25, f.subject ?? 'Test');
  writeField(h, 96, 12, f.password ?? '');
  if (f.reference) writeAsciiInt(h, 108, 8, f.reference);
  writeAsciiInt(h, 116, 6, 1 + textBlocks);
  h[122] = f.active === false ? 0xe2 : 0xe1;
  writeUint16LE(h, 123, f.conference ?? 0);
  writeUint16LE(h, 125, f.logical ?? 0);
  h[127] = f.netTag ? 0x2a : 0x20;

  return concatBytes([h, body]);
}

/** Build a full MESSAGES.DAT (producer block + messages). */
export function messagesDat(msgs: MsgFields[]): Uint8Array {
  return concatBytes([producerBlock(), ...msgs.map(messageBlocks)]);
}

/** Build a CONTROL.DAT with the given conferences. */
export function controlDat(opts: {
  bbsName?: string;
  bbsId?: string;
  serial?: string;
  username?: string;
  conferences: Array<{ number: number; name: string }>;
  welcome?: string;
  news?: string;
  goodbye?: string;
}): Uint8Array {
  const lines: string[] = [
    opts.bbsName ?? 'ViSiON/3 Test BBS',
    'Somewhere, USA',
    '000-000-0000',
    'The Sysop',
    `${opts.serial ?? '00000'},${opts.bbsId ?? 'V3TEST'}`,
    '07-01-2026,12:00:00',
    opts.username ?? 'TEST USER',
    '', // qmail menu (blank)
    '0', // netmail / zero
    '999', // total messages (informational)
    String(opts.conferences.length - 1), // highest conf index
  ];
  for (const c of opts.conferences) {
    lines.push(String(c.number));
    lines.push(c.name);
  }
  lines.push(opts.welcome ?? 'WELCOME');
  lines.push(opts.news ?? 'NEWS');
  lines.push(opts.goodbye ?? 'GOODBYE');
  return encodeCp437(lines.join('\r\n') + '\r\n');
}
