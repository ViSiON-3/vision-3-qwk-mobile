import { probeServerFingerprint, createPinnedDownloadToFile, PinningUnavailableError } from './pinnedFetch';
import { toBase64 } from './base64';
import * as native from '../native/QwkTls';
import type { NativeQwkTls } from '../native/QwkTls';

/** A complete NativeQwkTls stub; override just what a test needs. */
function fakeNative(overrides: Partial<NativeQwkTls> = {}): NativeQwkTls {
  return {
    request: jest.fn(),
    getFingerprint: jest.fn(),
    downloadToFile: jest.fn(),
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    ...overrides,
  };
}

const FP = 'ee:04:35:d6'; // any-format fingerprint; normalized internally

describe('probeServerFingerprint', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws PinningUnavailableError when there is no native module', async () => {
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(null);
    await expect(probeServerFingerprint('192.0.2.10', 8666)).rejects.toBeInstanceOf(PinningUnavailableError);
  });

  it('normalizes the native fingerprint (strips separators, up-cases)', async () => {
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(
      fakeNative({ getFingerprint: jest.fn().mockResolvedValue('ee:04:35:d6') })
    );
    await expect(probeServerFingerprint('host', 8666)).resolves.toBe('EE0435D6');
  });

  it('passes host and port through to the native probe', async () => {
    const getFingerprint = jest.fn().mockResolvedValue('AABB');
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(fakeNative({ getFingerprint }));
    await probeServerFingerprint('bbs.example.net', 9999);
    expect(getFingerprint).toHaveBeenCalledWith('bbs.example.net', 9999);
  });
});

describe('createPinnedDownloadToFile', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws PinningUnavailableError without a native module', async () => {
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(null);
    await expect(createPinnedDownloadToFile(FP)('https://x/packet', {}, '/tmp/p.qwk')).rejects.toBeInstanceOf(
      PinningUnavailableError
    );
  });

  it('streams to destPath and returns status + headers (200, body stays on disk)', async () => {
    const downloadToFile = jest.fn().mockResolvedValue({
      status: 200,
      headers: { 'X-QWK-Messages': '7' },
      bytesWritten: 4096,
    });
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(fakeNative({ downloadToFile }));

    const res = await createPinnedDownloadToFile(FP)(
      'https://bbs/packet',
      { method: 'GET', headers: { Authorization: 'Bearer t' } },
      '/tmp/p.qwk'
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-qwk-messages')).toBe('7'); // case-insensitive
    const [opts, destPath] = downloadToFile.mock.calls[0];
    expect(opts).toMatchObject({ url: 'https://bbs/packet', method: 'GET', pinnedSha256: 'EE0435D6' });
    expect(destPath).toBe('/tmp/p.qwk');
  });

  it('forwards native progress events for its own request id only', async () => {
    let emit: (p: { id: string; written: number; total: number }) => void = () => {};
    const addListener = jest.fn((_event, cb) => {
      emit = cb;
      return { remove: jest.fn() };
    });
    const downloadToFile = jest.fn(async (_o: unknown, _d: unknown, requestId: string) => {
      emit({ id: 'other', written: 1, total: 2 }); // different call — ignored
      emit({ id: requestId, written: 50, total: 100 });
      return { status: 200, headers: {} };
    });
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(fakeNative({ addListener, downloadToFile }));

    const seen: Array<[number, number]> = [];
    await createPinnedDownloadToFile(FP)('https://bbs/packet', {}, '/tmp/p.qwk', (w, t) => seen.push([w, t]));
    expect(seen).toEqual([[50, 100]]);
  });

  it('exposes the small body for non-200 (error mapping)', async () => {
    const body = toBase64(new TextEncoder().encode(JSON.stringify({ error: 'bad', message: 'nope' })));
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(
      fakeNative({
        downloadToFile: jest.fn().mockResolvedValue({ status: 400, headers: {}, bodyBase64: body }),
      })
    );
    const res = await createPinnedDownloadToFile(FP)('https://bbs/packet', {}, '/tmp/p.qwk');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'bad', message: 'nope' });
  });
});
