/** Minimal UTF-8 decoder (RN/Node safe, no TextDecoder dependency). Shared by
 * the HEADERS.DAT parser and the message-body reader. Parses external, possibly
 * corrupt packet data, so malformed input (bad lead byte, missing/short
 * continuation bytes, overlong/out-of-range sequences) resyncs at the next byte
 * and emits U+FFFD rather than silently decoding to the wrong character. */
export function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  const cont = (idx: number): boolean => idx < bytes.length && (bytes[idx] & 0xc0) === 0x80;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc2 && b < 0xe0 && cont(i)) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xe0 && b < 0xf0 && cont(i) && cont(i + 1)) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else if (b >= 0xf0 && b < 0xf5 && cont(i) && cont(i + 1) && cont(i + 2)) {
      out += String.fromCodePoint(
        ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)
      );
    } else {
      out += '�'; // invalid lead / truncated sequence — resync at next byte
    }
  }
  return out;
}

/** Minimal UTF-8 encoder (RN/Node safe, no TextEncoder dependency). Used to
 * emit message/reply bodies as UTF-8 when they carry non-CP437 characters and
 * the HEADERS.DAT `Utf8: true` flag is set. Inverse of {@link decodeUtf8}; a
 * lone/unpaired surrogate is emitted as U+FFFD rather than invalid UTF-8. */
export function encodeUtf8(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const low = str.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i++;
      } else {
        cp = 0xfffd; // unpaired high surrogate
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd; // unpaired low surrogate
    }
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
