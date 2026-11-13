/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./www/index.html', './www/assets/app.js'],
  theme: { extend: {
    fontFamily: { sans: ['Vazirmatn', 'Tahoma', 'sans-serif'] },
    colors: { dark: { 950: '#060911', 900: '#0b101d', 800: '#131b2e', 700: '#1d2842' } },
    keyframes: {
      fadeIn: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
      slideUp: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
      slideIn: { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'none' } },
      pop: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.3)' } },
      shake: { '20%,60%': { transform: 'translateX(-8px)' }, '40%,80%': { transform: 'translateX(8px)' } },
      grow: { '0%': { transform: 'scaleY(0)' }, '100%': { transform: 'scaleY(1)' } }
    },
    animation: {
      'fade-in': 'fadeIn .35s ease-out both',
      'slide-up': 'slideUp .4s cubic-bezier(.16,1,.3,1)',
      'slide-in': 'slideIn .4s cubic-bezier(.16,1,.3,1)',
      pop: 'pop .4s ease-in-out',
      shake: 'shake .4s ease-in-out',
      grow: 'grow .7s cubic-bezier(.16,1,.3,1) both'
    }
  } }
};
