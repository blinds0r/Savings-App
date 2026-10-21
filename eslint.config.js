// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist*/*', 'shots*/*', 'e2e-*.js'],
  },
  {
    // The Skia visuals drive Reanimated shared values from effects and map hooks over constant
    // tables of particles; the React Compiler rules read both as mutations during render.
    files: ['src/visuals/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/rules-of-hooks': 'off',
    },
  },
]);
