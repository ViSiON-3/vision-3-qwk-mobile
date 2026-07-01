import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../theme/tokens';
import { Mono, ScreenTitle } from './text';
import { StatusLine } from './StatusLine';
import { CrtOverlay } from './CrtOverlay';

interface ScreenProps {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  scroll?: boolean;
  statusLine?: boolean;
  contentPadding?: boolean;
  children: React.ReactNode;
}

/**
 * Standard screen chrome: safe-area top, BBS status line, a header (back chevron
 * on drill-downs, VGA title, right-side actions), content, and the CRT overlay.
 */
export function Screen({ title, onBack, right, scroll, statusLine = true, contentPadding = true, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;

  return (
    <View style={styles.root}>
      <View style={{ height: insets.top, backgroundColor: colors.appBg }} />
      {statusLine && <StatusLine />}
      {(title || onBack || right) && (
        <View style={styles.header}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
              <Ionicons name="chevron-back" size={18} color={colors.blueText} />
              <Mono size={fontSize.button} color={colors.blueText}>
                Back
              </Mono>
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
          {title ? <ScreenTitle>{title}</ScreenTitle> : <View />}
          <View style={styles.right}>{right}</View>
        </View>
      )}
      <Body
        style={styles.body}
        contentContainerStyle={scroll ? { padding: contentPadding ? spacing.screen : 0, paddingBottom: 32 } : undefined}
      >
        {scroll ? children : <View style={{ flex: 1, padding: contentPadding ? spacing.screen : 0 }}>{children}</View>}
      </Body>
      <CrtOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.appBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDivider,
    backgroundColor: colors.surfaceHeader,
  },
  back: { flexDirection: 'row', alignItems: 'center', minWidth: 64 },
  right: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: 64, gap: spacing.md },
  body: { flex: 1 },
});
