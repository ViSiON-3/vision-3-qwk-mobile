import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontSize, spacing } from '../theme/tokens';
import { Vga } from './text';
import { useStore, activeBoard } from '../store/useStore';

/** BBS status line under the OS status bar on every logged-in screen. */
export function StatusLine() {
  const board = useStore(activeBoard);
  if (!board) return null;
  return (
    <LinearGradient
      colors={[colors.statusGradFrom, colors.statusGradTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.bar}
    >
      <Vga color={colors.cyan} size={fontSize.eyebrow} spacing={0.5} numberOfLines={1} style={styles.text}>
        {board.name}
      </Vga>
      <Vga color={colors.textMuted} size={fontSize.eyebrow} spacing={0.5} style={styles.text}>
        {' · NODE '}
        {board.node ?? '1'}
      </Vga>
      <View style={styles.spacer} />
      <View style={styles.offlineDot} />
      <Vga color={colors.amber} size={fontSize.eyebrow} spacing={0.5} style={styles.text}>
        OFFLINE
      </Vga>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
    paddingVertical: 6,
  },
  text: { flexShrink: 1 },
  spacer: { flex: 1 },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.amber,
    marginRight: 6,
  },
});
