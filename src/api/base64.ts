/** Base64 <-> Uint8Array (no Buffer/atob — RN + Node safe). Used to shuttle
 * binary request/response bodies across the native TLS-pinning bridge. */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const REV: Int16Array = (() => {
  const r = new Int16Array(128).fill(-1);
  for (let i = 0; i < CHARS.length; i++) r[CHARS.charCodeAt(i)] = i;
  return r;
})();

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += CHARS[b0 >> 2];
    out += CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

export function fromBase64(str: string): Uint8Array {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | REV[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}
