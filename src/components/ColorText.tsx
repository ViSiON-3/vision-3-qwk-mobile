import React, { useMemo } from 'react';
import { Text, TextStyle } from 'react-native';
import { Vga } from './text';
import { colors, fontSize } from '../theme/tokens';
import { parseColorText } from '../qwk/colorText';

/**
 * CGA/VGA 16-colour palette for message bodies. Index 7 (the default) is the
 * theme's body colour so uncoloured text looks like every other body; 0 is
 * nudged up from pure black so "black" text is still legible on the dark app
 * background (a real terminal would hide it too, which helps nobody).
 */
export const CGA_PALETTE: string[] = [
  '#3a3a3a', // 0 black (lifted)
  '#2f5bd6', // 1 blue
  '#2fbf5a', // 2 green
  '#2fb8c2', // 3 cyan
  '#d4463f', // 4 red
  '#c047c8', // 5 magenta
  '#c98a2d', // 6 brown / dark yellow
  colors.textBody, // 7 light grey (theme body)
  '#6f6f80', // 8 dark grey
  '#7f8cff', // 9 light blue
  '#55ff55', // 10 light green
  '#55ffff', // 11 light cyan
  '#ff5555', // 12 light red
  '#ff55ff', // 13 light magenta
  '#ffff55', // 14 yellow
  '#ffffff', // 15 white
];

const BG_PALETTE: (string | undefined)[] = [
  undefined, // 0 default: transparent
  '#0000aa',
  '#00aa00',
  '#00aaaa',
  '#aa0000',
  '#aa00aa',
  '#aa5500',
  '#aaaaaa',
  '#555555',
  '#5555ff',
  '#55ff55',
  '#55ffff',
  '#ff5555',
  '#ff55ff',
  '#ffff55',
  '#ffffff',
];

/**
 * Message body with ANSI/pipe colour codes rendered as colour runs in the VGA
 * face. Plain bodies render exactly as a single Vga would.
 */
export function ColorText({ text, size = fontSize.body, style }: { text: string; size?: number; style?: TextStyle }) {
  const segments = useMemo(() => parseColorText(text), [text]);
  if (segments.length <= 1 && (segments.length === 0 || (segments[0].fg === 7 && segments[0].bg === 0))) {
    return (
      <Vga size={size} color={colors.textBody} style={style}>
        {segments[0]?.text ?? ''}
      </Vga>
    );
  }
  return (
    <Vga size={size} color={colors.textBody} style={style}>
      {segments.map((s, i) => (
        <Text key={i} style={{ color: CGA_PALETTE[s.fg], backgroundColor: BG_PALETTE[s.bg] }}>
          {s.text}
        </Text>
      ))}
    </Vga>
  );
}
