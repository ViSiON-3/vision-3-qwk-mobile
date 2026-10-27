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
