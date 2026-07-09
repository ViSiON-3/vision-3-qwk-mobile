import { draftsForBoard, draftsForMessage, migrateDraftBoardIds } from './draftSelectors';
import { Draft } from './types';

const mk = (over: Partial<Draft>): Draft => ({
  id: 'd', boardId: 'b1', to: 'a', from: 'b', subject: 's', areaName: '', conferenceNumber: 3, priv: false, body: '', ...over,
});

describe('draftsForMessage', () => {
  const drafts = [
    mk({ id: 'd1', reference: 100, conferenceNumber: 3 }),
    mk({ id: 'd2', reference: 100, conferenceNumber: 4 }), // wrong conference
    mk({ id: 'd3', reference: 200, conferenceNumber: 3 }), // wrong parent
    mk({ id: 'd4', reference: 100, conferenceNumber: 3 }),
    mk({ id: 'd5', reference: 100, conferenceNumber: 3, boardId: 'b2' }), // other board
  ];

  it('returns drafts replying to the given message in the given conference', () => {
    expect(draftsForMessage(drafts, 'b1', 100, 3).map((d) => d.id)).toEqual(['d1', 'd4']);
  });

  it('excludes drafts composed on another board even when (reference, conference) collide', () => {
    expect(draftsForMessage(drafts, 'b2', 100, 3).map((d) => d.id)).toEqual(['d5']);
  });

  it('returns [] when nothing matches', () => {
    expect(draftsForMessage(drafts, 'b1', 999, 3)).toEqual([]);
  });
});

describe('draftsForBoard', () => {
  const drafts = [
    mk({ id: 'd1', boardId: 'b1' }),
    mk({ id: 'd2', boardId: 'b2' }),
    mk({ id: 'd3', boardId: 'b1' }),
  ];

  it("returns only the given board's drafts", () => {
    expect(draftsForBoard(drafts, 'b1').map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(draftsForBoard(drafts, 'b2').map((d) => d.id)).toEqual(['d2']);
  });

  it('returns [] for a board with no drafts', () => {
    expect(draftsForBoard(drafts, 'b9')).toEqual([]);
  });
});

describe('migrateDraftBoardIds', () => {
  it('stamps drafts persisted before boardId existed with the fallback board', () => {
    const legacy = [{ ...mk({ id: 'd1' }), boardId: undefined }, mk({ id: 'd2', boardId: 'b2' })];
    const out = migrateDraftBoardIds(legacy, 'b1');
    expect(out.map((d) => d.boardId)).toEqual(['b1', 'b2']);
  });

  it('leaves already-stamped drafts untouched', () => {
    const drafts = [mk({ id: 'd1', boardId: 'b2' })];
    expect(migrateDraftBoardIds(drafts, 'b1')).toEqual(drafts);
  });
});
