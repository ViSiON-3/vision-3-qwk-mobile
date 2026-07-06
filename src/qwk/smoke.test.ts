import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

describe('toolchain smoke test', () => {
  it('runs TypeScript tests under babel-jest', () => {
    const answer: number = 6 * 7;
    expect(answer).toBe(42);
  });

  it('can round-trip a zip with fflate (RN-compatible)', () => {
    const zipped = zipSync({ 'HELLO.TXT': strToU8('CONNECT 57600') });
    const back = unzipSync(zipped);
    expect(strFromU8(back['HELLO.TXT'])).toBe('CONNECT 57600');
  });
});
