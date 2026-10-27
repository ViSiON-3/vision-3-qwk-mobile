/** Test helper: a scripted DeviceSigner that records what it signed (not a test suite). */
import { DeviceSigner } from './deviceKey';

export interface FakeSigner extends DeviceSigner {
  signed: Uint8Array[];
  generated: number;
  deleted: number;
  /** When set, `sign` rejects with it. */
  signError?: Error;
}

export function fakeSigner(publicKey = 'PUBKEY', signature = 'SIG'): FakeSigner {
  const s: FakeSigner = {
    signed: [],
    generated: 0,
    deleted: 0,
    async generate() {
      s.generated += 1;
      return publicKey;
    },
    async sign(message) {
      if (s.signError) throw s.signError;
      s.signed.push(message);
      return signature;
    },
    async delete() {
      s.deleted += 1;
    },
  };
  return s;
}
