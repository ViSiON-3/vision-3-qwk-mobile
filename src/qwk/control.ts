/**
 * CONTROL.DAT parser.
 *
 * Plain CP437 text, CRLF lines. Fixed leading lines, then a variable conference
 * directory (line 11 holds conferenceCount - 1), then up to three screen-file
 * names. Anything after the screen files is door-specific and ignored.
 */
import { decodeCp437 } from './cp437';
import { ControlDat, QwkConference } from './types';

// Split on raw newline BYTES before decoding: CP437 maps byte 0x0A to the glyph
// ◙, so decoding first would erase line breaks in a text file.
function splitLines(bytes: Uint8Array): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === 0x0a) {
      let end = i;
      if (end > start && bytes[end - 1] === 0x0d) end--; // strip CR
      lines.push(decodeCp437(bytes.subarray(start, end)));
      start = i + 1;
    }
  }
  // A trailing newline yields one empty final element; drop it to match a plain
  // split() on content that ends with a line terminator.
  if (lines.length > 0 && lines[lines.length - 1] === '' && bytes.length > 0 && bytes[bytes.length - 1] === 0x0a) {
    lines.pop();
  }
  return lines;
}

export function parseControlDat(bytes: Uint8Array): ControlDat {
  const lines = splitLines(bytes);
  const line = (i: number): string => (i < lines.length ? lines[i] : '');

  const serialBbs = line(4);
  const commaIdx = serialBbs.indexOf(',');
  const serial = commaIdx >= 0 ? serialBbs.slice(0, commaIdx).trim() : '';
  const bbsId = (commaIdx >= 0 ? serialBbs.slice(commaIdx + 1) : serialBbs).trim();

  // Line 11 (index 10) = highest conference index = conferenceCount - 1.
  const highestIdx = parseInt(line(10).trim(), 10);
  const conferenceCount = Number.isFinite(highestIdx) && highestIdx >= 0 ? highestIdx + 1 : 0;

  const conferences: QwkConference[] = [];
  let cursor = 11; // first pair line (index)
  for (let i = 0; i < conferenceCount; i++) {
    const num = parseInt(line(cursor).trim(), 10);
    const name = line(cursor + 1).trim();
    conferences.push({ number: Number.isFinite(num) ? num : i, name });
    cursor += 2;
  }

  const welcomeFile = line(cursor).trim() || undefined;
  const newsFile = line(cursor + 1).trim() || undefined;
  const goodbyeFile = line(cursor + 2).trim() || undefined;

  return {
    bbsName: line(0).trim(),
    city: line(1).trim(),
    phone: line(2).trim(),
    sysop: line(3).trim(),
    serial,
    bbsId,
    createdAt: line(5).trim(),
    username: line(6).trim(),
    conferences,
    welcomeFile,
    newsFile,
    goodbyeFile,
  };
}
