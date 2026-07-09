import React, { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { colors, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Vga, Card, Button, GearButton, ConsoleProgress, useToast } from '../components';
import { TabParamList } from '../navigation/types';
import { useStore, activeBoard, unreadTotal, privateUnread } from '../store/useStore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/ViSiON3.png');

const SYNC_LINES = [
  'POST /api/qwk/packet',
  'building QWK ...',
  'MESSAGES.DAT + HEADERS.DAT',
  'compressing ...',
  'downloading packet ...',
  'packet committed.',
];

type Props = BottomTabScreenProps<TabParamList, 'Sync'>;

export function SyncScreen({ navigation }: Props) {
  const board = useStore(activeBoard);
  const readIds = useStore((s) => s.readIds);
  const messages = useStore((s) => s.messages);
  const drafts = useStore((s) => s.drafts);
  const syncing = useStore((s) => s.syncing);
  const downloadProgress = useStore((s) => s.downloadProgress);
  const lastPacket = useStore((s) => s.lastPacket);
  const syncNow = useStore((s) => s.syncNow);
  const error = useStore((s) => s.error);
  const toast = useToast();

  const unread = unreadTotal(messages, readIds);
  const priv = privateUnread(messages, readIds);

  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && !syncing) toast(error ?? 'Packet received');
    wasSyncing.current = syncing;
  }, [syncing, error, toast]);

  return (
    <Screen title="OFFLINE MAIL" right={<GearButton />} scroll>
      <Card style={styles.identity}>
        <Image source={LOGO} style={styles.identityLogo} resizeMode="contain" />
        <View style={styles.identityText}>
          <Vga color={colors.textPrimary} size={16}>
            {board?.name}
          </Vga>
          <Mono color={colors.textMuted} size={fontSize.listMeta}>
            sysop {board?.sysop ?? '—'} · {board?.host}
          </Mono>
        </View>
      </Card>

      <View style={styles.statsRow}>
        <Card style={styles.unreadCard}>
          <Mono color={colors.cyan} size={fontSize.statBig} weight="bold">
            {unread}
          </Mono>
          <Vga color={colors.textSecondary} size={fontSize.eyebrow} spacing={letterSpacing.label}>
            UNREAD MESSAGES
          </Vga>
        </Card>
        <View style={styles.tiles}>
          <Pressable style={styles.tile} onPress={() => navigation.navigate('Mail')}>
            <Vga color={colors.magenta} size={fontSize.eyebrow} spacing={letterSpacing.label}>
              PRIVATE MAIL
            </Vga>
            <View style={styles.tileValue}>
              <Mono color={colors.textPrimary} size={fontSize.statSmall} weight="bold">
                {priv}
              </Mono>
              <Mono color={colors.textMuted} size={fontSize.listMeta}>
                {'  '}new
              </Mono>
            </View>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => navigation.navigate('Outbox')}>
            <Vga color={colors.amber} size={fontSize.eyebrow} spacing={letterSpacing.label}>
              OUTBOX
            </Vga>
            <View style={styles.tileValue}>
              <Mono color={colors.textPrimary} size={fontSize.statSmall} weight="bold">
                {drafts.length}
              </Mono>
              <Mono color={colors.textMuted} size={fontSize.listMeta}>
                {'  '}queued
              </Mono>
            </View>
          </Pressable>
        </View>
      </View>

      {syncing ? (
        <ConsoleProgress lines={SYNC_LINES} showBar accent={colors.green} progress={downloadProgress} />
      ) : (
        <>
          {lastPacket && (
            <Card style={styles.packet}>
              <View style={styles.packetHead}>
                <Vga color={colors.textMuted} size={fontSize.eyebrow} spacing={letterSpacing.label}>
                  LAST PACKET
                </Vga>
                <Mono color={colors.green} size={fontSize.listMeta}>
                  ✓ {lastPacket.date}
                </Mono>
              </View>
              <Mono color={colors.textPrimary} size={fontSize.body} weight="semibold" style={styles.packetFile}>
                {lastPacket.file}
              </Mono>
              <Mono color={colors.textMuted} size={fontSize.listMeta}>
                {lastPacket.msgs} msgs · {lastPacket.confs} confs · {lastPacket.areas} areas · {lastPacket.kb} KB
              </Mono>
            </Card>
          )}
          <Button title="⟱ PACK NEW MAIL" onPress={syncNow} style={styles.pack} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityLogo: { width: 44, height: 34 },
  identityText: { flex: 1 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  unreadCard: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: colors.blue,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  tiles: { flex: 1, gap: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    justifyContent: 'center',
  },
  tileValue: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  packet: { marginTop: spacing.md },
  packetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  packetFile: { marginBottom: 2 },
  pack: { marginTop: spacing.md },
});
