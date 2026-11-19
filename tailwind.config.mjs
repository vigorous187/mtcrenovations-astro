/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0a0a0a',
          1: '#0f0f0f',
          2: '#141414',
          3: '#1a1a1a',
          4: '#222222',
          5: '#2a2a2a',
        },
        'mtc-red': {
          DEFAULT: '#dc3545',
          light: '#e4606d',
          dark: '#bb2d3b',
          muted: 'rgba(220, 53, 69, 0.15)',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': 'clamp(3rem, 6vw, 6rem)',
        'h1': 'clamp(2.25rem, 4vw, 4rem)',
        'h2': 'clamp(1.75rem, 3vw, 3rem)',
        'h3': 'clamp(1.25rem, 2vw, 2rem)',
      },
    },
  },
  corePlugins: {
    visibility: false, // Prevents Tailwind .collapse from overriding Bootstrap .collapse
  },
  plugins: [],
};
