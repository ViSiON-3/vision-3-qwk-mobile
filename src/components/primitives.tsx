import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontSize, letterSpacing, radius, shadow, spacing } from '../theme/tokens';
import { Mono, Vga } from './text';

/** Card / list panel surface. */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Section eyebrow (IBMVGA, uppercase, letter-spaced). */
export function Eyebrow({ children, color = colors.textMuted }: { children: React.ReactNode; color?: string }) {
  return (
    <Vga color={color} size={fontSize.eyebrow} spacing={letterSpacing.label} style={styles.eyebrow}>
      {children}
    </Vga>
  );
}

/** Rolled-up unread pill (accent border, count). */
export function UnreadPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.pill}>
      <Mono weight="semibold" size={fontSize.listMeta} color={colors.cyan}>
        {count}
      </Mono>
    </View>
  );
}

/** Small labelled chip (NET, PRIVATE, PENDING, ACTIVE). */
export function Chip({ label, color = colors.cyanAlt, border }: { label: string; color?: string; border?: string }) {
  return (
    <View style={[styles.chip, { borderColor: border ?? color }]}>
      <Mono weight="semibold" size={9.5} color={color} spacing={0.5}>
        {label}
      </Mono>
    </View>
  );
}

interface RowProps {
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: string;
  last?: boolean;
}

/** Tappable list row with optional left accent bar and bottom divider. */
export function ListRow({ onPress, children, style, accent, last }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.borderDivider }}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        accent ? { borderLeftWidth: 2, borderLeftColor: accent } : null,
        pressed && onPress ? { backgroundColor: colors.surfaceInset } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'green' | 'danger';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
}

/** Full-width action button (gradient primary/green, outlined secondary/danger). */
export function Button({ title, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  // Single line, always: a label that cannot fit shrinks its tracking rather
  // than wrapping, which would push the first line to the top of the button.
  const content = (
    <Mono
      weight="bold"
      size={fontSize.button}
      spacing={letterSpacing.title}
      color={variant === 'secondary' ? colors.textPrimary : variant === 'danger' ? colors.red : '#ffffff'}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      style={styles.buttonLabel}
    >
      {title}
    </Mono>
  );

  if (variant === 'primary' || variant === 'green') {
    const grad = (variant === 'primary' ? [colors.blue, colors.blueGradEnd] : [colors.green, colors.greenAlt]) as [string, string];
    // The caller's style (height, padding, radius) sizes the Pressable, and the
    // gradient fills it from behind with the same corner radius — so a compact
    // header button is actually compact, with its label padded inside the blue.
    const radiusValue = StyleSheet.flatten([styles.button, style]).borderRadius;
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={[styles.button, variant === 'primary' ? shadow.primaryButton : shadow.greenButton, style, disabled && styles.disabled]}
      >
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radiusValue }]}
        />
        {content}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        styles.buttonOutline,
        variant === 'danger' && { borderColor: colors.redAlt },
        pressed && { opacity: 0.7 },
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  eyebrow: { marginBottom: spacing.sm },
  pill: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: 'rgba(68,102,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  row: {
    paddingVertical: 13,
    paddingHorizontal: spacing.screen,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderDivider },
  button: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { textAlign: 'center' },
  buttonOutline: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceCard,
  },
  disabled: { opacity: 0.4 },
});
