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

  it('maps public messages to an area by their qwkConference number', () => {
    // Area id is `a<qwkConference>`: conference 3 -> a3, conference 6 -> a6.
    const fsx = messages.filter((m) => m.areaId === 'a3');
    expect(fsx.map((m) => m.number).sort()).toEqual([2048, 2049]);
    expect(messages.filter((m) => m.areaId === 'a6')).toHaveLength(1);
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
