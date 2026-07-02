import { createQwkClient } from './qwkApi';
import { QwkSession } from './session';
import { scriptedFetch } from './testFetch';

const creds = { handle: 'zaphod', password: 'pw' };

describe('QwkSession', () => {
  it('logs in once and reuses the token across calls', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, json: { token: 'tok', expiresAt: 'z' } }, // login
      { status: 204 }, // download
      { status: 204 }, // download
    ]);
    const session = new QwkSession(createQwkClient({ host: 'h', fetch }), creds);
    await session.download();
    await session.download();
    // one login + two downloads
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['login', 'packet', 'packet']);
  });

  it('re-logs-in and retries once on a 401', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, json: { token: 'old', expiresAt: 'z' } }, // initial login
      { status: 401, text: 'expired' }, // download -> token invalid (BBS restart)
      { status: 200, json: { token: 'new', expiresAt: 'z' } }, // re-login
      { status: 204 }, // retried download succeeds
    ]);
    const session = new QwkSession(createQwkClient({ host: 'h', fetch }), creds);
    const result = await session.download();
    expect(result).toEqual({ kind: 'none' });
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['login', 'packet', 'login', 'packet']);
    // the retried download uses the refreshed token
    expect(calls[3].init?.headers?.['Authorization']).toBe('Bearer new');
  });

  it('propagates a non-auth error without retrying', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, json: { token: 'tok', expiresAt: 'z' } },
      { status: 400, json: { error: 'bad_packet', message: 'nope' } },
    ]);
    const session = new QwkSession(createQwkClient({ host: 'h', fetch }), creds);
    await expect(session.upload(new Uint8Array([1]))).rejects.toMatchObject({ code: 'bad_packet' });
    expect(calls).toHaveLength(2); // login + one upload attempt, no retry
  });
});
