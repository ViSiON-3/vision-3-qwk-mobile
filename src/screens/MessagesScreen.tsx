import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Card, Eyebrow, ListRow, Mono } from '../components';
import { colors, fontSize, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore, areas, messagesForArea, unreadInArea } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Messages'>;

/** Drill-down — the messages in one area (flat, chronological QWK ordering). */
export function MessagesScreen({ route, navigation }: Props) {
  const { areaId } = route.params;
  const readIds = useStore((s) => s.readIds);
  const markRead = useStore((s) => s.markRead);
  const area = areas.find((a) => a.id === areaId);
  const list = messagesForArea(areaId);
  const unread = unreadInArea(areaId, readIds);

  const open = (id: string) => {
    markRead(id);
    navigation.navigate('Reader', { areaId, messageId: id });
  };

  return (
    <Screen title={area?.name ?? 'MESSAGES'} onBack={() => navigation.goBack()} scroll>
      <Eyebrow>{`${list.length} MESSAGES · ${unread} UNREAD`}</Eyebrow>
      <Card style={styles.card}>
        {list.map((m, i) => {
          const isUnread = !readIds.has(m.id);
          return (
            <ListRow key={m.id} onPress={() => open(m.id)} last={i === list.length - 1} style={styles.row}>
              <Mono
                size={fontSize.listPrimary}
                color={isUnread ? colors.cyan : colors.textDim}
                style={styles.marker}
              >
                {isUnread ? '▸' : '·'}
              </Mono>
              <View style={styles.content}>
                <View style={styles.topLine}>
                  <Mono
                    weight={isUnread ? 'semibold' : 'regular'}
                    size={fontSize.listPrimary}
                    color={isUnread ? colors.textPrimary : colors.textRead}
                    style={styles.subject}
                    numberOfLines={1}
                  >
                    {m.subject}
                  </Mono>
                  <Mono size={fontSize.listMeta} color={colors.textMuted}>
                    {`#${m.number}  ${m.date}`}
                  </Mono>
                </View>
                <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.meta}>
                  from <Mono size={fontSize.listMeta} color={colors.blueText}>{m.from}</Mono>
                  {' → '}
                  <Mono size={fontSize.listMeta} color={colors.blueText}>{m.to}</Mono>
                </Mono>
                <Mono size={fontSize.listMeta} color={colors.textMuted} numberOfLines={1} style={styles.preview}>
                  {m.preview}
                </Mono>
              </View>
            </ListRow>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  row: { alignItems: 'flex-start' },
  marker: { width: 16, marginTop: 1 },
  content: { flex: 1 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subject: { flex: 1, marginRight: spacing.sm },
  meta: { marginTop: 3 },
  preview: { marginTop: 3 },
});
