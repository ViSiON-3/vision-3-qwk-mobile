/** Minimal UTF-8 encoder (RN/Node safe, no TextEncoder dependency). Used to
 * emit message/reply bodies as UTF-8 when they carry non-CP437 characters and
 * the HEADERS.DAT `Utf8: true` flag is set. Mirrors the decoder in messages.ts. */
export function encodeUtf8(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.codePointAt(i) as number;
    if (cp > 0xffff) i++; // surrogate pair — skip the low surrogate
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  return new Uint8Array(out);
}
