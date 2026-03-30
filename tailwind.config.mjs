/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {},
  },
  corePlugins: {
    visibility: false, // Prevents Tailwind .collapse from overriding Bootstrap .collapse
  },
  plugins: [],
};
