import { normalizeFingerprint, isValidFingerprint, formatFingerprint } from './fingerprint';

// The live BBS cert fingerprint captured during validation.
const REAL = '44:F8:BB:EC:92:61:74:4A:E3:D9:FA:11:63:66:74:48:94:2A:90:89:0D:DE:FE:8C:A4:05:E3:BE:43:0D:F8:AF';

describe('fingerprint', () => {
  it('normalizes separators and case', () => {
    expect(normalizeFingerprint(REAL)).toBe('44F8BBEC9261744AE3D9FA1163667448942A90890DDEFE8CA405E3BE430DF8AF');
    expect(normalizeFingerprint('aa:bb cc')).toBe('AABBCC');
  });

  it('validates a full SHA-256', () => {
    expect(isValidFingerprint(REAL)).toBe(true);
    expect(isValidFingerprint(REAL.toLowerCase())).toBe(true);
    expect(isValidFingerprint('44:F8:BB')).toBe(false); // too short
    expect(isValidFingerprint('')).toBe(false);
  });

  it('formats bare hex back to colon-grouped pairs', () => {
    expect(formatFingerprint('44F8BBEC')).toBe('44:F8:BB:EC');
    expect(formatFingerprint(REAL)).toBe(REAL);
  });
});
