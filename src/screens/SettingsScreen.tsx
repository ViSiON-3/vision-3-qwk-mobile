import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Card, Eyebrow, Mono, Button } from '../components';
import { colors, fontSize, letterSpacing, radius, spacing } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useStore, activeBoard } from '../store/useStore';
import { Settings } from '../store/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/** Format a sum of packet KB as "n KB" or "n.n MB". */
function formatSize(totalKb: number): string {
  if (totalKb >= 1024) return `${(totalKb / 1024).toFixed(1)} MB`;
  return `${totalKb} KB`;
}

/** Screen 10 — display prefs + entry to boards/storage + disconnect. */
export function SettingsScreen({ navigation }: Props) {
  const settings = useStore((s) => s.settings);
  const setPlatform = useStore((s) => s.setPlatform);
  const toggleScanlines = useStore((s) => s.toggleScanlines);
  const toggleGlow = useStore((s) => s.toggleGlow);
  const toggleDemoMode = useStore((s) => s.toggleDemoMode);
  const boards = useStore((s) => s.boards);
  const packets = useStore((s) => s.packets);
  const disconnect = useStore((s) => s.disconnect);
  const board = useStore(activeBoard);

  const usedKb = packets.reduce((n, p) => n + p.kb, 0);

  return (
    <Screen title="SETTINGS" onBack={() => navigation.goBack()} scroll>
      <Eyebrow color={colors.magenta}>DISPLAY</Eyebrow>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Mono size={fontSize.listPrimary} color={colors.textPrimary}>
              Platform
            </Mono>
            <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
              prototype only
            </Mono>
          </View>
          <Segmented
            value={settings.platform}
            onChange={setPlatform}
            options={[
              { label: 'iOS', value: 'ios' },
              { label: 'Android', value: 'android' },
            ]}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Mono size={fontSize.listPrimary} color={colors.textPrimary}>
              Scanlines
            </Mono>
            <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
              CRT scanline overlay
            </Mono>
          </View>
          <Switch
            value={settings.scanlines}
            onValueChange={toggleScanlines}
            trackColor={{ true: colors.toggleOn, false: colors.borderStrong }}
            thumbColor="#ffffff"
            ios_backgroundColor={colors.borderStrong}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Mono size={fontSize.listPrimary} color={colors.textPrimary}>
              CRT glow
            </Mono>
            <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
              phosphor text shadow
            </Mono>
          </View>
          <Switch
            value={settings.glow}
            onValueChange={toggleGlow}
            trackColor={{ true: colors.toggleOn, false: colors.borderStrong }}
            thumbColor="#ffffff"
            ios_backgroundColor={colors.borderStrong}
          />
        </View>
      </Card>

      <View style={styles.section}>
        <Eyebrow color={colors.magenta}>CONNECTION</Eyebrow>
      </View>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Mono size={fontSize.listPrimary} color={colors.textPrimary}>
              Live connection
            </Mono>
            <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
              {settings.demoMode ? 'off — using demo sample packet' : 'on — real QWK API (needs dev build for TLS)'}
            </Mono>
          </View>
          <Switch
            value={!settings.demoMode}
            onValueChange={toggleDemoMode}
            trackColor={{ true: colors.toggleOn, false: colors.borderStrong }}
            thumbColor="#ffffff"
            ios_backgroundColor={colors.borderStrong}
          />
        </View>

        <View style={styles.divider} />

        <Pressable
          onPress={() => navigation.navigate('Boards')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowLabel}>
            <Mono size={fontSize.listPrimary} color={colors.textPrimary}>
              Boards
            </Mono>
            <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
              {board?.name ?? 'No board'}
            </Mono>
          </View>
          <View style={styles.rowRight}>
            <Mono size={fontSize.listMeta} color={colors.textMuted}>
              {boards.length}
            </Mono>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          onPress={() => navigation.navigate('Storage')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowLabel}>
            <Mono size={fontSize.listPrimary} color={colors.textPrimary}>
              Downloaded packets
            </Mono>
            <Mono size={fontSize.listMeta} color={colors.textMuted} style={styles.sub}>
              {formatSize(usedKb)} used
            </Mono>
          </View>
          <View style={styles.rowRight}>
            <Mono size={fontSize.listMeta} color={colors.textMuted}>
              {packets.length}
            </Mono>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </Pressable>
      </Card>

      <View style={styles.section}>
        <Button title="⏻ DISCONNECT" variant="danger" onPress={disconnect} />
      </View>

      <Mono size={fontSize.listMeta} color={colors.textDim} style={styles.footer}>
        ViSiON/3 QWK Mobile · v0.1.0
      </Mono>
    </Screen>
  );
}

interface SegOption {
  label: string;
  value: Settings['platform'];
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: Settings['platform'];
  onChange: (v: Settings['platform']) => void;
  options: SegOption[];
}) {
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segButton, active && styles.segButtonActive]}
          >
            <Mono
              weight={active ? 'semibold' : 'regular'}
              size={fontSize.buttonSmall}
              spacing={letterSpacing.label}
              color={active ? colors.textPrimary : colors.textMuted}
            >
              {opt.label}
            </Mono>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden' },
  section: { marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceInset },
  rowLabel: { flex: 1, marginRight: spacing.md },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sub: { marginTop: 3 },
  divider: { height: 1, backgroundColor: colors.borderDivider, marginHorizontal: spacing.md },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceInset,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderInput,
    padding: 2,
  },
  segButton: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
  },
  segButtonActive: {
    backgroundColor: colors.blue,
  },
  footer: { textAlign: 'center', marginTop: spacing.xl },
});
