import { unzipSync, strFromU8 } from 'fflate';
import { buildRepFromDrafts, finalizeReplyBody } from './repBuilder';
import { parseMessagesDat } from '../qwk';
import { Draft } from './types';

const drafts: Draft[] = [
  { id: 'd1', to: 'Prime', from: 'Zaphod', subject: 'Re: Welcome', areaName: '', conferenceNumber: 0, priv: true, body: 'thanks!' },
  { id: 'd2', to: 'Avon', from: 'Zaphod', subject: 'Re: nodelist', areaName: 'fsxNet General', conferenceNumber: 3, priv: false, body: 'add me' },
];

describe('buildRepFromDrafts', () => {
  it('compiles drafts into a <BBSID>.MSG that parses back with routing + fields', () => {
    const files = unzipSync(buildRepFromDrafts('V3HQ', drafts));
    expect(Object.keys(files)).toContain('V3HQ.MSG');
    const msgs = parseMessagesDat(files['V3HQ.MSG']);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ to: 'Prime', from: 'Zaphod', conference: 0, isPrivate: true, body: 'thanks!' });
    expect(msgs[1]).toMatchObject({ to: 'Avon', conference: 3, isPrivate: false, body: 'add me' });
  });

  it('is byte-identical for identical drafts (idempotent re-upload)', () => {
    const a = buildRepFromDrafts('V3HQ', drafts);
    const b = buildRepFromDrafts('V3HQ', drafts);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('carries reply threading — parent number (offset 108) + In-Reply-To Message-ID', () => {
    const threaded: Draft[] = [
      {
        id: 'd1', to: 'Avon', from: 'Zaphod', subject: 'Re: nodelist', areaName: 'fsxNet General',
        conferenceNumber: 3, priv: false, body: 'add me', reference: 2048, inReplyTo: '<2048@fsx>',
      },
    ];
    const files = unzipSync(buildRepFromDrafts('V3HQ', threaded));
    const msgs = parseMessagesDat(files['V3HQ.MSG']);
    expect(msgs[0].reference).toBe(2048); // in-packet numeric reference
    // Durable In-Reply-To rides in HEADERS.DAT.
    expect(files['HEADERS.DAT']).toBeDefined();
    const headers = strFromU8(files['HEADERS.DAT']);
    expect(headers).toContain('In-Reply-To');
    expect(headers).toContain('<2048@fsx>');
  });
});

const TAG = '--- ViSiON QWK Editor v0.1.0 (iOS)';

describe('finalizeReplyBody', () => {
  it('sanitizes, wraps to 79, and appends the tag line', () => {
    const out = finalizeReplyBody('He said "hi"', TAG);
    expect(out).toBe(`He said "hi"\n\n${TAG}`);
  });

  it('wraps long input to <=79 columns', () => {
    const out = finalizeReplyBody('word '.repeat(30).trim(), TAG);
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(79);
  });

  it('omits the tag line when none is supplied', () => {
    expect(finalizeReplyBody('hi', '')).toBe('hi');
  });
});

describe('buildRepFromDrafts with a tag line', () => {
  it('stamps the tag line into the packed body exactly once', () => {
    const d: Draft[] = [
      { id: 'd1', to: 'Avon', from: 'Zaphod', subject: 'Re: x', areaName: '', conferenceNumber: 3, priv: false, body: 'hello' },
    ];
    const once = buildRepFromDrafts('V3HQ', d, TAG);
    const twice = buildRepFromDrafts('V3HQ', d, TAG);
    expect(Array.from(once)).toEqual(Array.from(twice)); // idempotent
    const files = unzipSync(once);
    const msgs = parseMessagesDat(files['V3HQ.MSG']);
    expect(msgs[0].body).toContain(TAG);
    expect(msgs[0].body.split(TAG).length - 1).toBe(1); // stamped once
  });
});
