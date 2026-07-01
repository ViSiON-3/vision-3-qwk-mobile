import { buildSampleQwk } from './sampleQwk';
import { parsePacketToMessages, stableMessageId } from './viewModel';
import { PRIVATE_AREA_ID } from './taxonomy';

describe('parsePacketToMessages (sample packet round trip)', () => {
  const messages = parsePacketToMessages(buildSampleQwk('V3HQ'), 'V3HQ');

  it('maps QWK conference 0 to private mail', () => {
    const priv = messages.filter((m) => m.isPrivate);
    expect(priv).toHaveLength(2);
    expect(priv.every((m) => m.areaId === PRIVATE_AREA_ID)).toBe(true);
    expect(priv.map((m) => m.subject)).toContain('Welcome to ViSiON/3 HQ');
  });

  it('groups public messages into the area matching their qwkConference', () => {
    // qwkConference 3 -> area a2 (fsxNet General), 6 -> a5 (V3 Development).
    const fsx = messages.filter((m) => m.areaId === 'a2');
    expect(fsx.map((m) => m.number).sort()).toEqual([2048, 2049]);
    expect(messages.filter((m) => m.areaId === 'a5')).toHaveLength(1);
  });

  it('assigns stable ids so read state survives a re-parse', () => {
    const again = parsePacketToMessages(buildSampleQwk('V3HQ'), 'V3HQ');
    expect(again.map((m) => m.id)).toEqual(messages.map((m) => m.id));
    // The welcome message is conference 0, number 1024.
    const welcome = messages.find((m) => m.number === 1024)!;
    expect(welcome.id).toBe(stableMessageId('V3HQ', 0, 1024));
  });

  it('preserves threading reference and one-line preview', () => {
    const reply = messages.find((m) => m.number === 2049)!;
    expect(reply.reference).toBe(2048);
    expect(reply.preview.length).toBeGreaterThan(0);
  });
});
