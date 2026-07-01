import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, Card, Eyebrow, ListRow, Mono, GearButton } from '../components';
import { colors, fontSize, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore, privateMessages } from '../store/useStore';

/** MAIL tab — conference-0 email, kept separate from public conferences. */
export function PrivateMailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const readIds = useStore((s) => s.readIds);
  const messages = useStore((s) => s.messages);
  const list = privateMessages(messages);

  return (
    <Screen title="PRIVATE MAIL" right={<GearButton />} scroll>
      <Eyebrow color={colors.magenta}>CONFERENCE 0 · EMAIL</Eyebrow>
      <Card style={styles.card}>
        {list.map((m, i) => {
          const unread = !readIds.has(m.id);
          return (
            <ListRow
              key={m.id}
              onPress={() => nav.navigate('Reader', { areaId: m.areaId, messageId: m.id })}
              last={i === list.length - 1}
              style={styles.row}
            >
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
                    {m.subject}
                  </Mono>
                  <Mono size={fontSize.listMeta} color={colors.textMuted}>
                    {m.date}
                  </Mono>
                </View>
                <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.meta}>
                  from <Mono size={fontSize.listMeta} color={colors.blueText}>{m.from}</Mono>
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
