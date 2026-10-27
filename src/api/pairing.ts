/**
 * Pairing: the one time the password is used. Log in for a `pair` token,
 * generate a fresh device key, register its public half, and hand back the ids
 * the device login will sign over. The caller drops the password afterwards;
 * nothing here stores it.
 */
import { QwkClient } from './qwkApi';
import { DeviceSigner } from './deviceKey';
import { PairResult } from './types';

export interface PairRequest {
  handle: string;
  password: string;
  /** Shown in the account's device list (server trims to 64 chars). */
  deviceName: string;
  signer: DeviceSigner;
}

/** A password login's token, for the devices endpoints only (10-minute life). */
export interface PairToken {
  token: string;
  expiresAt: string;
}

/** Password login → pair-scoped token. Throws QwkAuthError on bad credentials,
 * QwkRateLimitError (`locked_out`) and QwkApiError (`logon_level`,
 * `intro_pending`) as the server reports them. */
export async function loginForPairing(client: QwkClient, handle: string, password: string): Promise<PairToken> {
  const r = await client.login(handle, password);
  return { token: r.token, expiresAt: r.expiresAt };
}

/**
 * Pair this device. Always generates a *new* key: a re-pair after a password
 * change (which voids every device) must not depend on the old registration,
 * and a fresh key can never collide with a stale `key_exists`. The pair token
 * is logged out afterwards (best-effort) — it has done its only job.
 */
export async function pairDevice(client: QwkClient, req: PairRequest): Promise<PairResult> {
  const { token } = await loginForPairing(client, req.handle, req.password);
  try {
    const publicKey = await req.signer.generate();
    return await client.pairDevice(token, req.deviceName, publicKey);
  } finally {
    client.logout(token).catch(() => undefined);
  }
}
