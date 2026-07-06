import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Mono, Button } from '../components';
import { colors, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { formatSize } from '../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'Storage'>;

/** Screen 13 — free device space by deleting cached packets. */
export function StorageScreen({ navigation }: Props) {
  const packets = useStore((s) => s.packets);
  const deletePacket = useStore((s) => s.deletePacket);
  const clearPackets = useStore((s) => s.clearPackets);

  const usedKb = packets.reduce((n, p) => n + p.kb, 0);
  const fill = Math.max(0, Math.min(1, usedKb / 1024));

  return (
    <Screen title="STORAGE" onBack={() => navigation.goBack()} scroll>
      <Card style={styles.summary}>
        <View style={styles.summaryTop}>
          <Mono weight="bold" size={fontSize.statMed} spacing={letterSpacing.label} color={colors.cyan}>
            {formatSize(usedKb)}
          </Mono>
          <Mono size={fontSize.listMeta} color={colors.textMuted}>
            {`${packets.length} packet${packets.length === 1 ? '' : 's'}`}
          </Mono>
        </View>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${fill * 100}%` }]} />
        </View>
        <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.summaryHint}>
          Delete old packets to free space on this device
        </Mono>
      </Card>

      {packets.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="file-tray-outline" size={40} color={colors.textDim} />
          <Mono size={fontSize.listPrimary} color={colors.textMuted} style={styles.emptyText}>
            No packets stored
          </Mono>
        </View>
      ) : (
        <>
          {packets.map((p) => (
            <View key={p.id} style={styles.rowWrap}>
              <Card style={styles.packetCard}>
                <View style={styles.packetIcon}>
                  <Ionicons name="document-text-outline" size={18} color={colors.blueText} />
                </View>
                <View style={styles.packetInfo}>
                  <Mono size={fontSize.listPrimary} color={colors.textPrimary} numberOfLines={1}>
                    {p.file}
                  </Mono>
                  <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.packetMeta}>
                    {`${p.msgs} msgs · ${p.kb} KB · ${p.date}`}
                  </Mono>
                </View>
              </Card>
              <Pressable
                onPress={() => deletePacket(p.id)}
                style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
                hitSlop={6}
              >
                <Ionicons name="trash-outline" size={16} color={colors.red} />
              </Pressable>
            </View>
          ))}

          <View style={styles.clearWrap}>
            <Button title="CLEAR ALL DOWNLOADS" variant="danger" onPress={clearPackets} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { marginBottom: spacing.lg },
  summaryTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.borderInput,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 3 },
  summaryHint: { marginTop: spacing.sm },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  packetCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  packetIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packetInfo: { flex: 1 },
  packetMeta: { marginTop: 3 },
  deleteButton: {
    width: 44,
    borderWidth: 1,
    borderColor: colors.redAlt,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePressed: { backgroundColor: colors.surfaceInset },
  clearWrap: { marginTop: spacing.xs },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl * 2, gap: spacing.md },
  emptyText: { marginTop: spacing.xs },
});
