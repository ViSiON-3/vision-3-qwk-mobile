import { toBase64, fromBase64 } from './base64';

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 255, 1000]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) & 0xff;
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('matches known vectors', () => {
    // "Man" -> "TWFu", "Ma" -> "TWE=", "M" -> "TQ=="
    expect(toBase64(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe('TWFu');
    expect(toBase64(new Uint8Array([0x4d, 0x61]))).toBe('TWE=');
    expect(toBase64(new Uint8Array([0x4d]))).toBe('TQ==');
    expect(Array.from(fromBase64('TWFu'))).toEqual([0x4d, 0x61, 0x6e]);
  });

  it('tolerates whitespace/newlines in input', () => {
    expect(Array.from(fromBase64('TW\nFu'))).toEqual([0x4d, 0x61, 0x6e]);
  });
});
