import { makeSession, makeClient, pushDrafts, describeSyncError, needsRepair, BoardNotPairedError } from './net';
import { QwkApiError, QwkAuthError, QwkDeviceUnpairedError, QwkRateLimitError, DeviceKeyMissingError } from '../api';
import { scriptedFetch } from '../api/testFetch';
import { fakeSigner } from '../api/testSigner';
import { Board, Draft } from './types';

const paired: Board = {
  id: 'b',
  name: 'X',
  host: 'bbs.local',
  port: 8666,
  handle: 'felonius',
  bbsId: 'VISION3',
  pairing: { deviceId: 'dev1', boardId: 'board1', deviceName: 'phone', pairedAt: '2026-10-27T00:00:00Z' },
};
const challenge = { status: 200, json: { challenge: 'c', expiresAt: 'z' } };
const token = { status: 200, json: { token: 't', expiresAt: 'z', scope: 'device' } };

describe('net', () => {
  it('makeClient targets the board host/port', () => {
    expect(makeClient(paired, scriptedFetch([]).fetch).baseUrl).toBe('https://bbs.local:8666/api/qwk/');
  });

  it('makeSession logs in with the board pairing and the signer', async () => {
    const signer = fakeSigner();
    const { fetch, calls } = scriptedFetch([challenge, token, { status: 204 }]);
    const res = await makeSession(paired, fetch, signer).download();
    expect(res).toEqual({ kind: 'none' });
    expect(calls[0].url).toBe('https://bbs.local:8666/api/qwk/challenge');
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ deviceId: 'dev1' });
    expect(new TextDecoder().decode(signer.signed[0])).toContain('\nboard1\ndev1\nc');
  });

  it('makeSession refuses an unpaired board', () => {
    const { pairing: _p, ...unpaired } = paired;
    expect(() => makeSession(unpaired, scriptedFetch([]).fetch, fakeSigner())).toThrow(BoardNotPairedError);
  });

  it('pushDrafts builds a REP zip and uploads it, returning the server result', async () => {
    const { fetch, calls } = scriptedFetch([
      challenge,
      token,
      { status: 200, json: { posted: 2, skipped: 0, duplicate: 0, wrongBBS: false } },
    ]);
    const drafts: Draft[] = [
      { id: 'd1', boardId: 'b1', to: 'All', from: 'felonius', subject: 'hi', areaName: '', conferenceNumber: 1, priv: false, body: 'yo' },
    ];
    const result = await pushDrafts(makeSession(paired, fetch, fakeSigner()), 'VISION3', drafts);
    expect(result.posted).toBe(2);
    const body = calls[2].init?.body as Uint8Array;
    expect([body[0], body[1]]).toEqual([0x50, 0x4b]); // "PK" zip magic
    expect(calls[2].url).toBe('https://bbs.local:8666/api/qwk/reply');
  });

  it('needsRepair flags unpaired / missing-key errors only', () => {
    expect(needsRepair(new QwkDeviceUnpairedError())).toBe(true);
    expect(needsRepair(new DeviceKeyMissingError())).toBe(true);
    expect(needsRepair(new QwkAuthError())).toBe(false);
    expect(needsRepair(new Error('x'))).toBe(false);
  });

  describe('describeSyncError', () => {
    it('maps auth / rate-limit / api / generic errors', () => {
      expect(describeSyncError(new QwkAuthError())).toMatch(/dial in again/);
      expect(describeSyncError(new QwkAuthError('Login failed — check handle and password.'))).toMatch(/handle and password/);
      expect(describeSyncError(new QwkDeviceUnpairedError())).toMatch(/no longer paired/);
      expect(describeSyncError(new QwkRateLimitError('slow', 30))).toMatch(/Rate limited.*30s/);
      expect(describeSyncError(new QwkRateLimitError('slow'))).toMatch(/try again shortly/);
      expect(describeSyncError(new QwkRateLimitError('locked', 540, 'locked_out'))).toMatch(/Locked out.*540s/);
      expect(describeSyncError(new QwkApiError('bad_packet', 'x', 400))).toMatch(/bad_packet/);
      expect(describeSyncError(new QwkApiError('logon_level', 'x', 403))).toMatch(/access level/);
      expect(describeSyncError(new QwkApiError('intro_pending', 'x', 403))).toMatch(/introduction/);
      expect(describeSyncError(new QwkApiError('device_required', 'x', 403))).toMatch(/dial in again/);
      expect(describeSyncError(new QwkApiError('too_many_devices', 'x', 409))).toMatch(/unpair one/);
      expect(describeSyncError(new QwkApiError('weird', 'server says', 500))).toBe('server says');
      expect(describeSyncError(new BoardNotPairedError())).toMatch(/not paired/);
      expect(describeSyncError(new Error('boom'))).toBe('boom');
      expect(describeSyncError('weird')).toBe('Network error.');
    });
  });
});
