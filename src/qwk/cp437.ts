/**
 * IBM Code Page 437 <-> Unicode codec.
 *
 * QWK/REP packets store all text as single-byte CP437 (unless a message is
 * explicitly flagged UTF-8 via HEADERS.DAT). This module maps every one of the
 * 256 byte values to its canonical CP437 glyph, including the C0 control range
 * (0x00-0x1F), which CP437 renders as graphic characters used heavily in BBS
 * art. Keeping those glyphs is what preserves CP437 line art / signatures.
 *
 * Pure JS + Uint8Array only — no Node Buffer / TextDecoder — so it runs
 * unchanged on React Native.
 */

// C0 control range (0x00-0x1F) rendered as CP437 graphic glyphs.
const C0 = [
  0x0000, 0x263a, 0x263b, 0x2665, 0x2666, 0x2663, 0x2660, 0x2022, 0x25d8,
  0x25cb, 0x25d9, 0x2642, 0x2640, 0x266a, 0x266b, 0x263c, 0x25ba, 0x25c4,
  0x2195, 0x203c, 0x00b6, 0x00a7, 0x25ac, 0x21a8, 0x2191, 0x2193, 0x2192,
  0x2190, 0x221f, 0x2194, 0x25b2, 0x25bc,
];

// High range 0x80-0xFF (accented letters, box drawing, blocks, Greek, math).
const HIGH = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7, 0x00ea,
  0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5, 0x00c9, 0x00e6,
  0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9, 0x00ff, 0x00d6, 0x00dc,
  0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192, 0x00e1, 0x00ed, 0x00f3, 0x00fa,
  0x00f1, 0x00d1, 0x00aa, 0x00ba, 0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc,
  0x00a1, 0x00ab, 0x00bb, 0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561,
  0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b,
  0x2510, 0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567, 0x2568,
  0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b, 0x256a, 0x2518,
  0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580, 0x03b1, 0x00df, 0x0393,
  0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4, 0x03a6, 0x0398, 0x03a9, 0x03b4,
  0x221e, 0x03c6, 0x03b5, 0x2229, 0x2261, 0x00b1, 0x2265, 0x2264, 0x2320,
  0x2321, 0x00f7, 0x2248, 0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2,
  0x25a0, 0x00a0,
];

/** byte value -> Unicode code point (length 256). */
const DECODE: number[] = (() => {
  const t = new Array<number>(256);
  for (let i = 0; i < 32; i++) t[i] = C0[i];
  for (let i = 32; i < 127; i++) t[i] = i; // printable ASCII
  t[127] = 0x2302; // ⌂
  for (let i = 128; i < 256; i++) t[i] = HIGH[i - 128];
  return t;
})();

/** Unicode code point -> byte value. */
const ENCODE: Map<number, number> = (() => {
  const m = new Map<number, number>();
  for (let i = 0; i < 256; i++) {
    if (!m.has(DECODE[i])) m.set(DECODE[i], i);
  }
  // Let ASCII C0 control code points (TAB/CR/LF/etc.) pass through as their own
  // byte values. CP437 renders bytes 0x00-0x1F as graphic glyphs (☺♥◙♪...) —
  // those glyphs keep their encode mappings above — but text files (CONTROL.DAT,
  // HEADERS.DAT) and body EOL handling rely on real control bytes surviving a
  // Unicode -> CP437 encode. These entries are additive (distinct code points).
  for (let i = 0; i < 0x20; i++) {
    if (!m.has(i)) m.set(i, i);
  }
  m.set(0x7f, 0x7f);
  return m;
})();

/** Decode CP437 bytes to a Unicode string. */
export function decodeCp437(bytes: Uint8Array): string {
  let out = '';
  // Chunk to avoid apply() stack limits on very large bodies.
  const CHUNK = 0x2000;
  const buf = new Array<number>(Math.min(CHUNK, bytes.length));
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    const len = end - start;
    for (let i = 0; i < len; i++) buf[i] = DECODE[bytes[start + i]];
    out += String.fromCharCode.apply(null, len === buf.length ? buf : buf.slice(0, len));
  }
  return out;
}

/**
 * Encode a Unicode string to CP437 bytes. Code points with no CP437
 * representation are replaced with `fallback` (default '?').
 */
export function encodeCp437(str: string, fallback = 0x3f): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    const b = ENCODE.get(cp);
    out[i] = b === undefined ? fallback : b;
  }
  return out;
}

/** True if every character of `str` can be represented in CP437. */
export function isCp437(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (!ENCODE.has(str.charCodeAt(i))) return false;
  }
  return true;
}
