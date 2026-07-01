/**
 * QWK packet writer — complements readQwkPacket(). Builds a full .QWK zip
 * (CONTROL.DAT + MESSAGES.DAT + optional HEADERS.DAT) from a structured input.
 * Used to generate sample/offline packets that flow through the real parser, and
 * by tests. RN-safe (Uint8Array + fflate).
 */
import { zipSync } from 'fflate';
import { BLOCK_SIZE, writeField, writeAsciiInt, writeUint16LE, concatBytes } from './bytes';
import { encodeCp437 } from './cp437';
import { serializeHeadersDat } from './headers';

const EOL = 0xe3;
const ACTIVE = 0xe1;
const DELETED = 0xe2;

export interface QwkMessageInput {
  /** Destination conference number. */
  conference: number;
  number: number;
  to: string;
  from: string;
  subject: string;
  /** MM-DD-YY */
  date?: string;
  /** HH:MM */
  time?: string;
  body: string;
  isPrivate?: boolean;
  active?: boolean;
  /** In-reply-to message number (offset 108). */
  reference?: number;
  /** RFC-style id emitted to HEADERS.DAT. */
  messageId?: string;
  /** Parent Message-ID emitted to HEADERS.DAT In-Reply-To. */
  inReplyTo?: string;
}

export interface QwkControlInput {
  bbsId: string;
  bbsName?: string;
  city?: string;
  phone?: string;
  sysop?: string;
  serial?: string;
  createdAt?: string;
  username?: string;
  conferences: { number: number; name: string }[];
  welcome?: string;
  news?: string;
  goodbye?: string;
}

function buildControlDat(c: QwkControlInput): Uint8Array {
  const lines: string[] = [
    c.bbsName ?? 'ViSiON/3 BBS',
    c.city ?? 'Somewhere, USA',
    c.phone ?? '000-000-0000',
    c.sysop ?? 'Sysop',
    `${c.serial ?? '00000'},${c.bbsId}`,
    c.createdAt ?? '01-01-2026,00:00:00',
    c.username ?? 'USER',
    '',
    '0',
    '0',
    String(c.conferences.length - 1),
  ];
  for (const conf of c.conferences) {
    lines.push(String(conf.number));
    lines.push(conf.name);
  }
  lines.push(c.welcome ?? 'WELCOME');
  lines.push(c.news ?? 'NEWS');
  lines.push(c.goodbye ?? 'GOODBYE');
  return encodeCp437(lines.join('\r\n') + '\r\n');
}

function encodeBody(text: string): { bytes: Uint8Array; textBlocks: number } {
  const lines = text.split(/\r\n|\r|\n/);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push(new Uint8Array([EOL]));
    parts.push(encodeCp437(lines[i]));
  }
  const body = concatBytes(parts);
  const textBlocks = Math.max(1, Math.ceil(body.length / BLOCK_SIZE));
  const padded = new Uint8Array(textBlocks * BLOCK_SIZE).fill(0x20);
  padded.set(body, 0);
  return { bytes: padded, textBlocks };
}

function messageHeaderBlock(m: QwkMessageInput, textBlocks: number): Uint8Array {
  const h = new Uint8Array(BLOCK_SIZE).fill(0x20);
  writeField(h, 0, 1, m.isPrivate ? '*' : ' ');
  writeAsciiInt(h, 1, 7, m.number);
  writeField(h, 8, 8, m.date ?? '01-01-26');
  writeField(h, 16, 5, m.time ?? '00:00');
  writeField(h, 21, 25, m.to);
  writeField(h, 46, 25, m.from);
  writeField(h, 71, 25, m.subject);
  if (m.reference && m.reference > 0) writeAsciiInt(h, 108, 8, m.reference);
  writeAsciiInt(h, 116, 6, 1 + textBlocks);
  h[122] = m.active === false ? DELETED : ACTIVE;
  writeUint16LE(h, 123, m.conference);
  writeUint16LE(h, 125, m.number & 0xffff);
  return h;
}

/** Build a .QWK zip from control metadata + messages. */
export function buildQwkPacket(input: { control: QwkControlInput; messages: QwkMessageInput[] }): Uint8Array {
  const producer = new Uint8Array(BLOCK_SIZE).fill(0x20);
  writeField(producer, 0, BLOCK_SIZE, 'Produced by ViSiON/3 QWK Packet API');

  const blocks: Uint8Array[] = [producer];
  const headerSections: { offset: number; fields: Array<[string, string]> }[] = [];
  let offset = BLOCK_SIZE; // first message header-block offset

  for (const m of input.messages) {
    const { bytes: bodyBytes, textBlocks } = encodeBody(m.body);
    blocks.push(messageHeaderBlock(m, textBlocks), bodyBytes);

    const fields: Array<[string, string]> = [];
    if (m.messageId) fields.push(['Message-ID', m.messageId]);
    if (m.inReplyTo) fields.push(['In-Reply-To', m.inReplyTo]);
    if (m.subject.length > 25) fields.push(['Subject', m.subject]);
    if (m.to.length > 25) fields.push(['To', m.to]);
    if (m.from.length > 25) fields.push(['From', m.from]);
    if (fields.length > 0) headerSections.push({ offset, fields });

    offset += (1 + textBlocks) * BLOCK_SIZE;
  }

  const files: Record<string, Uint8Array> = {
    'CONTROL.DAT': buildControlDat(input.control),
    'MESSAGES.DAT': concatBytes(blocks),
  };
  if (headerSections.length > 0) {
    files['HEADERS.DAT'] = encodeCp437(serializeHeadersDat(headerSections));
  }
  return zipSync(files, { mtime: 946684800000 });
}
