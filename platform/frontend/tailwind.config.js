/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: '#C9A84C',
        'gold-light': '#E8C96A',
        dark: '#0a0a0a',
        'dark-2': '#141414',
        'dark-3': '#1e1e1e',
      },
    },
  },
  plugins: [],
}
