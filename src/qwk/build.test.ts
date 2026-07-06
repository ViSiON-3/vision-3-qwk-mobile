import { buildQwkPacket } from './build';
import { readQwkPacket } from './packet';

describe('buildQwkPacket -> readQwkPacket round trip', () => {
  const packet = buildQwkPacket({
    control: {
      bbsId: 'V3HQ',
      bbsName: 'ViSiON/3 HQ',
      conferences: [
        { number: 0, name: 'Personal' },
        { number: 1, name: 'Local: General' },
        { number: 3, name: 'fsxNet: General' },
      ],
    },
    messages: [
      { conference: 0, number: 1001, to: 'ZAPHOD', from: 'PRIME', subject: 'Welcome', body: 'Hi there', isPrivate: true },
      {
        conference: 3,
        number: 2048,
        to: 'ALL',
        from: 'AVON',
        subject: 'A subject that exceeds the twenty-five character limit for sure',
        body: 'Line one\nLine two',
        messageId: '<2048@v3>',
      },
      { conference: 3, number: 2049, to: 'AVON', from: 'BLAKE', subject: 'Re: nodelist', body: 'thanks', reference: 2048, inReplyTo: '<2048@v3>' },
    ],
  });

  it('reads back control metadata and conference names', () => {
    const p = readQwkPacket(packet);
    expect(p.control.bbsId).toBe('V3HQ');
    expect(p.conferenceNames.get(0)).toBe('Personal');
    expect(p.conferenceNames.get(3)).toBe('fsxNet: General');
  });

  it('reads back messages with fields, conference routing, and private flag', () => {
    const p = readQwkPacket(packet);
    expect(p.messages).toHaveLength(3);
    const priv = p.messages[0];
    expect(priv.isPrivate).toBe(true);
    expect(priv.conference).toBe(0);
    expect(priv.body).toBe('Hi there');
  });

  it('recovers long Subject and Message-ID/threading via HEADERS.DAT', () => {
    const p = readQwkPacket(packet);
    const m = p.messages.find((x) => x.number === 2048)!;
    expect(m.subject).toBe('A subject that exceeds the twenty-five character limit for sure');
    expect(m.messageId).toBe('<2048@v3>');
    const reply = p.messages.find((x) => x.number === 2049)!;
    expect(reply.reference).toBe(2048);
    expect(reply.inReplyTo).toBe('<2048@v3>');
  });

  it('preserves multi-line CP437 bodies', () => {
    const p = readQwkPacket(packet);
    expect(p.messages.find((x) => x.number === 2048)!.body).toBe('Line one\nLine two');
  });
});
