/**
 * The device's login key. The private half lives in the native module (Secure
 * Enclave / Android Keystore) and never crosses the bridge: JS asks for the
 * public key once (to pair) and for signatures (to log in). The interface is
 * injectable so sessions are unit-testable with a fake signer.
 */
import { toBase64 } from './base64';
import { getNativeQwkTls } from '../native/QwkTls';

export interface DeviceSigner {
  /** Create a fresh key pair (replacing any previous one) and return the
   * public key as base64 DER SubjectPublicKeyInfo. */
  generate(): Promise<string>;
  /** Sign `message` (ECDSA over SHA-256, DER) and return the signature, base64. */
  sign(message: Uint8Array): Promise<string>;
  /** Forget the key (best-effort; resolves when it was already gone). */
  delete(): Promise<void>;
}

export class DeviceKeyUnavailableError extends Error {
  constructor() {
    super('Device pairing needs a development build — not available in Expo Go.');
    this.name = 'DeviceKeyUnavailableError';
  }
}

/** Thrown by `sign` when the key is gone (reinstall, keychain wipe, Forget pairing). */
export class DeviceKeyMissingError extends Error {
  constructor() {
    super('This phone no longer has its login key — pair again.');
    this.name = 'DeviceKeyMissingError';
  }
}

// Keystore/keychain aliases: keep to [A-Za-z0-9._-] like the SecureStore keys.
export const deviceKeyAlias = (boardId: string) => `v3qwk_devkey_${boardId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

function isMissingKeyError(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === 'QWK_KEY_MISSING' || code === 'ERR_QWK_KEY_MISSING';
}

/** A signer backed by the native module's key under `alias`. */
export function createNativeDeviceSigner(alias: string): DeviceSigner {
  const native = () => {
    const n = getNativeQwkTls();
    if (!n) throw new DeviceKeyUnavailableError();
    return n;
  };
  return {
    async generate() {
      const info = await native().generateDeviceKey(alias);
      return info.publicKey;
    },
    async sign(message) {
      try {
        return await native().signWithDeviceKey(alias, toBase64(message));
      } catch (e) {
        if (isMissingKeyError(e)) throw new DeviceKeyMissingError();
        throw e;
      }
    },
    async delete() {
      const n = getNativeQwkTls();
      if (!n) return; // nothing could have been stored without the module
      try {
        await n.deleteDeviceKey(alias);
      } catch {
        /* best-effort */
      }
    },
  };
}
