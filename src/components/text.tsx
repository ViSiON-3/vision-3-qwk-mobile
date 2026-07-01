import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';
import { colors, fonts, fontSize, letterSpacing } from '../theme/tokens';
import { useStore } from '../store/useStore';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

const monoFamily: Record<Weight, string> = {
  regular: fonts.mono,
  medium: fonts.monoMedium,
  semibold: fonts.monoSemibold,
  bold: fonts.monoBold,
};

interface BaseProps extends TextProps {
  weight?: Weight;
  color?: string;
  size?: number;
  spacing?: number;
  style?: TextStyle | TextStyle[];
}

/** IBM Plex Mono — UI chrome, list rows, labels, buttons, stats. */
export function Mono({ weight = 'regular', color = colors.textPrimary, size = fontSize.listPrimary, spacing, style, ...rest }: BaseProps) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: monoFamily[weight], color, fontSize: size, letterSpacing: spacing }, style]}
    />
  );
}

/** IBMVGA CP437 face — status line, eyebrows, titles, body text, terminal. */
export function Vga({ color = colors.textBody, size = fontSize.body, spacing, style, ...rest }: BaseProps) {
  return <Text {...rest} style={[{ fontFamily: fonts.vga, color, fontSize: size, letterSpacing: spacing }, style]} />;
}

/** Screen title in IBMVGA with the optional CRT glow (settings-driven). */
export function ScreenTitle({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const glow = useStore((s) => s.settings.glow);
  return (
    <Text
      style={[
        styles.title,
        glow && { textShadowColor: 'rgba(85,160,255,0.4)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.vga,
    color: colors.textPrimary,
    fontSize: fontSize.title,
    letterSpacing: letterSpacing.title,
  },
});
