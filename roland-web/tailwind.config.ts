import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kelly: {
          50:  '#f0faf0',
          100: '#dcf5dc',
          200: '#b8ebb8',
          300: '#84d984',
          400: '#4ec44e',
          500: '#28a828',
          600: '#008208',
          700: '#006806',
          800: '#004f04',
          900: '#003803',
        },
      },
    },
  },
  plugins: [],
};

export default config;
