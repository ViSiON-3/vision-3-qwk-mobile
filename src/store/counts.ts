import { Message } from './types';
import { AreaConfig } from './taxonomy';

/** Pure message-count selectors (no React Native imports, so they unit-test in node). */

/**
 * Messages the user can actually reach: private mail plus anything in a
 * current area. Cached packets may still hold messages for areas that have
 * since dropped out of the taxonomy (untagged on the server); those stay on
 * disk so they reappear if the area comes back, but they must not be counted.
 */
export function visibleMessages(messages: Message[], areas: AreaConfig[]): Message[] {
  const live = new Set(areas.map((a) => a.id));
  return messages.filter((m) => m.isPrivate || live.has(m.areaId));
}

export function privateMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.isPrivate);
}

export function privateUnread(messages: Message[], readIds: Set<string>): number {
  return privateMessages(messages).reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}

export function unreadTotal(messages: Message[], areas: AreaConfig[], readIds: Set<string>): number {
  return visibleMessages(messages, areas).reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
