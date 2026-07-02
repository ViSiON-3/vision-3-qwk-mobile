import { unzipSync } from 'fflate';
import { buildRepFromDrafts } from './repBuilder';
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
});
