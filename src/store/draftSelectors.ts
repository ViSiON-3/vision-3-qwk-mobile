import { Draft } from './types';

/**
 * Outbox drafts that are saved replies to a specific message: the draft was
 * composed on the given board, its in-packet parent number (`reference`) matches
 * the message number, and it targets the same conference. The board check keeps
 * a (reference, conference) collision on another board from leaking in. Pure
 * (no react-native/store deps) so it stays testable.
 */
export function draftsForMessage(
  drafts: Draft[],
  boardId: string,
  reference: number,
  conferenceNumber: number
): Draft[] {
  return drafts.filter(
    (d) => d.boardId === boardId && d.reference === reference && d.conferenceNumber === conferenceNumber
  );
}

/** Drafts composed on the given board — what an upload from that board sends. */
export function draftsForBoard(drafts: Draft[], boardId: string): Draft[] {
  return drafts.filter((d) => d.boardId === boardId);
}

/**
 * Stamp drafts persisted before `Draft.boardId` existed. We can't recover which
 * board they were composed on, so they adopt the fallback (the active board) —
 * the best guess, since drafts could only ever be uploaded from it anyway.
 */
export function migrateDraftBoardIds(
  drafts: Array<Omit<Draft, 'boardId'> & { boardId?: string }>,
  fallbackBoardId: string
): Draft[] {
  return drafts.map((d) => (d.boardId ? (d as Draft) : { ...d, boardId: fallbackBoardId }));
}
