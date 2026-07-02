/**
 * Bridge the outbox (UI drafts) to the engine's .REP writer. Output bytes are
 * deterministic for a given set of drafts, so re-uploading is idempotent (the
 * server de-dupes) — the outbox can retry safely.
 */
import { writeRep, ReplyDraft } from '../qwk';
import { Draft } from './types';

export function draftToReply(d: Draft): ReplyDraft {
  return {
    to: d.to,
    from: d.from,
    subject: d.subject,
    conference: d.conferenceNumber,
    body: d.body,
    isPrivate: d.priv,
  };
}

/** Compile the current outbox drafts into a .REP packet for `bbsId`. */
export function buildRepFromDrafts(bbsId: string, drafts: Draft[]): Uint8Array {
  return writeRep(bbsId, drafts.map(draftToReply));
}
