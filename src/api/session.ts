/**
 * Session over the QWK client: "log in once, carry a token" (the HTTP analog of
 * an SSH session). The token is held in memory (invalidated by a BBS restart);
 * on a 401 the session re-logs-in with the stored credentials and retries once.
 * Credentials live on the board record — pass them in per session.
 */
import { QwkAuthError } from './errors';
import { QwkClient } from './qwkApi';
import { DownloadResult, UploadResult } from './types';

export interface Credentials {
  handle: string;
  password: string;
}

export class QwkSession {
  private token?: string;

  constructor(
    private readonly client: QwkClient,
    private readonly creds: Credentials
  ) {}

  get authenticated(): boolean {
    return this.token !== undefined;
  }

  async login(): Promise<void> {
    const result = await this.client.login(this.creds.handle, this.creds.password);
    this.token = result.token;
  }

  /** Run an authed call; on 401 re-login once and retry. */
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

  download(): Promise<DownloadResult> {
    return this.withAuth((t) => this.client.downloadPacket(t));
  }

  /** Upload a .REP. Retrying the same bytes is safe — the server de-dupes. */
  upload(rep: Uint8Array): Promise<UploadResult> {
    return this.withAuth((t) => this.client.uploadReply(t, rep));
  }
}
