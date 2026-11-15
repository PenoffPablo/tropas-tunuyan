/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        /* Verde oliva institucional de Tropas Tunuyán */
        militar: {
          50: '#f4f7ec',
          100: '#e6ecd3',
          200: '#cfdaab',
          300: '#b1c27a',
          400: '#96ab52',
          500: '#7a9237',
          600: '#6b8e23',
          700: '#4d6a1a',
          800: '#3f5418',
          900: '#364819',
          950: '#1b2709',
        },
        /* Superficies estratificadas del modo oscuro */
        ink: {
          950: '#090A0F',
          900: '#11131A',
          850: '#181B24',
          800: '#20242F',
          700: '#2B303D',
        },
        bone: {
          50: '#F8FAFC',
          100: '#F1F4F7',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 8px 30px rgb(0 0 0 / 0.04)',
        'soft-lg': '0 1px 2px rgb(0 0 0 / 0.04), 0 12px 40px -8px rgb(0 0 0 / 0.10)',
        lift: '0 1px 0 rgb(255 255 255 / 0.04) inset, 0 20px 50px -20px rgb(0 0 0 / 0.65)',
        'ring-militar': '0 0 0 1px rgb(150 171 82 / 0.35), 0 10px 30px -10px rgb(107 142 35 / 0.45)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translate3d(0, 12px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'modal-in': {
          '0%': { opacity: '0', transform: 'scale(0.95) translate3d(0, 8px, 0)' },
          '100%': { opacity: '1', transform: 'scale(1) translate3d(0, 0, 0)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translate3d(0, 16px, 0) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0) scale(1)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.85)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.2s ease-out both',
        'modal-in': 'modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        'toast-in': 'toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
