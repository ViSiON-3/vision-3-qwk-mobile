/**
 * Session over the QWK client: "log in once, carry a token". The login is a
 * device login — the server issues a one-time challenge, the paired device key
 * signs it, and the server answers with a `scope: 'device'` token. The token is
 * held in memory (invalidated by a BBS restart); on a 401 the session logs in
 * again and retries once. No password is involved: pairing (see pairing.ts)
 * happened earlier and left `{deviceId, boardId}` on the board record.
 */
import { QwkApiError, QwkAuthError } from './errors';
import { QwkClient } from './qwkApi';
import { DeviceSigner } from './deviceKey';
import { deviceLoginMessage } from './deviceLogin';
import { DownloadProgress, DownloadResult, DownloadToFileResult, PairedDevice, UploadResult } from './types';

export interface DeviceCredentials {
  /** From pairing: identifies this phone's key on the server. */
  deviceId: string;
  /** From pairing: the server's board identity, bound into the signed message. */
  boardId: string;
  signer: DeviceSigner;
}

export class QwkSession {
  private token?: string;

  constructor(
    private readonly client: QwkClient,
    private readonly creds: DeviceCredentials
  ) {}

  get authenticated(): boolean {
    return this.token !== undefined;
  }

  /**
   * Challenge → sign → login/device. A `challenge_invalid` (expired, reused,
   * or a slow network) is retried once with a fresh challenge. A 401
   * `unauthorized` surfaces as QwkDeviceUnpairedError (thrown by the client):
   * the phone must pair again, so it is deliberately not retried here.
   */
  async login(): Promise<void> {
    const { deviceId, boardId, signer } = this.creds;
    const attempt = async () => {
      const { challenge } = await this.client.challenge(deviceId);
      const signature = await signer.sign(deviceLoginMessage(boardId, deviceId, challenge));
      return this.client.loginDevice(deviceId, challenge, signature);
    };
    let result;
    try {
      result = await attempt();
    } catch (err) {
      if (err instanceof QwkApiError && err.code === 'challenge_invalid') result = await attempt();
      else throw err;
    }
    this.token = result.token;
  }

  /** Invalidate the token server-side (best-effort) and forget it locally. */
  async logout(): Promise<void> {
    const token = this.token;
    this.token = undefined;
    if (!token) return;
    try {
      await this.client.logout(token);
    } catch {
      // The token dies with the process anyway; nothing to recover.
    }
  }

  /** Run an authed call; on 401 log in again once and retry. */
  private async withAuth<T>(call: (token: string) => Promise<T>): Promise<T> {
    if (!this.token) await this.login();
    try {
      return await call(this.token!);
    } catch (err) {
      if (err instanceof QwkAuthError) {
        await this.login();
        return await call(this.token!);
      }
      throw err;
    }
  }

  /** True when the packet can be streamed to disk (pinned/native transport). */
  get canStreamToFile(): boolean {
    return this.client.canDownloadToFile;
  }

  download(): Promise<DownloadResult> {
    return this.withAuth((t) => this.client.downloadPacket(t));
  }

  /** Stream the packet straight to `destPath` (no in-memory body). */
  downloadToFile(destPath: string, onProgress?: DownloadProgress): Promise<DownloadToFileResult> {
    return this.withAuth((t) => this.client.downloadPacketToFile(t, destPath, onProgress));
  }

  /** Upload a .REP. Retrying the same bytes is safe — the server de-dupes. */
  upload(rep: Uint8Array): Promise<UploadResult> {
    return this.withAuth((t) => this.client.uploadReply(t, rep));
  }

  /** The account's paired devices; `current` marks this phone. */
  listDevices(): Promise<PairedDevice[]> {
    return this.withAuth((t) => this.client.listDevices(t));
  }

  /** Unpair a device. Unpairing this phone ends this session on the server. */
  unpairDevice(deviceId: string): Promise<void> {
    return this.withAuth((t) => this.client.deleteDevice(t, deviceId));
  }
}
