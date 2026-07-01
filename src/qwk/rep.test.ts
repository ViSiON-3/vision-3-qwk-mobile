import { unzipSync } from 'fflate';
import { writeRep } from './rep';
import { parseMessagesDat } from './messages';
import { parseHeadersDat } from './headers';
import { readField } from './bytes';
import { ReplyDraft } from './types';

function reply(overrides: Partial<ReplyDraft> = {}): ReplyDraft {
  return {
    to: 'SYSOP',
    from: 'JANE',
    subject: 'Re: Hello',
    conference: 3,
    body: 'This is my reply.\nSecond line.',
    date: '07-01-26',
    time: '10:15',
    ...overrides,
  };
}

describe('writeRep', () => {
  it('names the archive entry <BBSID>.MSG and writes the BBSID in block 0', () => {
    const zip = unzipSync(writeRep('V3TEST', [reply()]));
    expect(Object.keys(zip)).toContain('V3TEST.MSG');
    const msg = zip['V3TEST.MSG'];
    expect(readField(msg, 0, 128)).toBe('V3TEST');
  });

  it('round-trips a reply through parseMessagesDat', () => {
    const zip = unzipSync(writeRep('V3TEST', [reply({ isPrivate: true, reference: 99, conference: 7 })]));
    const [m] = parseMessagesDat(zip['V3TEST.MSG']);
    expect(m.to).toBe('SYSOP');
    expect(m.from).toBe('JANE');
    expect(m.subject).toBe('Re: Hello');
    expect(m.body).toBe('This is my reply.\nSecond line.');
    expect(m.conference).toBe(7);
    expect(m.reference).toBe(99);
    expect(m.isPrivate).toBe(true);
    expect(m.active).toBe(true);
  });

  it('routes each reply to its own destination conference', () => {
    const zip = unzipSync(writeRep('V3TEST', [reply({ conference: 1 }), reply({ conference: 44 })]));
    const msgs = parseMessagesDat(zip['V3TEST.MSG']);
    expect(msgs.map((m) => m.conference)).toEqual([1, 44]);
  });

  it('emits HEADERS.DAT for long fields and threading, keyed to the reply block offset', () => {
    const longSubject = 'A reply subject that comfortably exceeds twenty-five characters';
    const zip = unzipSync(
      writeRep('V3TEST', [reply({ subject: longSubject, messageId: '<new@bbs>', inReplyTo: '<parent@bbs>' })])
    );
    expect(Object.keys(zip)).toContain('HEADERS.DAT');
    const headers = parseHeadersDat(zip['HEADERS.DAT']);
    // First reply header block is at offset 128 -> [80].
    const merged = parseMessagesDat(zip['V3TEST.MSG'], { headers });
    expect(merged[0].subject).toBe(longSubject);
    expect(merged[0].messageId).toBe('<new@bbs>');
    expect(merged[0].inReplyTo).toBe('<parent@bbs>');
  });

  it('produces byte-identical output for identical drafts (idempotent upload)', () => {
    const a = writeRep('V3TEST', [reply(), reply({ conference: 9 })]);
    const b = writeRep('V3TEST', [reply(), reply({ conference: 9 })]);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('preserves CP437 art in the reply body', () => {
    const art = '░▒▓█ ViSiON/3 █▓▒░';
    const zip = unzipSync(writeRep('V3TEST', [reply({ body: art })]));
    expect(parseMessagesDat(zip['V3TEST.MSG'])[0].body).toBe(art);
  });
});
