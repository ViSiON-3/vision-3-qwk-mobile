/**
 * Design tokens from docs/design/design_handoff_qwk_mobile/README.md.
 * CP437 "terminal-on-phone" aesthetic over standard mobile patterns.
 */

export const colors = {
  // Backgrounds
  appBg: '#06060a',
  appRadialInner: '#0d0d18',
  appRadialOuter: '#050507',
  surfaceCard: '#0c0c18',
  surfaceInset: '#0d0d18',
  surfaceConsole: '#070710',
  surfaceHeader: '#0a0a14',
  surfaceTabbar: '#0a0a12',

  // Borders
  border: '#20203c',
  borderDivider: '#15152a',
  borderInput: '#2a2a4e',
  borderStrong: '#26264a',

  // Text
  textPrimary: '#e8e8f4',
  textPrimaryAlt: '#e0e0f0',
  textBody: '#c8c8d4',
  textSecondary: '#9999b0',
  textMuted: '#7a7a95',
  textMutedAlt: '#6b6b8a',
  textDim: '#55667a',
  textDimAlt: '#44557a',
  textRead: '#76768f',

  // Accents
  blue: '#4466ff',
  blueGradEnd: '#3450dd',
  cyan: '#55ffff',
  cyanAlt: '#44ccdd',
  blueText: '#9fc0ff',
  blueTextAlt: '#6fa8ff',
  magenta: '#ff66cc',
  magentaBrk: '#aa44aa',
  amber: '#ffaa44',
  amberAlt: '#ffcc44',
  green: '#55ff99',
  greenAlt: '#3aa85a',
  greenSoft: '#7fe0a0',
  red: '#ff7777',
  redAlt: '#aa5555',
  redSoft: '#cc5555',

  // Special
  statusGradFrom: '#10204a',
  statusGradTo: '#1a1a4e',
  toggleOn: '#2a6fdb',
} as const;

export const fonts = {
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold',
  monoBold: 'IBMPlexMono_700Bold',
  /** CP437 bitmap terminal face (WebPlus IBM VGA 8x16). */
  vga: 'IBMVGA',
} as const;

export const fontSize = {
  title: 15,
  eyebrow: 12,
  listPrimary: 14,
  listMeta: 11,
  listMetaSmall: 10.5,
  body: 14,
  statBig: 42,
  statMed: 24,
  statSmall: 22,
  button: 14,
  buttonSmall: 13,
  tabLabel: 9.5,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  screen: 16,
  lg: 20,
  xl: 24,
} as const;

export const radius = {
  chip: 6,
  input: 7,
  card: 8,
  button: 10,
  pill: 11,
  toggle: 14,
} as const;

export const letterSpacing = {
  label: 0.5,
  title: 1.5,
  titleWide: 2,
} as const;

/** Primary blue button glow shadow. */
export const shadow = {
  primaryButton: {
    shadowColor: colors.blue,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  greenButton: {
    shadowColor: colors.greenAlt,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

export type ColorToken = keyof typeof colors;
