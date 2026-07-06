import { encodeUtf8, decodeUtf8 } from './utf8';

describe('utf8', () => {
  it('round-trips ASCII, accents, CJK, and emoji (surrogate pairs)', () => {
    for (const s of ['hello', 'café', '日本語', '😀🎉', 'mix é 日 😀 end', '']) {
      expect(decodeUtf8(encodeUtf8(s))).toBe(s);
    }
  });

  it('encodes an unpaired surrogate as U+FFFD (valid UTF-8, not garbage)', () => {
    expect(decodeUtf8(encodeUtf8('a\uD83Db'))).toBe('a�b'); // lone high surrogate
    expect(decodeUtf8(encodeUtf8('x\uDC00y'))).toBe('x�y'); // lone low surrogate
  });

  it('decodes malformed input as U+FFFD and resyncs at the next byte', () => {
    // 3-byte lead followed by ASCII instead of continuation bytes.
    expect(decodeUtf8(new Uint8Array([0x41, 0xe6, 0x41]))).toBe('A�A');
    // Stray continuation byte, then valid ASCII.
    expect(decodeUtf8(new Uint8Array([0x80, 0x41]))).toBe('�A');
    // Truncated 2-byte sequence at end of buffer.
    expect(decodeUtf8(new Uint8Array([0xc3]))).toBe('�');
  });
});
