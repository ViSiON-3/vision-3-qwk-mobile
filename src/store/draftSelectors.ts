import { Draft } from './types';

/**
 * Outbox drafts that are saved replies to a specific message: the draft's
 * in-packet parent number (`reference`) matches the message number and it targets
 * the same conference. Pure (no react-native/store deps) so it stays testable.
 */
export function draftsForMessage(
  drafts: Draft[],
  reference: number,
  conferenceNumber: number
): Draft[] {
  return drafts.filter((d) => d.reference === reference && d.conferenceNumber === conferenceNumber);
}
