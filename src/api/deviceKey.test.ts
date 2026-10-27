import { createNativeDeviceSigner, deviceKeyAlias, DeviceKeyUnavailableError } from './deviceKey';

// In Node/jest there is no native module: generate/sign must fail loudly with
// the "needs a dev build" error, while delete stays a harmless no-op.
describe('deviceKey (no native module)', () => {
  it('builds a keychain-safe alias per board', () => {
    expect(deviceKeyAlias('bx1')).toBe('v3qwk_devkey_bx1');
    expect(deviceKeyAlias('a b/c')).toBe('v3qwk_devkey_a_b_c');
  });

  it('generate/sign reject with DeviceKeyUnavailableError; delete resolves', async () => {
    const s = createNativeDeviceSigner(deviceKeyAlias('b1'));
    await expect(s.generate()).rejects.toBeInstanceOf(DeviceKeyUnavailableError);
    await expect(s.sign(new Uint8Array([1]))).rejects.toBeInstanceOf(DeviceKeyUnavailableError);
    await expect(s.delete()).resolves.toBeUndefined();
  });
});

import * as native from '../native/QwkTls';
import type { NativeQwkTls } from '../native/QwkTls';
import { DeviceKeyMissingError } from './deviceKey';

describe('deviceKey (with a native module)', () => {
  afterEach(() => jest.restoreAllMocks());

  const stub = (over: Partial<NativeQwkTls>): NativeQwkTls =>
    ({
      request: jest.fn(),
      getFingerprint: jest.fn(),
      downloadToFile: jest.fn(),
      addListener: jest.fn(),
      generateDeviceKey: jest.fn().mockResolvedValue({ publicKey: 'SPKI', algorithm: 'P-256', hardwareBacked: true }),
      signWithDeviceKey: jest.fn().mockResolvedValue('SIG'),
      hasDeviceKey: jest.fn().mockResolvedValue(true),
      deleteDeviceKey: jest.fn().mockResolvedValue(undefined),
      ...over,
    }) as NativeQwkTls;

  it('generate returns the SPKI; sign passes the message as base64 under the alias', async () => {
    const n = stub({});
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(n);
    const s = createNativeDeviceSigner('v3qwk_devkey_b1');
    expect(await s.generate()).toBe('SPKI');
    expect(await s.sign(new Uint8Array([104, 105]))).toBe('SIG');
    expect(n.signWithDeviceKey).toHaveBeenCalledWith('v3qwk_devkey_b1', 'aGk=');
    await s.delete();
    expect(n.deleteDeviceKey).toHaveBeenCalledWith('v3qwk_devkey_b1');
  });

  it('maps the native QWK_KEY_MISSING rejection to DeviceKeyMissingError', async () => {
    const err = Object.assign(new Error('no key'), { code: 'QWK_KEY_MISSING' });
    jest.spyOn(native, 'getNativeQwkTls').mockReturnValue(stub({ signWithDeviceKey: jest.fn().mockRejectedValue(err) }));
    await expect(createNativeDeviceSigner('a').sign(new Uint8Array([1]))).rejects.toBeInstanceOf(DeviceKeyMissingError);
  });
});
