import { createQwkClient } from './qwkApi';
import { QwkSession } from './session';
import { QwkDeviceUnpairedError } from './errors';
import { scriptedFetch } from './testFetch';
import { fakeSigner } from './testSigner';

const path = (url: string) => url.replace('https://h:8666/api/qwk/', '');
const challenge = { status: 200, json: { challenge: 'c1', expiresAt: 'z' } };
const deviceToken = (token: string) => ({ status: 200, json: { token, expiresAt: 'z', scope: 'device' } });

function session(fetch: ReturnType<typeof scriptedFetch>['fetch'], signer = fakeSigner()) {
  return new QwkSession(createQwkClient({ host: 'h', fetch }), { deviceId: 'dev1', boardId: 'board1', signer });
}

describe('QwkSession (device login)', () => {
  it('logs in by signing the challenge, then reuses the token across calls', async () => {
    const signer = fakeSigner('PUB', 'SIG==');
    const { fetch, calls } = scriptedFetch([
      challenge,
      deviceToken('tok'),
      { status: 204 }, // download
      { status: 204 }, // download
    ]);
    const s = session(fetch, signer);
    expect(s.authenticated).toBe(false);
    await s.download();
    await s.download();
    expect(s.authenticated).toBe(true);
    expect(calls.map((c) => path(c.url))).toEqual(['challenge', 'login/device', 'packet', 'packet']);
    // the signed bytes bind board + device + challenge
    expect(new TextDecoder().decode(signer.signed[0])).toBe('ViSiON/3 QWK API device login v1\nboard1\ndev1\nc1');
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ deviceId: 'dev1', challenge: 'c1', signature: 'SIG==' });
    expect(calls[2].init?.headers?.['Authorization']).toBe('Bearer tok');
  });

  it('fetches a new challenge and retries once on challenge_invalid', async () => {
    const { fetch, calls } = scriptedFetch([
      challenge,
      { status: 401, json: { error: 'challenge_invalid', message: 'stale' } },
      { status: 200, json: { challenge: 'c2', expiresAt: 'z' } },
      deviceToken('tok'),
      { status: 204 },
    ]);
    await session(fetch).download();
    expect(calls.map((c) => path(c.url))).toEqual(['challenge', 'login/device', 'challenge', 'login/device', 'packet']);
    expect(JSON.parse(calls[3].init?.body as string).challenge).toBe('c2');
  });

  it('gives up after a second challenge_invalid', async () => {
    const { fetch, calls } = scriptedFetch([
      challenge,
      { status: 401, json: { error: 'challenge_invalid' } },
      challenge,
      { status: 401, json: { error: 'challenge_invalid' } },
    ]);
    await expect(session(fetch).download()).rejects.toMatchObject({ code: 'challenge_invalid' });
    expect(calls).toHaveLength(4);
  });

  it('surfaces an unpaired device without retrying', async () => {
    const { fetch, calls } = scriptedFetch([challenge, { status: 401, json: { error: 'unauthorized' } }]);
    await expect(session(fetch).download()).rejects.toBeInstanceOf(QwkDeviceUnpairedError);
    expect(calls).toHaveLength(2);
  });

  it('propagates a signer failure (missing key) before calling login/device', async () => {
    const signer = fakeSigner();
    signer.signError = new Error('no key');
    const { fetch, calls } = scriptedFetch([challenge]);
    await expect(session(fetch, signer).download()).rejects.toThrow('no key');
    expect(calls.map((c) => path(c.url))).toEqual(['challenge']);
  });

  it('re-logs-in and retries once on a 401 from an authed call (BBS restart)', async () => {
    const { fetch, calls } = scriptedFetch([
      challenge,
      deviceToken('old'),
      { status: 401, text: 'expired' }, // download -> token gone
      challenge,
      deviceToken('new'),
      { status: 204 }, // retried download
    ]);
    const result = await session(fetch).download();
    expect(result).toEqual({ kind: 'none' });
    expect(calls.map((c) => path(c.url))).toEqual(['challenge', 'login/device', 'packet', 'challenge', 'login/device', 'packet']);
    expect(calls[5].init?.headers?.['Authorization']).toBe('Bearer new');
  });

  it('does not retry on 403 deny codes', async () => {
    const { fetch, calls } = scriptedFetch([
      challenge,
      deviceToken('tok'),
      { status: 403, json: { error: 'device_required', message: 'nope' } },
    ]);
    await expect(session(fetch).upload(new Uint8Array([1]))).rejects.toMatchObject({ code: 'device_required' });
    expect(calls).toHaveLength(3);
  });

  it('propagates a non-auth error without retrying', async () => {
    const { fetch, calls } = scriptedFetch([
      challenge,
      deviceToken('tok'),
      { status: 400, json: { error: 'bad_packet', message: 'nope' } },
    ]);
    await expect(session(fetch).upload(new Uint8Array([1]))).rejects.toMatchObject({ code: 'bad_packet' });
    expect(calls).toHaveLength(3);
  });

  it('lists and unpairs devices through the session token', async () => {
    const list = [{ id: 'dev1', name: 'me', createdAt: 'c', current: true }];
    const { fetch, calls } = scriptedFetch([challenge, deviceToken('tok'), { status: 200, json: list }, { status: 204 }]);
    const s = session(fetch);
    expect(await s.listDevices()).toEqual(list);
    await s.unpairDevice('other');
    expect(calls.map((c) => path(c.url))).toEqual(['challenge', 'login/device', 'devices', 'devices/other']);
    expect(calls[3].init?.method).toBe('DELETE');
  });

  it('logout posts the token once and forgets it; a failure is swallowed', async () => {
    const { fetch, calls } = scriptedFetch([challenge, deviceToken('tok'), { status: 500, text: 'boom' }]);
    const s = session(fetch);
    await s.login();
    await expect(s.logout()).resolves.toBeUndefined();
    expect(s.authenticated).toBe(false);
    expect(calls.map((c) => path(c.url))).toEqual(['challenge', 'login/device', 'logout']);
    expect(calls[2].init?.headers?.['Authorization']).toBe('Bearer tok');
    await s.logout(); // no token: no request
    expect(calls).toHaveLength(3);
  });
});
