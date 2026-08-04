/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0E0E10',
        'ink-soft': '#17171A',
        'ink-mid': '#1E1E22',
        paper: '#F6F4EE',
        'paper-dim': '#EAE7DD',
        flash: '#FF4128',
        'flash-dim': '#5c1c14',
        'flash-hover': '#e63520',
        lottery: '#3B6FE0',
        'lottery-dim': '#182c5c',
        'lottery-hover': '#2d5bc8',
        muted: '#9A978E',
        'line-dark': 'rgba(255,255,255,0.12)',
        'line-paper': '#D8D5CB',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        oswald: ['Oswald', 'sans-serif'],
        noto: ['"Noto Sans JP"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['"Noto Sans JP"', 'sans-serif'],
      },
      animation: {
        pulse: 'pulse 1.6s infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'flip-down': 'flipDown 0.35s ease-in-out',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        flipDown: {
          '0%': { transform: 'rotateX(-90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0deg)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
