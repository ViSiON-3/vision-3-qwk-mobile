/**
 * MESSAGES.DAT (and .REP <BBSID>.MSG) reader.
 *
 * Layout: a 128-byte "producer" block, then per message a 128-byte header block
 * followed by (numberOfBlocks - 1) text blocks. Body hard line breaks are the
 * single byte 0xE3 (not CRLF). All fixed offsets per docs/qwk/FORMAT.md §2.
 */
import { BLOCK_SIZE, readField, readAsciiInt, readUint16LE } from './bytes';
import { decodeCp437 } from './cp437';
import { getHeaderField, HeaderSection } from './headers';
import { QwkMessage } from './types';

// Header-block field offsets (0-based).
const OFF = {
  status: 0,
  number: 1,
  date: 8,
  time: 16,
  to: 21,
  from: 46,
  subject: 71,
  password: 96,
  reference: 108,
  blocks: 116,
  active: 122,
  conference: 123,
  logical: 125,
  netTag: 127,
} as const;

const ACTIVE_DELETED = 0xe2;
const EOL = 0xe3;

function utf8DecodeLine(bytes: Uint8Array): string {
  // Small inline UTF-8 decoder used for body lines flagged Utf8.
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b >= 0xc0 && b < 0xe0 && i < bytes.length) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b >= 0xe0 && b < 0xf0 && i + 1 < bytes.length)
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else if (b >= 0xf0 && i + 2 < bytes.length)
      out += String.fromCodePoint(((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else out += '�';
  }
  return out;
}

/** Decode a body: split on 0xE3, trim trailing padding, decode each line. */
function decodeBody(raw: Uint8Array, utf8: boolean): string {
  // Trim trailing pad bytes (space / NUL) from the final block.
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === 0x20 || raw[end - 1] === 0x00)) end--;
  const body = raw.subarray(0, end);

  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    if (i === body.length || body[i] === EOL) {
      const seg = body.subarray(start, i);
      lines.push(utf8 ? utf8DecodeLine(seg) : decodeCp437(seg));
      start = i + 1;
    }
  }
  // A trailing EOL produced one empty segment; drop a single trailing blank line.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/** Peel leading QWKE kludge lines (To:/From:/Subject:) used for >25-char fields. */
function stripKludge(body: string): { overrides: Partial<Record<'to' | 'from' | 'subject', string>>; body: string } {
  const overrides: Partial<Record<'to' | 'from' | 'subject', string>> = {};
  const lines = body.split('\n');
  let idx = 0;
  const re = /^(To|From|Subject):[ ]?(.*)$/;
  while (idx < lines.length) {
    const m = re.exec(lines[idx]);
    if (!m) break;
    overrides[m[1].toLowerCase() as 'to' | 'from' | 'subject'] = m[2];
    idx++;
  }
  return { overrides, body: idx > 0 ? lines.slice(idx).join('\n') : body };
}

export interface ParseMessagesOptions {
  /** Extended headers keyed by header-block byte offset (from HEADERS.DAT). */
  headers?: Map<number, HeaderSection>;
  /** Honor QWKE body kludge lines as a fallback for long To/From/Subject. */
  stripKludgeLines?: boolean;
}

/**
 * Parse a MESSAGES.DAT / <BBSID>.MSG byte stream into messages.
 * The leading producer block is skipped.
 */
export function parseMessagesDat(bytes: Uint8Array, opts: ParseMessagesOptions = {}): QwkMessage[] {
  const messages: QwkMessage[] = [];
  const headers = opts.headers;
  let offset = BLOCK_SIZE; // skip producer block

  while (offset + BLOCK_SIZE <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK_SIZE);
    const blocks = readAsciiInt(header, OFF.blocks, 6);
    // Guard against malformed counts: a message is at least 2 blocks.
    const totalBlocks = blocks >= 2 ? blocks : 2;
    const textBytesLen = (totalBlocks - 1) * BLOCK_SIZE;
    const bodyStart = offset + BLOCK_SIZE;
    const bodyEnd = Math.min(bodyStart + textBytesLen, bytes.length);
    const rawBody = bytes.subarray(bodyStart, bodyEnd);

    const status = readField(header, OFF.status, 1);
    const activeByte = header[OFF.active];
    const section = headers?.get(offset);
    const utf8 = getHeaderField(section, 'Utf8')?.trim().toLowerCase() === 'true';

    let to = readField(header, OFF.to, 25);
    let from = readField(header, OFF.from, 25);
    let subject = readField(header, OFF.subject, 25);
    let body = decodeBody(rawBody, utf8);

    if (opts.stripKludgeLines && !section) {
      const k = stripKludge(body);
      body = k.body;
      if (k.overrides.to) to = k.overrides.to;
      if (k.overrides.from) from = k.overrides.from;
      if (k.overrides.subject) subject = k.overrides.subject;
    }

    // HEADERS.DAT full-length values take precedence.
    const hTo = getHeaderField(section, 'To');
    const hFrom = getHeaderField(section, 'From');
    const hSubject = getHeaderField(section, 'Subject');
    if (hTo) to = hTo;
    if (hFrom) from = hFrom;
    if (hSubject) subject = hSubject;

    const messageId = getHeaderField(section, 'Message-ID');
    const inReplyTo = getHeaderField(section, 'In-Reply-To');

    messages.push({
      status,
      number: readAsciiInt(header, OFF.number, 7),
      date: readField(header, OFF.date, 8),
      time: readField(header, OFF.time, 5),
      to,
      from,
      subject,
      password: readField(header, OFF.password, 12),
      reference: readAsciiInt(header, OFF.reference, 8),
      conference: readUint16LE(header, OFF.conference),
      logicalNumber: readUint16LE(header, OFF.logical),
      active: activeByte !== ACTIVE_DELETED,
      isPrivate: status === '*' || status === '+',
      hasNetTagline: header[OFF.netTag] === 0x2a,
      body,
      blockOffset: offset,
      messageId,
      inReplyTo,
      utf8: utf8 || undefined,
      extHeaders: section,
    });

    offset += totalBlocks * BLOCK_SIZE;
  }
  return messages;
}
