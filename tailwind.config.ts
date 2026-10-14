import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'rgb(var(--c-app) / <alpha-value>)',
        sidebar: 'rgb(var(--c-sidebar) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        line: 'rgb(var(--c-border) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--c-accent-hover) / <alpha-value>)',
        'nav-active': 'rgb(var(--c-nav-active) / <alpha-value>)',
        fg: 'rgb(var(--c-text) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        win: 'rgb(var(--c-win) / <alpha-value>)',
        loss: 'rgb(var(--c-loss) / <alpha-value>)',
        be: 'rgb(var(--c-be) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        ctl: '8px',
      },
    },
  },
  plugins: [],
} satisfies Config
