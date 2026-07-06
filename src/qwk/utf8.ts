/** Minimal UTF-8 decoder (RN/Node safe, no TextDecoder dependency). Shared by
 * the HEADERS.DAT parser and the message-body reader; invalid bytes → U+FFFD. */
export function decodeUtf8(bytes: Uint8Array): string {
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
      out += String.fromCodePoint(
        ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
      );
    } else {
      out += '�';
    }
  }
  return out;
}

/** Minimal UTF-8 encoder (RN/Node safe, no TextEncoder dependency). Used to
 * emit message/reply bodies as UTF-8 when they carry non-CP437 characters and
 * the HEADERS.DAT `Utf8: true` flag is set. Inverse of {@link decodeUtf8}. */
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
