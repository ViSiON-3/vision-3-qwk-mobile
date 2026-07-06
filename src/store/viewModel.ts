import { readQwkPacket } from '../qwk';
import { Message } from './types';
import { areaByQwkConference, PRIVATE_AREA_ID, PRIVATE_CONFERENCE } from './taxonomy';

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

/**
 * Parse a .QWK packet into UI messages: group by the area whose qwkConference
 * matches, flag conference-0 as private mail, and skip deleted/out-of-taxonomy
 * messages. Message ids are stable across re-parse so read state persists.
 */
export function parsePacketToMessages(bytes: Uint8Array, bbsId: string): Message[] {
  const packet = readQwkPacket(bytes);
  const out: Message[] = [];
  for (const m of packet.messages) {
    if (!m.active) continue;
    const isPrivate = m.isPrivate || m.conference === PRIVATE_CONFERENCE;
    const area = isPrivate ? undefined : areaByQwkConference(m.conference);
    if (!isPrivate && !area) continue; // conference not represented in our taxonomy
    out.push({
      id: stableMessageId(bbsId, m.conference, m.number),
      number: m.number,
      areaId: isPrivate ? PRIVATE_AREA_ID : area!.id,
      subject: m.subject,
      from: m.from,
      to: m.to,
      date: m.date,
      time: m.time,
      body: m.body,
      isPrivate,
      preview: preview(m.body),
      reference: m.reference || undefined,
    });
  }
  return out;
}
