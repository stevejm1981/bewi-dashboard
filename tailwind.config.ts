import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: {
          DEFAULT: '#0a0a0a',
          soft: '#1a1a1a',
          muted: '#525252',
          subtle: '#737373',
        },
        paper: {
          DEFAULT: '#fafaf9',
          card: '#ffffff',
          sunk: '#f5f5f4',
        },
        line: {
          DEFAULT: '#e7e5e4',
          strong: '#d6d3d1',
        },
        accent: {
          DEFAULT: '#1f4e3d',
          warm: '#c4622d',
          alert: '#a8341c',
          ok: '#3d6b4a',
        },
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
    },
  },
  plugins: [],
};

export default config;
