/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out',
        'fade-in-up': 'fade-in-up .25s ease-out',
        'slide-in-left': 'slide-in-left .25s ease-out',
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [{
      glowskin: {
        primary: '#0F766E',
        'primary-content': '#FFFFFF',
        secondary: '#134E4A',
        'secondary-content': '#FFFFFF',
        accent: '#F2957F',
        'accent-content': '#3B1C14',
        neutral: '#1F2F33',
        'neutral-content': '#F4F8F7',
        'base-100': '#FFFFFF',
        'base-200': '#F2F7F6',
        'base-300': '#DDE8E6',
        'base-content': '#1C2B30',
        info: '#0284C7',
        success: '#059669',
        warning: '#D97706',
        error: '#DC2626',
        '--rounded-box': '1.25rem',
        '--rounded-btn': '0.75rem',
        '--rounded-badge': '9999px',
        '--btn-focus-scale': '0.98',
      },
    }],
  },
}
