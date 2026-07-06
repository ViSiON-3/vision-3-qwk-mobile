import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme/tokens';
import { Mono } from './text';
import { ListRow } from './primitives';
import { Message } from '../store/types';

interface MessageListRowProps {
  message: Message;
  unread: boolean;
  onPress: () => void;
  /** Right-of-subject text (e.g. a date, or "#12  06-30-26"). */
  metaRight: string;
  /** Show the "→ recipient" segment (public areas) vs. from-only (private mail). */
  showRecipient?: boolean;
  last?: boolean;
}

/** Shared message-list row (unread marker, subject/date, from[/to], preview).
 * Used by the public area list and Private Mail so the two can't drift. */
export function MessageListRow({ message, unread, onPress, metaRight, showRecipient, last }: MessageListRowProps) {
  return (
    <ListRow onPress={onPress} last={last} style={styles.row}>
      <Mono size={fontSize.listPrimary} color={unread ? colors.cyan : colors.textDim} style={styles.marker}>
        {unread ? '▸' : '·'}
      </Mono>
      <View style={styles.content}>
        <View style={styles.topLine}>
          <Mono
            weight={unread ? 'semibold' : 'regular'}
            size={fontSize.listPrimary}
            color={unread ? colors.textPrimary : colors.textRead}
            style={styles.subject}
            numberOfLines={1}
          >
            {message.subject}
          </Mono>
          <Mono size={fontSize.listMeta} color={colors.textMuted}>
            {metaRight}
          </Mono>
        </View>
        <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.meta}>
          from{' '}
          <Mono size={fontSize.listMeta} color={colors.blueText}>
            {message.from}
          </Mono>
          {showRecipient && (
            <>
              {' → '}
              <Mono size={fontSize.listMeta} color={colors.blueText}>
                {message.to}
              </Mono>
            </>
          )}
        </Mono>
        <Mono size={fontSize.listMeta} color={colors.textMuted} numberOfLines={1} style={styles.preview}>
          {message.preview}
        </Mono>
      </View>
    </ListRow>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start' },
  marker: { width: 16, marginTop: 1 },
  content: { flex: 1 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subject: { flex: 1, marginRight: spacing.sm },
  meta: { marginTop: 3 },
  preview: { marginTop: 3 },
});
