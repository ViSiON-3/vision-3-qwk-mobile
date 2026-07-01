/**
 * .REP reply-packet writer.
 *
 * Builds <BBSID>.MSG (block 0 = target BBSID; then standard 128-byte message
 * blocks with 0xE3-encoded bodies) and, when useful, a HEADERS.DAT carrying
 * long To/From/Subject and Message-ID/In-Reply-To threading. Zips them with
 * fflate (RN-safe). Byte output is deterministic given identical drafts, so
 * re-uploading the same .REP is idempotent (server de-dupes).
 */
import { zipSync, strToU8 } from 'fflate';
import { BLOCK_SIZE, writeField, writeAsciiInt, writeUint16LE, concatBytes } from './bytes';
import { encodeCp437, isCp437 } from './cp437';
import { serializeHeadersDat } from './headers';
import { ReplyDraft } from './types';

const EOL = 0xe3;
const ACTIVE = 0xe1;
/**
 * Fixed mtime for reply archives (2000-01-01T00:00:00Z in ms). ZIP entries only
 * represent 1980-2099, and fflate uses local time for the DOS date, so a value
 * on the 1980 boundary underflows in timezones behind UTC. A fixed constant well
 * inside the range keeps re-uploads byte-identical (idempotent) on a given device.
 */
const ZIP_EPOCH_MS = 946684800000;

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

function buildHeaderBlock(reply: ReplyDraft, textBlocks: number): Uint8Array {
  const block = new Uint8Array(BLOCK_SIZE).fill(0x20);
  block[0] = reply.isPrivate ? 0x2a /* * */ : 0x20; // status
  writeAsciiInt(block, 1, 7, 0); // message number (BBS assigns)
  writeField(block, 8, 8, reply.date ?? '');
  writeField(block, 16, 5, reply.time ?? '');
  writeField(block, 21, 25, reply.to);
  writeField(block, 46, 25, reply.from);
  writeField(block, 71, 25, reply.subject);
  // password (96,12) left blank
  if (reply.reference && reply.reference > 0) writeAsciiInt(block, 108, 8, reply.reference);
  writeAsciiInt(block, 116, 6, 1 + textBlocks); // includes header block
  block[122] = ACTIVE;
  writeUint16LE(block, 123, reply.conference);
  writeUint16LE(block, 125, 0); // logical number
  block[127] = 0x20; // no net tagline
  return block;
}

export interface WriteRepOptions {
  /** Emit HEADERS.DAT for long fields / Message-ID threading (default true). */
  includeHeaders?: boolean;
}

/** Compile reply drafts into a .REP zip (returns the zip bytes). */
export function writeRep(bbsId: string, replies: ReplyDraft[], opts: WriteRepOptions = {}): Uint8Array {
  const includeHeaders = opts.includeHeaders !== false;

  // Block 0 carries the target BBSID.
  const producer = new Uint8Array(BLOCK_SIZE).fill(0x20);
  writeField(producer, 0, BLOCK_SIZE, bbsId);

  const blocks: Uint8Array[] = [producer];
  const headerSections: { offset: number; fields: Array<[string, string]> }[] = [];
  let offset = BLOCK_SIZE; // first reply header-block offset

  for (const reply of replies) {
    const { bytes: bodyBytes, textBlocks } = encodeBody(reply.body);
    const header = buildHeaderBlock(reply, textBlocks);
    blocks.push(header, bodyBytes);

    if (includeHeaders) {
      const fields: Array<[string, string]> = [];
      if (reply.messageId) fields.push(['Message-ID', reply.messageId]);
      if (reply.inReplyTo) fields.push(['In-Reply-To', reply.inReplyTo]);
      const needsUtf8 = !isCp437(reply.subject) || !isCp437(reply.to) || !isCp437(reply.from);
      if (needsUtf8) fields.push(['Utf8', 'true']);
      if (reply.subject.length > 25 || needsUtf8) fields.push(['Subject', reply.subject]);
      if (reply.to.length > 25 || needsUtf8) fields.push(['To', reply.to]);
      if (reply.from.length > 25 || needsUtf8) fields.push(['From', reply.from]);
      if (fields.length > 0) headerSections.push({ offset, fields });
    }

    offset += (1 + textBlocks) * BLOCK_SIZE;
  }

  const msgBytes = concatBytes(blocks);
  const files: Record<string, Uint8Array> = {
    [`${bbsId.toUpperCase()}.MSG`]: msgBytes,
  };
  if (includeHeaders && headerSections.length > 0) {
    const text = serializeHeadersDat(headerSections);
    // If any section is UTF-8-flagged, emit the file as UTF-8; otherwise CP437.
    const anyUtf8 = headerSections.some((s) => s.fields.some(([k]) => k === 'Utf8'));
    files['HEADERS.DAT'] = anyUtf8 ? strToU8(text) : encodeCp437(text);
  }
  // Fixed mtime (ZIP epoch, 1980-01-01) keeps bytes stable across retries so the
  // server de-dupes an identical re-uploaded .REP. mtime 0 (1970) is out of the
  // ZIP date range (1980-2099).
  return zipSync(files, { mtime: ZIP_EPOCH_MS });
}
