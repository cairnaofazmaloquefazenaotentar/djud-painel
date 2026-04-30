// Design System Tokens — Single Source of Truth
// Paleta CNJ migrada para oklch(L C H)
// Gerado via tweakcn.com/editor/theme

export type OklchColor = `oklch(${string})`;

export interface DesignTokens {
  light: Record<string, OklchColor>;
  dark: Record<string, OklchColor>;
  sidebar: {
    light: Record<string, OklchColor>;
    dark: Record<string, OklchColor>;
  };
  fonts: Record<string, string>;
  radius: Record<string, string>;
  shadows: Record<string, string>;
  spacing: Record<string, string>;
  tracking: Record<string, string>;
  typography: Record<string, Record<string, string>>;
}

export const tokens: DesignTokens = {
  light: {
    background: 'oklch(0.9842 0.0034 247.8575)',
    foreground: 'oklch(0.2795 0.0368 260.0310)',
    card: 'oklch(1.0000 0 0)',
    'card-foreground': 'oklch(0.2795 0.0368 260.0310)',
    popover: 'oklch(1.0000 0 0)',
    'popover-foreground': 'oklch(0.2795 0.0368 260.0310)',
    primary: 'oklch(0.5017 0.2796 265.4464)',
    'primary-foreground': 'oklch(1.0000 0 0)',
    secondary: 'oklch(0.9276 0.0058 264.5313)',
    'secondary-foreground': 'oklch(0.3729 0.0306 259.7328)',
    muted: 'oklch(0.9670 0.0029 264.5419)',
    'muted-foreground': 'oklch(0.5510 0.0234 264.3637)',
    accent: 'oklch(0.9299 0.0334 272.7879)',
    'accent-foreground': 'oklch(0.3729 0.0306 259.7328)',
    destructive: 'oklch(0.6280 0.2577 29.2339)',
    'destructive-foreground': 'oklch(1.0000 0 0)',
    border: 'oklch(0.8717 0.0093 258.3382)',
    input: 'oklch(0.8717 0.0093 258.3382)',
    ring: 'oklch(0.5854 0.2041 277.1173)',
    'chart-1': 'oklch(0.5854 0.2041 277.1173)',
    'chart-2': 'oklch(0.5106 0.2301 276.9656)',
    'chart-3': 'oklch(0.4568 0.2146 277.0229)',
    'chart-4': 'oklch(0.3984 0.1773 277.3662)',
    'chart-5': 'oklch(0.3588 0.1354 278.6973)',
  },
  dark: {
    background: 'oklch(0.2077 0.0398 265.7549)',
    foreground: 'oklch(0.9288 0.0126 255.5078)',
    card: 'oklch(0.2795 0.0368 260.0310)',
    'card-foreground': 'oklch(0.9288 0.0126 255.5078)',
    popover: 'oklch(0.2795 0.0368 260.0310)',
    'popover-foreground': 'oklch(0.9288 0.0126 255.5078)',
    primary: 'oklch(0.5017 0.2796 265.4464)',
    'primary-foreground': 'oklch(0.2077 0.0398 265.7549)',
    secondary: 'oklch(0.3351 0.0331 260.9120)',
    'secondary-foreground': 'oklch(0.8717 0.0093 258.3382)',
    muted: 'oklch(0.2427 0.0381 259.9437)',
    'muted-foreground': 'oklch(0.7137 0.0192 261.3246)',
    accent: 'oklch(0.3729 0.0306 259.7328)',
    'accent-foreground': 'oklch(0.8717 0.0093 258.3382)',
    destructive: 'oklch(0.6280 0.2577 29.2339)',
    'destructive-foreground': 'oklch(0.2077 0.0398 265.7549)',
    border: 'oklch(0.4461 0.0263 256.8018)',
    input: 'oklch(0.4461 0.0263 256.8018)',
    ring: 'oklch(0.6801 0.1583 276.9349)',
    'chart-1': 'oklch(0.6801 0.1583 276.9349)',
    'chart-2': 'oklch(0.5854 0.2041 277.1173)',
    'chart-3': 'oklch(0.5106 0.2301 276.9656)',
    'chart-4': 'oklch(0.4568 0.2146 277.0229)',
    'chart-5': 'oklch(0.3984 0.1773 277.3662)',
  },
  sidebar: {
    light: {
      background: 'oklch(0.9670 0.0029 264.5419)',
      foreground: 'oklch(0.2795 0.0368 260.0310)',
      primary: 'oklch(0.5854 0.2041 277.1173)',
      'primary-foreground': 'oklch(1.0000 0 0)',
      accent: 'oklch(0.9299 0.0334 272.7879)',
      'accent-foreground': 'oklch(0.3729 0.0306 259.7328)',
      border: 'oklch(0.8717 0.0093 258.3382)',
      ring: 'oklch(0.5854 0.2041 277.1173)',
    },
    dark: {
      background: 'oklch(0.2795 0.0368 260.0310)',
      foreground: 'oklch(0.9288 0.0126 255.5078)',
      primary: 'oklch(0.6801 0.1583 276.9349)',
      'primary-foreground': 'oklch(0.2077 0.0398 265.7549)',
      accent: 'oklch(0.3729 0.0306 259.7328)',
      'accent-foreground': 'oklch(0.8717 0.0093 258.3382)',
      border: 'oklch(0.4461 0.0263 256.8018)',
      ring: 'oklch(0.6801 0.1583 276.9349)',
    },
  },
  fonts: {
    sans: 'Inter, sans-serif',
    mono: 'JetBrains Mono, monospace',
    serif: 'Merriweather, serif',
  },
  radius: {
    none: '0',
    sm: 'calc(0.5rem - 4px)',
    md: 'calc(0.5rem - 2px)',
    lg: '0.5rem',
    xl: 'calc(0.5rem + 4px)',
    full: '9999px',
  },
  shadows: {
    '2xs': '0px 4px 8px -1px hsl(0 0% 0% / 0.05)',
    xs: '0px 4px 8px -1px hsl(0 0% 0% / 0.05)',
    sm: '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 1px 2px -2px hsl(0 0% 0% / 0.10)',
    md: '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 2px 4px -2px hsl(0 0% 0% / 0.10)',
    lg: '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 4px 6px -2px hsl(0 0% 0% / 0.10)',
    xl: '0px 4px 8px -1px hsl(0 0% 0% / 0.10), 0px 8px 10px -2px hsl(0 0% 0% / 0.10)',
    '2xl': '0px 4px 8px -1px hsl(0 0% 0% / 0.25)',
  },
  spacing: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    6: '1.5rem',
    8: '2rem',
    12: '3rem',
    16: '4rem',
    20: '5rem',
    24: '6rem',
  },
  tracking: {
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
  },
  typography: {
    h1: {
      fontSize: '2.25rem',
      lineHeight: '2.5rem',
      fontWeight: '700',
    },
    h2: {
      fontSize: '1.875rem',
      lineHeight: '2.25rem',
      fontWeight: '700',
    },
    h3: {
      fontSize: '1.5rem',
      lineHeight: '2rem',
      fontWeight: '600',
    },
    h4: {
      fontSize: '1.25rem',
      lineHeight: '1.75rem',
      fontWeight: '600',
    },
    body: {
      fontSize: '1rem',
      lineHeight: '1.5rem',
      fontWeight: '400',
    },
    small: {
      fontSize: '0.875rem',
      lineHeight: '1.25rem',
      fontWeight: '400',
    },
    label: {
      fontSize: '0.875rem',
      lineHeight: '1.25rem',
      fontWeight: '500',
    },
  },
};

export type Token = keyof typeof tokens.light;
