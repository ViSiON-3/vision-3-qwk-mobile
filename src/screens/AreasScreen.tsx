import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Card, Eyebrow, ListRow, Vga, Mono, UnreadPill } from '../components';
import { colors, fontSize, spacing, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore, conferences, areasForConference, unreadInArea, unreadInConference } from '../store/useStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Areas'>;

/** Drill-down — the message areas belonging to one conference. */
export function AreasScreen({ route, navigation }: Props) {
  const { conferenceId } = route.params;
  const readIds = useStore((s) => s.readIds);
  const conf = conferences.find((c) => c.id === conferenceId);
  const list = areasForConference(conferenceId);
  const totalUnread = unreadInConference(conferenceId, readIds);

  return (
    <Screen title={(conf?.name ?? 'AREAS').toUpperCase()} onBack={() => navigation.goBack()} scroll>
      <Eyebrow>{`${conf?.name ?? ''} · ${list.length} AREAS · ${totalUnread} UNREAD`}</Eyebrow>
      <Card style={styles.card}>
        {list.map((area, i) => {
          const unread = unreadInArea(area.id, readIds);
          return (
            <ListRow
              key={area.id}
              onPress={() => navigation.navigate('Messages', { areaId: area.id })}
              last={i === list.length - 1}
            >
              <View style={styles.tile}>
                <Mono weight="semibold" size={fontSize.listMeta} color={colors.blueText}>
                  {area.number}
                </Mono>
              </View>
              <View style={styles.content}>
                <Vga size={16} color={colors.textPrimary}>
                  {area.name}
                </Vga>
                <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.subline}>
                  {area.tag}
                </Mono>
              </View>
              {unread > 0 ? (
                <UnreadPill count={unread} />
              ) : (
                <Mono size={fontSize.listPrimary} color={colors.textDim}>
                  ·
                </Mono>
              )}
            </ListRow>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  tile: {
    width: 34,
    height: 34,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: { flex: 1 },
  subline: { marginTop: 3 },
});
