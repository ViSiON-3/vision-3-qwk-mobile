import { msbinToInt, parseNdx } from './ndx';

describe('MSBIN conversion', () => {
  it.each([
    [[0x00, 0x00, 0x00, 0x81], 1],
    [[0x00, 0x00, 0x00, 0x82], 2],
    [[0x00, 0x00, 0x40, 0x82], 3],
    [[0x00, 0x00, 0x00, 0x83], 4],
  ])('converts %j -> %i (block number)', (bytes, expected) => {
    const [b0, b1, b2, b3] = bytes as number[];
    expect(msbinToInt(b0, b1, b2, b3)).toBe(expected);
  });

  it('treats exponent 0 as zero', () => {
    expect(msbinToInt(0xff, 0xff, 0xff, 0x00)).toBe(0);
  });
});

describe('parseNdx', () => {
  it('parses 5-byte records into block/byteOffset/conference', () => {
    // block 2 (first real message) in conference 0, then block 4 in conf 1.
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x82, 0x00, // -> block 2, conf 0
      0x00, 0x00, 0x00, 0x83, 0x01, // -> block 4, conf 1
    ]);
    const recs = parseNdx(bytes);
    expect(recs).toEqual([
      { block: 2, byteOffset: 128, conference: 0 },
      { block: 4, byteOffset: 384, conference: 1 },
    ]);
  });

  it('skips zero pointers', () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 0, 0x00, 0x00, 0x00, 0x82, 0x00]);
    expect(parseNdx(bytes)).toHaveLength(1);
  });
});
