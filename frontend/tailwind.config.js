/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slatebg: '#0f172a',
        panel: '#111827',
        panelSoft: '#1f2937',
      },
      boxShadow: {
        chat: '0 10px 30px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
