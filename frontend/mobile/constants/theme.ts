/**
 * Design tokens. Source of truth: design/mobile-spec.md, generated from
 * design/prototypes/arena-hub-player-app.html. Values are the prototype's,
 * unadjusted. The app is light-only (see hooks/use-color-scheme.ts).
 */

/** 1:1 with the spec's light `:root` tokens, plus the literals the frames use. */
export const Palette = {
  ink: '#0F1A15',
  inkSoft: '#1C2B23',
  paper: '#F1F2EF',
  card: '#FFFFFF',
  line: '#E2E6E1',
  lineSoft: '#EDEFEB',
  text: '#0F1A15',
  text2: '#46534C',
  muted: '#656F69', // text grey: 4.5 : 1 or more on card, paper, soft line and lime wash (was #79857E, 3.4 on paper)
  lime: '#C4F546',
  limeInk: '#0F1A15',
  limeDeep: '#7FA30F', // fills, borders and icons only (2.7 : 1 as text)
  limeText: '#5B750B', // the same lime as TEXT: 4.5 : 1 or more on card, paper, soft line and lime wash
  limeWash: '#F2FBDA',
  amber: '#D9930B', // fills, stars and icons only (2.3 : 1 as text)
  amberText: '#956508', // the same amber as TEXT: 4.5 : 1 or more on amber wash, paper and card
  amberWash: '#FDF3DC',
  red: '#CF4141', // fills, borders and icons (4.0 : 1 on red wash as text)
  redText: '#C83333', // the same red as TEXT: 4.5 : 1 or more on red wash, paper and card
  redWash: '#FBE9E9',
  slotOpen: '#F6F7F4',

  // A disabled button, in one place (components/ui/button.tsx and the assistant's send button; rule d2 in
  // docs/MOBILE_QA_GATE.md). A flat grey with no see-through, so the text keeps 4.5 : 1 or more:
  //   disabledInk (a dark button that cannot be pressed yet): paper text on it is 4.56 : 1 (was #808683, 3.30)
  //   disabledText on the flat light grey (line): 5.50 : 1 (was muted, 4.13)
  disabledInk: '#677069',
  disabledText: '#525C56',

  // Literals in the frames that are not :root tokens (spec section 1).
  white: '#FFFFFF',
  onInk: '#EAF0EC',
  onInkMuted: '#8FA096',
  inkBorder: '#26362D',
  noteText: '#4E6B04',

  // Translucent overlays on photos (spec section 1).
  glass14: 'rgba(255,255,255,0.14)',
  glass16: 'rgba(255,255,255,0.16)',
  photoScrim: 'rgba(10,16,13,0.6)',
};

/** The prototype's only shadow: the active segmented-control option. */
export const Shadow = {
  segmentActive: { boxShadow: '0 1px 2px rgba(15,26,21,0.05)' },
  // The prototype's cards and buttons have no shadow. Kept as no-ops until the
  // screens that spread them are restyled, then removed.
  card: {},
  brand: {},
};

const light = {
  ...Palette,
  // Existing keys, mapped to the prototype's roles.
  background: Palette.paper,
  tint: Palette.ink,
  icon: Palette.text2,
  tabIconDefault: Palette.muted,
  tabIconSelected: Palette.text,
  border: Palette.line,
  destructive: Palette.red,
  success: Palette.limeDeep,
  warning: Palette.amber,
};

export const Colors = {
  light,
  // Light-only app. Kept so the Expo template helpers that index
  // Colors[scheme] still type-check; the scheme is pinned to 'light'.
  dark: light,
};

/**
 * Font families, loaded in app/_layout.tsx. React Native selects a font file by
 * family name, so each weight is its own family. Platform limits (see
 * docs/RESTYLE_LOG.md): no Archivo width axis, and the prototype's weight 650
 * maps to Bold 700 in both families.
 */
export const Font = {
  body: 'InterTight_400Regular',
  bodyMedium: 'InterTight_500Medium',
  bodySemi: 'InterTight_600SemiBold',
  bodyBold: 'InterTight_700Bold',
  eyebrow: 'Archivo_600SemiBold',
  display: 'Archivo_700Bold',
};

/** `body { letter-spacing: -.005em }` at 14px, inherited as an absolute length. */
export const BodyLetterSpacing = -0.07;
