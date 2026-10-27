import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, fonts, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { Screen, Mono, Vga, Card, Button, Chip, ConsoleProgress } from '../components';
import { RootStackParamList } from '../navigation/types';
import { useStore, activeBoard } from '../store/useStore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOGO = require('../../assets/ViSiON3.png');

type Props = NativeStackScreenProps<RootStackParamList, 'Connect'>;

export function ConnectScreen({ navigation }: Props) {
  const board = useStore(activeBoard);
  const connecting = useStore((s) => s.connecting);
  const pairing = useStore((s) => s.pairing);
  const connect = useStore((s) => s.connect);
  const error = useStore((s) => s.error);
  const demoMode = useStore((s) => s.settings.demoMode);
  const [password, setPassword] = useState('');

  // The password is for one request (pairing) only: drop it whenever the board
  // or its pairing state changes, so a password typed for one BBS can never be
  // sent to another.
  const paired = !!board?.pairing;
  useEffect(() => {
    setPassword('');
  }, [paired, board?.id]);

  const needsPassword = !demoMode && !paired;

  const handshake = board
    ? [
        `ATDT ${board.host}:${board.port}`,
        'CONNECT 57600 / TLS',
        ...(pairing
          ? [`login: ${board.handle}`, 'generating device key ...', 'pairing this phone ... OK']
          : [`device: ${board.pairing?.deviceName ?? 'this phone'}`, 'signing challenge ... OK']),
        `Welcome back, ${board.handle}.`,
        'negotiating QWK packet API ...',
        'ready.',
      ]
    : [];

  const onDial = () => {
    if (needsPassword && !password) return;
    const pw = password;
    setPassword(''); // out of React state as soon as it is handed over
    connect(needsPassword ? pw : undefined);
  };

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
                {board?.handle || '—'}
              </Mono>
            </View>
            <View style={styles.summaryRow}>
              <Mono color={colors.textMuted} size={fontSize.listMeta} spacing={letterSpacing.label}>
                HOST
              </Mono>
              <Mono color={colors.textBody} size={fontSize.body}>
                {board ? `${board.host}:${board.port}` : '—'}
              </Mono>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowLast]}>
              <Mono color={colors.textMuted} size={fontSize.listMeta} spacing={letterSpacing.label}>
                THIS PHONE
              </Mono>
              {demoMode ? (
                <Chip label="DEMO" color={colors.amber} />
              ) : paired ? (
                <Chip label="PAIRED" color={colors.green} />
              ) : (
                <Chip label="NOT PAIRED" color={colors.amber} />
              )}
            </View>
          </Card>

          {needsPassword && (
            <View style={styles.pairBlock}>
              <Vga color={colors.magenta} size={fontSize.eyebrow} spacing={letterSpacing.label} style={styles.label}>
                PASSWORD
              </Vga>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="used once to pair this phone"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={onDial}
              />
              <Mono color={colors.textDim} size={fontSize.listMeta} style={styles.hint}>
                Pairing registers a key kept in this phone’s secure hardware. The password is never stored; after
                this, Dial In signs a server challenge instead.
              </Mono>
            </View>
          )}

          {error && (
            <Card style={styles.error}>
              <Mono color={colors.red} size={fontSize.listMeta}>
                ✗ {error}
              </Mono>
            </Card>
          )}

          <Button
            title={demoMode ? '▸ DIAL IN (DEMO)' : needsPassword ? '▸ PAIR & DIAL IN' : '▸ DIAL IN'}
            onPress={onDial}
            disabled={needsPassword && !password}
            style={styles.dial}
          />

          <View style={styles.links}>
            <Pressable onPress={() => navigation.navigate('Boards')} style={styles.credLink}>
              <Mono color={colors.textDim} size={fontSize.listMeta}>
                Edit Boards ›
              </Mono>
            </Pressable>
            {!demoMode && (
              <Pressable onPress={() => navigation.navigate('Devices')} style={styles.credLink}>
                <Mono color={colors.textDim} size={fontSize.listMeta}>
                  Paired devices ›
                </Mono>
              </Pressable>
            )}
          </View>
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
  pairBlock: { marginTop: spacing.lg },
  input: {
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.input,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: fontSize.listPrimary,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  hint: { marginTop: spacing.sm },
  error: { marginTop: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.red },
  dial: { marginTop: spacing.lg },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.md },
  credLink: { alignItems: 'center' },
});
