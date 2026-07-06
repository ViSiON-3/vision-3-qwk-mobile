import { writeAsciiInt, readAsciiInt } from './bytes';

describe('writeAsciiInt', () => {
  it('writes a space-padded decimal that reads back', () => {
    const buf = new Uint8Array(6).fill(0);
    writeAsciiInt(buf, 0, 6, 4096);
    expect(readAsciiInt(buf, 0, 6)).toBe(4096);
  });

  it('throws instead of silently truncating a value wider than the field', () => {
    const buf = new Uint8Array(4);
    // Truncation would write "1234" — a different, wrong number — so fail loudly.
    expect(() => writeAsciiInt(buf, 0, 4, 1234567)).toThrow(/does not fit/);
  });
});
