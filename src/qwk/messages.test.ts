import { parseMessagesDat } from './messages';
import { parseHeadersDat } from './headers';
import { messagesDat, messageBlocks, producerBlock } from './testFixtures';
import { concatBytes } from './bytes';
import { encodeCp437 } from './cp437';

describe('parseMessagesDat', () => {
  it('skips the producer block and reads header fields at exact offsets', () => {
    const bytes = messagesDat([
      {
        status: '*',
        number: 42,
        date: '07-01-26',
        time: '09:30',
        to: 'JANE',
        from: 'BOB',
        subject: 'Hello there',
        reference: 40,
        conference: 5,
        logical: 7,
        body: 'Line one\nLine two',
      },
    ]);
    const [m] = parseMessagesDat(bytes);
    expect(m.status).toBe('*');
    expect(m.number).toBe(42);
    expect(m.date).toBe('07-01-26');
    expect(m.time).toBe('09:30');
    expect(m.to).toBe('JANE');
    expect(m.from).toBe('BOB');
    expect(m.subject).toBe('Hello there');
    expect(m.reference).toBe(40);
    expect(m.conference).toBe(5);
    expect(m.logicalNumber).toBe(7);
    expect(m.isPrivate).toBe(true);
    expect(m.active).toBe(true);
    expect(m.blockOffset).toBe(128);
    expect(m.body).toBe('Line one\nLine two');
  });

  it('preserves CP437 line art verbatim (no reflow)', () => {
    const art = '╔══════════╗\n║ ViSiON/3 ║\n╚══════════╝';
    const bytes = messagesDat([{ body: art, subject: 'Art' }]);
    const [m] = parseMessagesDat(bytes);
    expect(m.body).toBe(art);
  });

  it('reads multiple messages by block count and reports offsets', () => {
    const bytes = messagesDat([
      { number: 1, body: 'short' },
      { number: 2, body: 'x'.repeat(300) }, // spans multiple text blocks
      { number: 3, body: 'third' },
    ]);
    const msgs = parseMessagesDat(bytes);
    expect(msgs.map((m) => m.number)).toEqual([1, 2, 3]);
    expect(msgs[0].blockOffset).toBe(128);
    // msg1: producer(1) + hdr(1) + 1 text = block index; msg2 header offset:
    expect(msgs[1].blockOffset).toBe(128 + 128 * 2);
  });

  it('marks 0xE2 messages as deleted (active=false)', () => {
    const bytes = messagesDat([{ body: 'gone', active: false }]);
    expect(parseMessagesDat(bytes)[0].active).toBe(false);
  });

  it('merges long To/From/Subject and threading from HEADERS.DAT', () => {
    const msgBytes = messagesDat([
      { to: 'TRUNCATEDRECIPIENTNAME12', from: 'BOB', subject: 'Re: stuff', body: 'hi' },
    ]);
    // First message header block is at offset 128 -> section [80].
    const headers = parseHeadersDat(
      encodeCp437(
        '[80]\r\n' +
          'Subject: A subject that is definitely longer than twenty-five chars\r\n' +
          'To: A Very Long Recipient Display Name Indeed\r\n' +
          'Message-ID: <abc@bbs>\r\n' +
          'In-Reply-To: <parent@bbs>\r\n\r\n'
      )
    );
    const [m] = parseMessagesDat(msgBytes, { headers });
    expect(m.subject).toBe('A subject that is definitely longer than twenty-five chars');
    expect(m.to).toBe('A Very Long Recipient Display Name Indeed');
    expect(m.from).toBe('BOB');
    expect(m.messageId).toBe('<abc@bbs>');
    expect(m.inReplyTo).toBe('<parent@bbs>');
  });

  it('strips QWKE body kludge lines and applies them as overrides', () => {
    const longTo = 'A Very Long Recipient Over 25 Characters';
    const body = `To: ${longTo}\nActual body starts here`;
    const bytes = messagesDat([{ to: 'TRUNC', body, subject: 'S' }]);
    const [m] = parseMessagesDat(bytes, { stripKludgeLines: true });
    expect(m.to).toBe(longTo);
    expect(m.body).toBe('Actual body starts here');
  });

  it('handles an empty/no-message packet (producer only)', () => {
    expect(parseMessagesDat(producerBlock())).toEqual([]);
  });

  it('handles a body that exactly fills a block boundary', () => {
    const body = 'A'.repeat(128);
    const bytes = concatBytes([producerBlock(), messageBlocks({ body })]);
    const [m] = parseMessagesDat(bytes);
    expect(m.body).toBe(body);
  });
});
