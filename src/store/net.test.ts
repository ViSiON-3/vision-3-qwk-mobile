import { makeSession, pushDrafts, describeSyncError } from './net';
import { QwkApiError, QwkAuthError, QwkRateLimitError } from '../api';
import { scriptedFetch } from '../api/testFetch';
import { Board, Draft } from './types';

const board: Board = { id: 'b', name: 'X', host: 'bbs.local', port: 8666, handle: 'felonius', pass: 'pw', bbsId: 'VISION3' };

describe('net', () => {
  it('makeSession logs in with the board host/port/credentials', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, json: { token: 't', expiresAt: 'z' } },
      { status: 204 },
    ]);
    const res = await makeSession(board, fetch).download();
    expect(res).toEqual({ kind: 'none' });
    expect(calls[0].url).toBe('https://bbs.local:8666/api/qwk/login');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ handle: 'felonius', password: 'pw' });
  });

  it('pushDrafts builds a REP zip and uploads it, returning the server result', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 200, json: { token: 't', expiresAt: 'z' } },
      { status: 200, json: { posted: 2, skipped: 0, duplicate: 0, wrongBBS: false } },
    ]);
    const drafts: Draft[] = [
      { id: 'd1', boardId: 'b1', to: 'All', from: 'felonius', subject: 'hi', areaName: '', conferenceNumber: 1, priv: false, body: 'yo' },
    ];
    const result = await pushDrafts(makeSession(board, fetch), 'VISION3', drafts);
    expect(result.posted).toBe(2);
    const body = calls[1].init?.body as Uint8Array;
    expect([body[0], body[1]]).toEqual([0x50, 0x4b]); // "PK" zip magic
    expect(calls[1].url).toBe('https://bbs.local:8666/api/qwk/reply');
  });

  describe('describeSyncError', () => {
    it('maps auth / rate-limit / api / generic errors', () => {
      expect(describeSyncError(new QwkAuthError())).toMatch(/Login failed/);
      expect(describeSyncError(new QwkRateLimitError('slow', 30))).toMatch(/30s/);
      expect(describeSyncError(new QwkRateLimitError('slow'))).toMatch(/try again shortly/);
      expect(describeSyncError(new QwkApiError('bad_packet', 'x', 400))).toMatch(/bad_packet/);
      expect(describeSyncError(new Error('boom'))).toBe('boom');
      expect(describeSyncError('weird')).toBe('Network error.');
    });
  });
});
