import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '../theme/tokens';
import { Vga } from './text';

interface ConsoleProgressProps {
  /** Status lines revealed one-by-one on a fixed cadence. */
  lines: string[];
  /** Show a block progress bar + percentage that tracks revealed/total. */
  showBar?: boolean;
  /** Accent color for the streamed lines + bar (default green). */
  accent?: string;
  intervalMs?: number;
  onDone?: () => void;
  /** Real progress 0..1 to drive the bar (e.g. bytes downloaded). When null/
   * undefined the bar falls back to the line-reveal cadence. */
  progress?: number | null;
}

/** Terminal-style progress block (connect handshake, sync, upload). */
export function ConsoleProgress({
  lines,
  showBar,
  accent = colors.green,
  intervalMs = 240,
  onDone,
  progress,
}: ConsoleProgressProps) {
  const [revealed, setRevealed] = useState(1);
  const blink = useRef(new Animated.Value(1)).current;
  // Keep onDone in a ref so an inline callback's changing identity can't reset
  // the reveal timer mid-cadence.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [blink]);

  useEffect(() => {
    if (revealed >= lines.length) {
      const t = setTimeout(() => onDoneRef.current?.(), intervalMs);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed((n) => n + 1), intervalMs);
    return () => clearTimeout(t);
  }, [revealed, lines.length, intervalMs]);

  const revealPct = lines.length > 0 ? Math.min(100, Math.round((revealed / lines.length) * 100)) : 0;
  // Real byte progress drives the bar when provided; otherwise the reveal cadence.
  const pct = progress != null ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : revealPct;
  const filled = Math.round((pct / 100) * 16);
  const bar = '█'.repeat(filled) + '░'.repeat(16 - filled);

  return (
    <View style={styles.console}>
      {lines.slice(0, revealed).map((line, i) => (
        <View key={i} style={styles.lineRow}>
          <Vga color={accent} size={fontSize.body} style={styles.prompt}>
            {'> '}
          </Vga>
          <Vga color={i === revealed - 1 ? colors.greenSoft : colors.textBody} size={fontSize.body} style={styles.lineText}>
            {line}
          </Vga>
          {i === revealed - 1 && (
            <Animated.Text style={[styles.cursor, { opacity: blink }]}>█</Animated.Text>
          )}
        </View>
      ))}
      {showBar && (
        <View style={styles.barRow}>
          <Vga color={accent} size={fontSize.body}>
            {bar}
          </Vga>
          <Vga color={colors.textMuted} size={fontSize.body} style={styles.pct}>
            {'  '}
            {pct}%
          </Vga>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  console: {
    backgroundColor: colors.surfaceConsole,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    minHeight: 120,
  },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  prompt: {},
  lineText: { flexShrink: 1 },
  cursor: { fontFamily: fonts.vga, color: colors.greenSoft, fontSize: fontSize.body, marginLeft: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  pct: {},
});
