import { zipSync, unzipSync } from 'fflate';
import { readQwkPacket } from './packet';
import { writeRep } from './rep';
import { controlDat, messagesDat } from './testFixtures';
import { encodeCp437 } from './cp437';
import { encodeUtf8 } from './utf8';
import { ReplyDraft } from './types';

function buildPacket(): Uint8Array {
  const control = controlDat({
    bbsName: 'ViSiON/3',
    bbsId: 'V3BBS',
    conferences: [
      { number: 0, name: 'Local' },
      { number: 5, name: 'fsxNet' },
    ],
  });
  const messages = messagesDat([
    { number: 1, conference: 0, from: 'BOB', to: 'ALL', subject: 'Welcome', body: 'Hello world' },
    { number: 2, conference: 5, from: 'JANE', to: 'BOB', subject: 'Re: Welcome', reference: 1, body: 'Hi Bob' },
  ]);
  const headers = encodeCp437('[80]\r\nMessage-ID: <1@v3>\r\n\r\n');
  return zipSync({ 'CONTROL.DAT': control, 'MESSAGES.DAT': messages, 'HEADERS.DAT': headers });
}

describe('readQwkPacket', () => {
  it('reads the V3AREAS.JSON sidecar when present and leaves it undefined otherwise', () => {
    expect(readQwkPacket(buildPacket()).areaIndex).toBeUndefined();

    const files: Record<string, Uint8Array> = { ...unzipSync(buildPacket()) };
    files['V3AREAS.JSON'] = encodeUtf8(
      JSON.stringify({
        version: 1,
        conferences: [{ tag: 'FSXNET', name: 'fsxNet' }],
        areas: [{ qwk: 5, tag: 'FSX_GEN', name: 'fsxNet', conference: 'FSXNET', type: 'echomail', network: 'fsxnet' }],
      })
    );
    const packet = readQwkPacket(zipSync(files));
    expect(packet.areaIndex?.conferences).toEqual([{ tag: 'FSXNET', name: 'fsxNet' }]);
    expect(packet.areaIndex?.areas[0].conference).toBe('FSXNET');

    // A corrupt sidecar must not break the packet, just lose the grouping.
    files['V3AREAS.JSON'] = encodeUtf8('{not json');
    expect(readQwkPacket(zipSync(files)).areaIndex).toBeUndefined();
  });

  it('parses control, messages, and conference names together', () => {
    const packet = readQwkPacket(buildPacket());
    expect(packet.control.bbsId).toBe('V3BBS');
    expect(packet.messages).toHaveLength(2);
    expect(packet.conferenceNames.get(0)).toBe('Local');
    expect(packet.conferenceNames.get(5)).toBe('fsxNet');
  });

  it('associates HEADERS.DAT with the right message by block offset', () => {
    const packet = readQwkPacket(buildPacket());
    expect(packet.messages[0].messageId).toBe('<1@v3>');
    expect(packet.messages[1].messageId).toBeUndefined();
  });

  it('threads a reply to its parent via the reference field', () => {
    const packet = readQwkPacket(buildPacket());
    expect(packet.messages[1].reference).toBe(1);
    expect(packet.messages[1].conference).toBe(5);
  });

  it('throws a clear error when CONTROL.DAT is missing', () => {
    const bad = zipSync({ 'MESSAGES.DAT': messagesDat([{ body: 'x' }]) });
    expect(() => readQwkPacket(bad)).toThrow(/CONTROL\.DAT/);
  });

  it('resolves files case-insensitively', () => {
    const control = controlDat({ conferences: [{ number: 0, name: 'Main' }] });
    const messages = messagesDat([{ body: 'lower' }]);
    const packet = readQwkPacket(zipSync({ 'control.dat': control, 'messages.dat': messages }));
    expect(packet.messages).toHaveLength(1);
  });

  it('completes a full offline round trip: read packet -> reply -> write REP -> read back', () => {
    const packet = readQwkPacket(buildPacket());
    const parent = packet.messages[0];
    const draft: ReplyDraft = {
      to: parent.from,
      from: packet.control.username,
      subject: `Re: ${parent.subject}`,
      conference: parent.conference,
      reference: parent.number,
      body: 'Thanks for the welcome!',
      date: '07-01-26',
      time: '11:00',
    };
    const repZip = writeRep(packet.control.bbsId, [draft]);
    const back = readQwkPacket(
      zipSync({
        'CONTROL.DAT': controlDat({ bbsId: packet.control.bbsId, conferences: [{ number: 0, name: 'Local' }] }),
        'MESSAGES.DAT': unzipSync(repZip)[`${packet.control.bbsId}.MSG`],
      })
    );
    expect(back.messages[0].subject).toBe('Re: Welcome');
    expect(back.messages[0].reference).toBe(1);
    expect(back.messages[0].body).toBe('Thanks for the welcome!');
  });
});
