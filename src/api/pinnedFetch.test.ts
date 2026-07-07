import { probeServerFingerprint, PinningUnavailableError } from './pinnedFetch';
import * as native from '../native/QwkTls';

describe('probeServerFingerprint', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws PinningUnavailableError when there is no native module', async () => {
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(null);
    await expect(probeServerFingerprint('192.168.1.219', 8666)).rejects.toBeInstanceOf(
      PinningUnavailableError
    );
  });

  it('normalizes the native fingerprint (strips separators, up-cases)', async () => {
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue({
      request: jest.fn(),
      getFingerprint: jest.fn().mockResolvedValue('ee:04:35:d6'),
    });
    await expect(probeServerFingerprint('host', 8666)).resolves.toBe('EE0435D6');
  });

  it('passes host and port through to the native probe', async () => {
    const getFingerprint = jest.fn().mockResolvedValue('AABB');
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue({ request: jest.fn(), getFingerprint });
    await probeServerFingerprint('bbs.example.net', 9999);
    expect(getFingerprint).toHaveBeenCalledWith('bbs.example.net', 9999);
  });
});
