import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Eyebrow, ListRow, Vga, Mono, Chip, UnreadPill, GearButton } from '../components';
import { colors, fontSize, spacing, radius } from '../theme/tokens';
import { RootStackParamList, TabParamList } from '../navigation/types';
import { useStore, areasForConference, unreadInConference } from '../store/useStore';

/** CONF tab — top-level list of conferences (message networks). */
export function ConferencesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const readIds = useStore((s) => s.readIds);
  const messages = useStore((s) => s.messages);
  const conferences = useStore((s) => s.conferences);
  const areas = useStore((s) => s.areas);

  if (conferences.length === 0) {
    return (
      <Screen title="CONFERENCES" onBack={() => tabNav.navigate('Sync')} right={<GearButton />} scroll>
        <View style={styles.empty}>
          <Ionicons name="layers-outline" size={48} color={colors.textDim} />
          <Vga size={fontSize.body} color={colors.textMuted} style={styles.emptyText}>
            No conferences yet
          </Vga>
          <Mono size={fontSize.listMeta} color={colors.textDim} style={styles.emptyHint}>
            Sync a packet to load this board's message areas.
          </Mono>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="CONFERENCES" onBack={() => tabNav.navigate('Sync')} right={<GearButton />} scroll>
      <Eyebrow>{`TAGGED NETWORKS · ${conferences.length} CONFERENCES`}</Eyebrow>
      <Card style={styles.card}>
        {conferences.map((conf, i) => {
          const tileBg = conf.isNet ? 'rgba(85,255,255,0.10)' : 'rgba(68,102,255,0.12)';
          const tileBorder = conf.isNet ? colors.cyanAlt : colors.blue;
          const iconColor = conf.isNet ? colors.cyan : colors.blueTextAlt;
          return (
            <ListRow
              key={conf.id}
              onPress={() => nav.navigate('Areas', { conferenceId: conf.id })}
              last={i === conferences.length - 1}
            >
              <View style={[styles.tile, { backgroundColor: tileBg, borderColor: tileBorder }]}>
                <Ionicons name="layers-outline" size={18} color={iconColor} />
              </View>
              <View style={styles.content}>
                <View style={styles.nameRow}>
                  <Vga size={17} color={colors.textPrimary}>
                    {conf.name}
                  </Vga>
                  {conf.isNet && <Chip label="NET" />}
                </View>
                <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.subline}>
                  {`${areasForConference(areas, conf.id).length} areas · ${conf.tag}`}
                </Mono>
              </View>
              <UnreadPill count={unreadInConference(messages, areas, conf.id, readIds)} />
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subline: { marginTop: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: spacing.sm },
  emptyText: {},
  emptyHint: {},
});
