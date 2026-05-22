/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tt: {
          darkest:     '#081C30',
          dark:        '#134270',
          navy:        '#131371',
          teal:        '#137171',
          blue:        '#1E69B3',
          'blue-hover':'#155A9A',
          surface:     '#0f1d2e',
          elevated:    '#111e30',
        },
      },
    },
  },
  plugins: [],
}
