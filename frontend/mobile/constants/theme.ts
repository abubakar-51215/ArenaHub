/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Matches the web owner dashboard's primary blue (bg-blue-600) so the brand
// reads consistently across web and mobile even though there's no shared
// design-token package yet.
const tintColorLight = '#2563EB';
const tintColorDark = '#60A5FA';

/** Brand gradients & elevation, mirrored from the web design system. */
export const Brand = {
  /** Primary CTA / active surfaces — blue → deep blue. */
  gradient: ['#3B82F6', '#2563EB'] as const,
  /** Hero banners (profile header, matchmaking) — blue → indigo. */
  gradientHero: ['#2563EB', '#1E40AF'] as const,
  /** Logo mark accent — blue → emerald. */
  gradientBrand: ['#2563EB', '#16A34A'] as const,
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
};

/** Reusable soft elevation for cards & buttons. */
export const Shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  brand: {
    shadowColor: '#2563EB',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    muted: '#6B7280',
    border: '#E5E7EB',
    card: '#F9FAFB',
    destructive: '#DC2626',
    success: '#16A34A',
    warning: '#D97706',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    muted: '#9CA3AF',
    border: '#2A2D2E',
    card: '#1C1F20',
    destructive: '#F87171',
    success: '#4ADE80',
    warning: '#FBBF24',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
