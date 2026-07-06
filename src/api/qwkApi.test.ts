import { createQwkClient } from './qwkApi';
import { QwkApiError, QwkAuthError, QwkRateLimitError } from './errors';
import { scriptedFetch } from './testFetch';

const config = (fetch: ReturnType<typeof scriptedFetch>['fetch']) => ({ host: 'bbs.test', port: 8666, fetch });

describe('createQwkClient', () => {
  it('builds the base URL', () => {
    const { fetch } = scriptedFetch([]);
    expect(createQwkClient(config(fetch)).baseUrl).toBe('https://bbs.test:8666/api/qwk/');
  });

  describe('login', () => {
    it('sends X-V3-Client and returns the token', async () => {
      const { fetch, calls } = scriptedFetch([{ status: 200, json: { token: 'tok', expiresAt: '2026-07-02T00:00:00Z' } }]);
      const r = await createQwkClient(config(fetch)).login('zaphod', 'pw');
      expect(r.token).toBe('tok');
      expect(calls[0].url).toBe('https://bbs.test:8666/api/qwk/login');
      expect(calls[0].init?.headers?.['X-V3-Client']).toBe('vision3-mobile');
      expect(JSON.parse(calls[0].init?.body as string)).toEqual({ handle: 'zaphod', password: 'pw' });
    });

    it('throws QwkAuthError on 401', async () => {
      const { fetch } = scriptedFetch([{ status: 401, json: { error: 'unauthorized', message: 'bad creds' } }]);
      await expect(createQwkClient(config(fetch)).login('x', 'y')).rejects.toBeInstanceOf(QwkAuthError);
    });

    it('maps a 500 to QwkApiError with the error code', async () => {
      const { fetch } = scriptedFetch([{ status: 500, json: { error: 'internal', message: 'token issue' } }]);
      await expect(createQwkClient(config(fetch)).login('x', 'y')).rejects.toMatchObject({ code: 'internal', status: 500 });
    });
  });

  describe('downloadPacket', () => {
    it('returns bytes + message count and sends the bearer token', async () => {
      const zip = new Uint8Array([1, 2, 3, 4]);
      const { fetch, calls } = scriptedFetch([{ status: 200, bytes: zip, headers: { 'X-QWK-Messages': '5', 'Content-Type': 'application/zip' } }]);
      const r = await createQwkClient(config(fetch)).downloadPacket('tok');
      expect(r.kind).toBe('packet');
      if (r.kind === 'packet') {
        expect(Array.from(r.bytes)).toEqual([1, 2, 3, 4]);
        expect(r.messageCount).toBe(5);
      }
      expect(calls[0].init?.headers?.['Authorization']).toBe('Bearer tok');
    });

    it('treats 204 as "nothing new"', async () => {
      const { fetch } = scriptedFetch([{ status: 204 }]);
      expect(await createQwkClient(config(fetch)).downloadPacket('tok')).toEqual({ kind: 'none' });
    });

    it('throws QwkAuthError on 401', async () => {
      const { fetch } = scriptedFetch([{ status: 401, text: 'nope' }]);
      await expect(createQwkClient(config(fetch)).downloadPacket('tok')).rejects.toBeInstanceOf(QwkAuthError);
    });

    it('throws QwkRateLimitError with Retry-After on 429', async () => {
      const { fetch } = scriptedFetch([{ status: 429, json: { error: 'rate_limited', message: 'slow down' }, headers: { 'Retry-After': '30' } }]);
      const err = await createQwkClient(config(fetch)).downloadPacket('tok').catch((e) => e);
      expect(err).toBeInstanceOf(QwkRateLimitError);
      expect(err.retryAfter).toBe(30);
    });
  });

  describe('uploadReply', () => {
    it('posts application/zip and returns the import result', async () => {
      const { fetch, calls } = scriptedFetch([{ status: 200, json: { posted: 2, skipped: 0, duplicate: 0, wrongBBS: false } }]);
      const r = await createQwkClient(config(fetch)).uploadReply('tok', new Uint8Array([80, 75]));
      expect(r).toEqual({ posted: 2, skipped: 0, duplicate: 0, wrongBBS: false });
      expect(calls[0].init?.headers?.['Content-Type']).toBe('application/zip');
    });

    it('surfaces wrongBBS as a normal result (not an error)', async () => {
      const { fetch } = scriptedFetch([{ status: 200, json: { posted: 0, skipped: 1, duplicate: 0, wrongBBS: true } }]);
      const r = await createQwkClient(config(fetch)).uploadReply('tok', new Uint8Array([1]));
      expect(r.wrongBBS).toBe(true);
    });

    it('reports a duplicate re-upload (idempotent)', async () => {
      const { fetch } = scriptedFetch([{ status: 200, json: { posted: 0, skipped: 0, duplicate: 3, wrongBBS: false } }]);
      const r = await createQwkClient(config(fetch)).uploadReply('tok', new Uint8Array([1]));
      expect(r.duplicate).toBe(3);
    });

    it('throws bad_packet on 400', async () => {
      const { fetch } = scriptedFetch([{ status: 400, json: { error: 'bad_packet', message: 'unparseable' } }]);
      await expect(createQwkClient(config(fetch)).uploadReply('tok', new Uint8Array([1]))).rejects.toMatchObject({ code: 'bad_packet' });
    });

    it('rejects an oversized REP before sending', async () => {
      const { fetch, calls } = scriptedFetch([{ status: 200, json: {} }]);
      const big = new Uint8Array(16 * 1024 * 1024 + 1);
      await expect(createQwkClient(config(fetch)).uploadReply('tok', big)).rejects.toMatchObject({ code: 'too_large' });
      expect(calls).toHaveLength(0);
    });
  });
});
