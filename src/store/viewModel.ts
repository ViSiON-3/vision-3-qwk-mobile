import { readQwkPacket } from '../qwk';
import { Message } from './types';
import { PRIVATE_AREA_ID, PRIVATE_CONFERENCE, areaIdForConference } from './taxonomy';

/** Stable, re-parse-safe message identity (backs persisted read state). */
export function stableMessageId(bbsId: string, conference: number, number: number): string {
  return `${bbsId}:${conference}:${number}`;
}

function preview(body: string): string {
  // Prefer the first line with actual words (skip CP437 box-art / rule lines).
  const lines = body.split('\n').map((s) => s.trim());
  const line = lines.find((s) => /[A-Za-z0-9]/.test(s)) ?? lines.find((s) => s.length > 0) ?? '';
  return line.length > 80 ? line.slice(0, 80) + '…' : line;
}

export interface ParsedPacket {
  messages: Message[];
  /** CONTROL.DAT conference directory (number → name; 0 = private mail). */
  qwkConferences: { number: number; name: string }[];
}

/**
 * Parse a .QWK packet into UI messages plus its conference directory. Each
 * message maps to an area by its conference number (`a<conference>`), conference
 * 0 is flagged as private mail, and message ids are stable across re-parse so
 * read state persists. The conference directory feeds the server-driven
 * taxonomy (see {@link buildTaxonomy}).
 */
export function parsePacket(bytes: Uint8Array, bbsId: string): ParsedPacket {
  const packet = readQwkPacket(bytes);
  const messages: Message[] = [];
  for (const m of packet.messages) {
    if (!m.active) continue;
    const isPrivate = m.isPrivate || m.conference === PRIVATE_CONFERENCE;
    messages.push({
      id: stableMessageId(bbsId, m.conference, m.number),
      number: m.number,
      areaId: isPrivate ? PRIVATE_AREA_ID : areaIdForConference(m.conference),
      subject: m.subject,
      from: m.from,
      to: m.to,
      date: m.date,
      time: m.time,
      body: m.body,
      isPrivate,
      preview: preview(m.body),
      reference: m.reference || undefined,
      messageId: m.messageId || undefined,
    });
  }
  return { messages, qwkConferences: packet.control.conferences };
}

/** Convenience wrapper when only the messages are needed. */
export function parsePacketToMessages(bytes: Uint8Array, bbsId: string): Message[] {
  return parsePacket(bytes, bbsId).messages;
}
