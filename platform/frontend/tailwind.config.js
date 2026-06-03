/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        gold: '#D4A843',
        'gold-light': '#F0C96A',
        dark: '#07070b',
        'dark-2': '#0c0c12',
        'dark-3': '#111118',
        'dark-4': '#16161e',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)',
        'card-hover': '0 2px 8px rgba(0,0,0,0.6), 0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
        'glow-gold': '0 0 24px rgba(212,168,67,0.22), 0 0 80px rgba(212,168,67,0.06)',
        'glow-green': '0 0 24px rgba(16,185,129,0.2), 0 0 60px rgba(16,185,129,0.05)',
        'glow-violet': '0 0 24px rgba(168,85,247,0.2), 0 0 60px rgba(168,85,247,0.05)',
        'glow-blue': '0 0 24px rgba(59,130,246,0.2), 0 0 60px rgba(59,130,246,0.05)',
        'glow-red': '0 0 20px rgba(239,68,68,0.18), 0 0 40px rgba(239,68,68,0.05)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glowPulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
