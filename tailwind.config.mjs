/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#ffffff',
          1: '#f6f6f4',
          2: '#fbfbfa',
          3: '#f0efec',
          4: '#e9e8e4',
          5: '#dedcd8',
        },
        'mtc-red': {
          DEFAULT: '#c8102e',
          light: '#f0a3ae',
          dark: '#9e0b25',
          muted: 'rgba(200, 16, 46, 0.12)',
        },
      },
      fontFamily: {
        display: ['Archivo', 'Inter', 'system-ui', 'sans-serif'],
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
    preflight: false, // S-05: Tailwind's reset was flattening Bootstrap typography (headings, lists, links)
    container: false, // S-11: Bootstrap's .container widths apply (Tailwind's wrapped the nav at 992-1023px)
  },
  plugins: [],
};
