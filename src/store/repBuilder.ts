/**
 * Bridge the outbox (UI drafts) to the engine's .REP writer. Bodies are put
 * through finalizeReplyBody (sanitize -> wrap 79 -> tag line) at build time, so
 * the editable draft stays raw while the on-wire form is canonical. Output bytes
 * are deterministic for a given set of drafts + tag line, so re-uploading is
 * idempotent (the server de-dupes) and the outbox can retry safely.
 */
import { writeRep, ReplyDraft } from '../qwk';
import { sanitizeBody } from '../qwk/sanitize';
import { wrapText } from '../qwk/wrap';
import { appendTagline } from '../qwk/tagline';
import { Draft } from './types';

/** Canonical on-wire body: sanitize -> 79-col wrap -> append tag line. */
export function finalizeReplyBody(rawBody: string, tagline: string): string {
  return appendTagline(wrapText(sanitizeBody(rawBody), 79), tagline);
}

export function draftToReply(d: Draft, tagline = ''): ReplyDraft {
  return {
    to: d.to,
    from: d.from,
    subject: d.subject,
    conference: d.conferenceNumber,
    body: finalizeReplyBody(d.body, tagline),
    isPrivate: d.priv,
    // Threading: in-packet parent number (offset 108) + durable In-Reply-To.
    reference: d.reference,
    inReplyTo: d.inReplyTo,
  };
}

/** Compile the current outbox drafts into a .REP packet for `bbsId`. */
export function buildRepFromDrafts(bbsId: string, drafts: Draft[], tagline = ''): Uint8Array {
  return writeRep(bbsId, drafts.map((d) => draftToReply(d, tagline)));
}
