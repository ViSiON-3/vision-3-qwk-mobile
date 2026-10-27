import { createQwkClient } from './qwkApi';
import { QwkApiError, QwkAuthError, QwkDeviceUnpairedError, QwkRateLimitError } from './errors';
import { scriptedFetch } from './testFetch';

const client = (fetch: ReturnType<typeof scriptedFetch>['fetch']) => createQwkClient({ host: 'bbs.test', fetch });
const last = (url: string) => url.replace('https://bbs.test:8666/api/qwk/', '');

describe('device pairing endpoints', () => {
  it('login passes the scope through', async () => {
    const { fetch } = scriptedFetch([{ status: 200, json: { token: 'p', expiresAt: 'z', scope: 'pair' } }]);
    expect(await client(fetch).login('h', 'pw')).toEqual({ token: 'p', expiresAt: 'z', scope: 'pair' });
  });

  it('login maps 429 locked_out with Retry-After, keeping the code', async () => {
    const { fetch } = scriptedFetch([
      { status: 429, json: { error: 'locked_out', message: 'locked' }, headers: { 'Retry-After': '540' } },
    ]);
    const err = await client(fetch).login('h', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(QwkRateLimitError);
    expect(err.code).toBe('locked_out');
    expect(err.retryAfter).toBe(540);
  });

  it('login maps 403 deny codes to QwkApiError (not retryable auth)', async () => {
    const { fetch } = scriptedFetch([{ status: 403, json: { error: 'intro_pending', message: 'say hi' } }]);
    const err = await client(fetch).login('h', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(QwkApiError);
    expect(err).not.toBeInstanceOf(QwkAuthError);
    expect(err.code).toBe('intro_pending');
  });

  describe('pairDevice', () => {
    it('POSTs name + publicKey with the pair token and returns the ids', async () => {
      const { fetch, calls } = scriptedFetch([{ status: 201, json: { deviceId: 'd1', boardId: 'b1' } }]);
      const r = await client(fetch).pairDevice('pair-tok', 'My phone', 'MFkw…');
      expect(r).toEqual({ deviceId: 'd1', boardId: 'b1' });
      expect(last(calls[0].url)).toBe('devices');
      expect(calls[0].init?.method).toBe('POST');
      expect(calls[0].init?.headers?.['Authorization']).toBe('Bearer pair-tok');
      expect(JSON.parse(calls[0].init?.body as string)).toEqual({ name: 'My phone', publicKey: 'MFkw…' });
    });

    it('maps 409 key_exists / too_many_devices and 400 bad_key to their codes', async () => {
      for (const [status, error] of [
        [409, 'too_many_devices'],
        [409, 'key_exists'],
        [400, 'bad_key'],
        [403, 'password_login_required'],
      ] as const) {
        const { fetch } = scriptedFetch([{ status, json: { error, message: 'x' } }]);
        await expect(client(fetch).pairDevice('t', 'n', 'k')).rejects.toMatchObject({ code: error, status });
      }
    });

    it('treats a 401 as an expired pair token (QwkAuthError)', async () => {
      const { fetch } = scriptedFetch([{ status: 401, json: { error: 'unauthorized' } }]);
      await expect(client(fetch).pairDevice('t', 'n', 'k')).rejects.toBeInstanceOf(QwkAuthError);
    });

    it('rejects a 201 without both ids', async () => {
      const { fetch } = scriptedFetch([{ status: 201, json: { deviceId: 'd1' } }]);
      await expect(client(fetch).pairDevice('t', 'n', 'k')).rejects.toMatchObject({ code: 'bad_response' });
    });
  });

  describe('listDevices / deleteDevice', () => {
    it('GETs the list with the bearer token', async () => {
      const list = [{ id: 'd1', name: 'phone', createdAt: 'c', lastUsed: null, current: true }];
      const { fetch, calls } = scriptedFetch([{ status: 200, json: list }]);
      expect(await client(fetch).listDevices('tok')).toEqual(list);
      expect(last(calls[0].url)).toBe('devices');
      expect(calls[0].init?.method).toBe('GET');
      expect(calls[0].init?.headers?.['Authorization']).toBe('Bearer tok');
    });

    it('DELETEs by id (URL-encoded) and resolves on 204', async () => {
      const { fetch, calls } = scriptedFetch([{ status: 204 }]);
      await expect(client(fetch).deleteDevice('tok', 'a/b')).resolves.toBeUndefined();
      expect(last(calls[0].url)).toBe('devices/a%2Fb');
      expect(calls[0].init?.method).toBe('DELETE');
    });

    it('surfaces 404 (not paired) with the server code and 401 as QwkAuthError', async () => {
      const notFound = scriptedFetch([{ status: 404, json: { error: 'not_found', message: 'no such device' } }]);
      await expect(client(notFound.fetch).deleteDevice('tok', 'x')).rejects.toMatchObject({ code: 'not_found', status: 404 });
      const unauth = scriptedFetch([{ status: 401, text: '' }]);
      await expect(client(unauth.fetch).listDevices('tok')).rejects.toBeInstanceOf(QwkAuthError);
    });
  });

  describe('challenge', () => {
    it('POSTs the device id without a bearer token', async () => {
      const { fetch, calls } = scriptedFetch([{ status: 200, json: { challenge: 'c1', expiresAt: 'z' } }]);
      expect(await client(fetch).challenge('d1')).toEqual({ challenge: 'c1', expiresAt: 'z' });
      expect(last(calls[0].url)).toBe('challenge');
      expect(calls[0].init?.headers?.['Authorization']).toBeUndefined();
      expect(calls[0].init?.headers?.['X-V3-Client']).toBe('vision3-mobile');
      expect(JSON.parse(calls[0].init?.body as string)).toEqual({ deviceId: 'd1' });
    });

    it('maps 429 and 503', async () => {
      const limited = scriptedFetch([{ status: 429, json: { error: 'rate_limited', message: 'slow' }, headers: { 'Retry-After': '7' } }]);
      await expect(client(limited.fetch).challenge('d1')).rejects.toBeInstanceOf(QwkRateLimitError);
      const full = scriptedFetch([{ status: 503, json: { error: 'busy', message: 'store full' } }]);
      await expect(client(full.fetch).challenge('d1')).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('loginDevice', () => {
    it('POSTs deviceId/challenge/signature and returns the device token', async () => {
      const { fetch, calls } = scriptedFetch([{ status: 200, json: { token: 'dev', expiresAt: 'z', scope: 'device' } }]);
      const r = await client(fetch).loginDevice('d1', 'c1', 'sig==');
      expect(r.token).toBe('dev');
      expect(r.scope).toBe('device');
      expect(last(calls[0].url)).toBe('login/device');
      expect(calls[0].init?.headers?.['Authorization']).toBeUndefined();
      expect(JSON.parse(calls[0].init?.body as string)).toEqual({ deviceId: 'd1', challenge: 'c1', signature: 'sig==' });
    });

    it('401 challenge_invalid is a retryable QwkApiError, not an unpaired error', async () => {
      const { fetch } = scriptedFetch([{ status: 401, json: { error: 'challenge_invalid', message: 'stale' } }]);
      const err = await client(fetch).loginDevice('d', 'c', 's').catch((e) => e);
      expect(err).toBeInstanceOf(QwkApiError);
      expect(err).not.toBeInstanceOf(QwkDeviceUnpairedError);
      expect(err.code).toBe('challenge_invalid');
    });

    it('401 unauthorized means the device is no longer paired', async () => {
      const { fetch } = scriptedFetch([{ status: 401, json: { error: 'unauthorized', message: 'nope' } }]);
      await expect(client(fetch).loginDevice('d', 'c', 's')).rejects.toBeInstanceOf(QwkDeviceUnpairedError);
    });

    it('a bare 401 with no body is also treated as unpaired', async () => {
      const { fetch } = scriptedFetch([{ status: 401, text: '' }]);
      await expect(client(fetch).loginDevice('d', 'c', 's')).rejects.toBeInstanceOf(QwkDeviceUnpairedError);
    });

    it('passes 403 deny codes and 429 lockouts through', async () => {
      const denied = scriptedFetch([{ status: 403, json: { error: 'logon_level', message: 'no' } }]);
      await expect(client(denied.fetch).loginDevice('d', 'c', 's')).rejects.toMatchObject({ code: 'logon_level', status: 403 });
      const locked = scriptedFetch([{ status: 429, json: { error: 'locked_out', message: 'locked' }, headers: { 'Retry-After': '60' } }]);
      await expect(client(locked.fetch).loginDevice('d', 'c', 's')).rejects.toMatchObject({ code: 'locked_out', retryAfter: 60 });
    });
  });

  it('logout POSTs with the bearer and resolves on 204', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 204 }]);
    await expect(client(fetch).logout('tok')).resolves.toBeUndefined();
    expect(last(calls[0].url)).toBe('logout');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.headers?.['Authorization']).toBe('Bearer tok');
  });

  it('a pair token on packet surfaces 403 device_required', async () => {
    const { fetch } = scriptedFetch([{ status: 403, json: { error: 'device_required', message: 'pair first' } }]);
    await expect(client(fetch).downloadPacket('pair-tok')).rejects.toMatchObject({ code: 'device_required', status: 403 });
  });
});
