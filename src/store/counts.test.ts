import { unreadTotal, visibleMessages, privateUnread } from './counts';
import { Message } from './types';
import { AreaConfig } from './taxonomy';

const msg = (id: string, areaId: string, isPrivate = false): Message => ({
  id,
  number: 1,
  areaId,
  subject: 's',
  from: 'a',
  to: 'b',
  date: '01-01-26',
  time: '00:00',
  body: '',
  isPrivate,
  preview: '',
});
const area = (id: string): AreaConfig => ({ id, conferenceId: 'c0', number: 1, name: id, tag: id, qwkConference: 1 });

describe('unreadTotal counts only reachable messages', () => {
  const messages = [
    msg('m1', 'a1'),
    msg('m2', 'a1'),
    msg('m3', 'a9'), // area no longer in the taxonomy (untagged since)
    msg('m4', 'a9'),
    msg('p1', 'mail', true),
  ];
  const areas = [area('a1')];

  it('excludes messages whose area has dropped out of the taxonomy', () => {
    expect(visibleMessages(messages, areas).map((m) => m.id)).toEqual(['m1', 'm2', 'p1']);
    expect(unreadTotal(messages, areas, new Set())).toBe(3);
  });

  it('honours read state', () => {
    expect(unreadTotal(messages, areas, new Set(['m1', 'p1']))).toBe(1);
  });

  it('always includes private mail, even with no areas at all', () => {
    expect(unreadTotal(messages, [], new Set())).toBe(1);
    expect(privateUnread(messages, new Set())).toBe(1);
  });

  it('counts everything again once the area is back', () => {
    expect(unreadTotal(messages, [area('a1'), area('a9')], new Set())).toBe(5);
  });
});
