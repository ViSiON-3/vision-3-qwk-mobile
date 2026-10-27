import { createQwkClient } from './qwkApi';
import { pairDevice, loginForPairing } from './pairing';
import { QwkAuthError, QwkRateLimitError } from './errors';
import { scriptedFetch } from './testFetch';
import { fakeSigner } from './testSigner';

const path = (url: string) => url.replace('https://h:8666/api/qwk/', '');
const client = (fetch: ReturnType<typeof scriptedFetch>['fetch']) => createQwkClient({ host: 'h', fetch });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('pairing', () => {
  it('logs in with the password, generates a key, registers it, and logs the pair token out', async () => {
    const signer = fakeSigner('SPKI==');
    const { fetch, calls } = scriptedFetch([
      { status: 200, json: { token: 'pair', expiresAt: 'z', scope: 'pair' } },
      { status: 201, json: { deviceId: 'd1', boardId: 'b1' } },
      { status: 204 }, // logout
    ]);
    const r = await pairDevice(client(fetch), { handle: 'zaphod', password: 'pw', deviceName: 'iPhone', signer });
    await flush();
    expect(r).toEqual({ deviceId: 'd1', boardId: 'b1' });
    expect(signer.generated).toBe(1);
    expect(calls.map((c) => path(c.url))).toEqual(['login', 'devices', 'logout']);
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ handle: 'zaphod', password: 'pw' });
    expect(calls[1].init?.headers?.['Authorization']).toBe('Bearer pair');
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ name: 'iPhone', publicKey: 'SPKI==' });
    expect(calls[2].init?.headers?.['Authorization']).toBe('Bearer pair');
  });

  it('does not generate a key when the password is wrong', async () => {
    const signer = fakeSigner();
    const { fetch, calls } = scriptedFetch([{ status: 401, json: { error: 'unauthorized' } }]);
    await expect(pairDevice(client(fetch), { handle: 'h', password: 'x', deviceName: 'n', signer })).rejects.toBeInstanceOf(
      QwkAuthError
    );
    expect(signer.generated).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('surfaces a lockout with its Retry-After', async () => {
    const { fetch } = scriptedFetch([
      { status: 429, json: { error: 'locked_out', message: 'locked' }, headers: { 'Retry-After': '120' } },
    ]);
    const err = await loginForPairing(client(fetch), 'h', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(QwkRateLimitError);
    expect(err).toMatchObject({ code: 'locked_out', retryAfter: 120 });
  });

  it('passes registration errors through (too many devices) and still logs out', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, json: { token: 'pair', expiresAt: 'z', scope: 'pair' } },
      { status: 409, json: { error: 'too_many_devices', message: 'limit' } },
      { status: 204 },
    ]);
    await expect(
      pairDevice(client(fetch), { handle: 'h', password: 'pw', deviceName: 'n', signer: fakeSigner() })
    ).rejects.toMatchObject({ code: 'too_many_devices' });
    await flush();
    expect(calls.map((c) => path(c.url))).toEqual(['login', 'devices', 'logout']);
  });
});
