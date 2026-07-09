import { draftsForMessage } from './draftSelectors';
import { Draft } from './types';

const mk = (over: Partial<Draft>): Draft => ({
  id: 'd', to: 'a', from: 'b', subject: 's', areaName: '', conferenceNumber: 3, priv: false, body: '', ...over,
});

describe('draftsForMessage', () => {
  const drafts = [
    mk({ id: 'd1', reference: 100, conferenceNumber: 3 }),
    mk({ id: 'd2', reference: 100, conferenceNumber: 4 }), // wrong conference
    mk({ id: 'd3', reference: 200, conferenceNumber: 3 }), // wrong parent
    mk({ id: 'd4', reference: 100, conferenceNumber: 3 }),
  ];

  it('returns drafts replying to the given message in the given conference', () => {
    expect(draftsForMessage(drafts, 100, 3).map((d) => d.id)).toEqual(['d1', 'd4']);
  });

  it('returns [] when nothing matches', () => {
    expect(draftsForMessage(drafts, 999, 3)).toEqual([]);
  });
});
