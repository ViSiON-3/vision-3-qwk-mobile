import { decodeCp437, encodeCp437, isCp437 } from './cp437';

describe('CP437 codec', () => {
  it('round-trips printable ASCII', () => {
    const s = 'Hello, World! 0123456789';
    expect(decodeCp437(encodeCp437(s))).toBe(s);
  });

  it('maps high box-drawing bytes to Unicode', () => {
    // 0xDA ┌  0xC4 ─  0xBF ┐  0xB3 │  0xDB █
    const bytes = new Uint8Array([0xda, 0xc4, 0xbf, 0xb3, 0xdb]);
    expect(decodeCp437(bytes)).toBe('┌─┐│█');
  });

  it('maps the pi byte 0xE3 to π and back', () => {
    expect(decodeCp437(new Uint8Array([0xe3]))).toBe('π');
    expect(Array.from(encodeCp437('π'))).toEqual([0xe3]);
  });

  it('maps C0 control range to CP437 glyphs (☺ ♥ ►)', () => {
    expect(decodeCp437(new Uint8Array([0x01]))).toBe('☺');
    expect(decodeCp437(new Uint8Array([0x03]))).toBe('♥');
    expect(decodeCp437(new Uint8Array([0x10]))).toBe('►');
  });

  it('round-trips high accented + block glyphs', () => {
    const s = 'Ç ü é â ░ ▒ ▓ ß Σ °';
    expect(decodeCp437(encodeCp437(s))).toBe(s);
  });

  it('replaces un-mappable code points with ?', () => {
    // Emoji is outside CP437.
    expect(Array.from(encodeCp437('A\u{1F600}B'.normalize()))).toContain(0x3f);
  });

  it('isCp437 detects representability', () => {
    expect(isCp437('┌── ViSiON/3 ──┐')).toBe(true);
    expect(isCp437('日本語')).toBe(false);
  });

  it('decodes a full 256-byte round trip to bytes', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    const decoded = decodeCp437(all);
    const reencoded = encodeCp437(decoded);
    expect(Array.from(reencoded)).toEqual(Array.from(all));
  });
});
