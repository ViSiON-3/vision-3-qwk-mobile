import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Vga, Card, Button, ConsoleProgress } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore, activeBoard } from '../store/useStore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/ViSiON3.png');

type Props = NativeStackScreenProps<RootStackParamList, 'Connect'>;

export function ConnectScreen({ navigation }: Props) {
  const board = useStore(activeBoard);
  const connecting = useStore((s) => s.connecting);
  const connect = useStore((s) => s.connect);
  const error = useStore((s) => s.error);
  const demoMode = useStore((s) => s.settings.demoMode);

  const handshake = board
    ? [
        `ATDT ${board.host}:${board.port}`,
        'CONNECT 57600 / SSH-2.0',
        `login: ${board.handle}`,
        'verifying credentials ... OK',
        `Welcome back, ${board.handle}.`,
        'negotiating QWK packet API ...',
        'ready.',
      ]
    : [];

  return (
    <Screen statusLine={false} scroll>
      <View style={styles.hero}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Vga color={colors.textSecondary} size={fontSize.eyebrow} spacing={letterSpacing.titleWide} style={styles.tagline}>
          OFFLINE MAIL TERMINAL
        </Vga>
      </View>

      {connecting ? (
        <ConsoleProgress lines={handshake} accent={colors.green} />
      ) : (
        <>
          <Vga color={colors.magenta} size={fontSize.eyebrow} spacing={letterSpacing.label} style={styles.label}>
            BOARD
          </Vga>
          <Pressable style={styles.boardBtn} onPress={() => navigation.navigate('Boards')}>
            <Vga color={colors.textPrimary} size={fontSize.body}>
              {board?.name ?? 'No board'}
            </Vga>
            <Mono color={colors.cyan} size={fontSize.buttonSmall}>
              switch ▾
            </Mono>
          </Pressable>

          <Card style={styles.summary}>
            <View style={styles.summaryRow}>
              <Mono color={colors.textMuted} size={fontSize.listMeta} spacing={letterSpacing.label}>
                LOGIN
              </Mono>
              <Mono color={colors.blueText} size={fontSize.body} weight="semibold">
                {board?.handle ?? '—'}
              </Mono>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowLast]}>
              <Mono color={colors.textMuted} size={fontSize.listMeta} spacing={letterSpacing.label}>
                HOST
              </Mono>
              <Mono color={colors.textBody} size={fontSize.body}>
                {board ? `${board.host}:${board.port}` : '—'}
              </Mono>
            </View>
          </Card>

          {error && (
            <Card style={styles.error}>
              <Mono color={colors.red} size={fontSize.listMeta}>
                ✗ {error}
              </Mono>
            </Card>
          )}

          <Button title={demoMode ? '▸ DIAL IN (DEMO)' : '▸ DIAL IN'} onPress={connect} style={styles.dial} />

          <Pressable onPress={() => navigation.navigate('Boards')} style={styles.credLink}>
            <Mono color={colors.textDim} size={fontSize.listMeta}>
              credentials managed per board — edit in Boards ›
            </Mono>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg },
  logo: { width: 180, height: 110 },
  tagline: { marginTop: spacing.md },
  label: { marginBottom: spacing.sm },
  boardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 2,
    borderLeftColor: colors.cyan,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  summary: { marginTop: spacing.md, paddingVertical: spacing.sm },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDivider,
  },
  summaryRowLast: { borderBottomWidth: 0 },
  error: { marginTop: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.red },
  dial: { marginTop: spacing.lg },
  credLink: { alignItems: 'center', marginTop: spacing.md },
});
