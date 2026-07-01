/**
 * Synchronet HEADERS.DAT (QWKE extended headers).
 *
 * INI-style text. Each `[<hexOffset>]` section is keyed by the byte offset, in
 * hex, of a message's 128-byte header block within MESSAGES.DAT (first real
 * message = offset 128 = `[80]`). Sections carry full-length To/From/Subject,
 * Message-ID/In-Reply-To threading, and a Utf8 flag.
 *
 * Parsed at the byte level so structural chars (`[ ] : = CRLF`, all ASCII) are
 * safe regardless of whether a given message's values are CP437 or UTF-8.
 */
import { decodeCp437 } from './cp437';

/** A parsed section: field name -> value. Keys preserve original case. */
export type HeaderSection = Record<string, string>;

/** Minimal UTF-8 decoder (RN-safe; no TextDecoder dependency). */
function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc0 && b < 0xe0 && i < bytes.length) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xe0 && b < 0xf0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xf0 && i + 2 < bytes.length) {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    } else {
      out += '�';
    }
  }
  return out;
}

interface RawField {
  key: string;
  /** Raw value bytes (encoding decided per-section by the Utf8 flag). */
  value: Uint8Array;
  /** True when parsed from `key:` (trailing whitespace significant). */
  colon: boolean;
}

function trimTrailingCr(line: Uint8Array): Uint8Array {
  if (line.length > 0 && line[line.length - 1] === 0x0d) return line.subarray(0, line.length - 1);
  return line;
}

function isBlank(line: Uint8Array): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== 0x20 && line[i] !== 0x09) return false;
  }
  return true;
}

/** Parse HEADERS.DAT into a map of header-block byte offset -> fields. */
export function parseHeadersDat(bytes: Uint8Array): Map<number, HeaderSection> {
  const result = new Map<number, HeaderSection>();
  let currentOffset: number | null = null;
  let raws: RawField[] = [];

  const flush = () => {
    if (currentOffset === null) return;
    // Decide encoding from the Utf8 field (ASCII value).
    let utf8 = false;
    for (const f of raws) {
      if (f.key.toLowerCase() === 'utf8') {
        utf8 = decodeCp437(f.value).trim().toLowerCase() === 'true';
        break;
      }
    }
    const section: HeaderSection = {};
    for (const f of raws) {
      section[f.key] = utf8 ? utf8Decode(f.value) : decodeCp437(f.value);
    }
    result.set(currentOffset, section);
  };

  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i !== bytes.length && bytes[i] !== 0x0a) continue;
    const line = trimTrailingCr(bytes.subarray(start, i));
    start = i + 1;
    if (isBlank(line)) continue;

    // Section header: first non-space is '[' and a ']' follows.
    let p = 0;
    while (p < line.length && line[p] === 0x20) p++;
    if (line[p] === 0x5b /* [ */) {
      const close = line.indexOf(0x5d /* ] */, p);
      if (close > p) {
        flush();
        const hex = decodeCp437(line.subarray(p + 1, close)).trim();
        currentOffset = parseInt(hex, 16);
        raws = [];
        continue;
      }
    }

    if (currentOffset === null) continue; // stray line before any section

    // key : value (preferred) or key = value.
    let sep = line.indexOf(0x3a /* : */);
    let colon = true;
    const eq = line.indexOf(0x3d /* = */);
    if (sep === -1 || (eq !== -1 && eq < sep)) {
      sep = eq;
      colon = false;
    }
    if (sep === -1) continue;

    const key = decodeCp437(line.subarray(0, sep)).trim();
    let valStart = sep + 1;
    let valEnd = line.length;
    if (colon) {
      if (valStart < valEnd && line[valStart] === 0x20) valStart++; // one leading space
    } else {
      while (valStart < valEnd && (line[valStart] === 0x20 || line[valStart] === 0x09)) valStart++;
      while (valEnd > valStart && (line[valEnd - 1] === 0x20 || line[valEnd - 1] === 0x09)) valEnd--;
    }
    raws.push({ key, value: line.subarray(valStart, valEnd), colon });
  }
  flush();
  return result;
}

/** Case-insensitive field lookup within a section. */
export function getHeaderField(section: HeaderSection | undefined, name: string): string | undefined {
  if (!section) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(section)) {
    if (k.toLowerCase() === lower) return section[k];
  }
  return undefined;
}

/**
 * Serialize sections for a .REP HEADERS.DAT. Each entry keys off the byte offset
 * of the reply's header block within the .MSG file. Fields emit as `Key: value`
 * (colon form) so trailing whitespace is preserved. Lines are CRLF-terminated.
 */
export function serializeHeadersDat(
  sections: { offset: number; fields: Array<[string, string]> }[]
): string {
  const parts: string[] = [];
  for (const s of sections) {
    parts.push(`[${s.offset.toString(16)}]\r\n`);
    for (const [key, value] of s.fields) {
      parts.push(`${key}: ${value}\r\n`);
    }
    parts.push('\r\n');
  }
  return parts.join('');
}
