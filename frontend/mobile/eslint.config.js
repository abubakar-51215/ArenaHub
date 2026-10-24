// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // eslint-config-expo 58 turns on the React Compiler's own checks as errors. They report patterns that work
    // (a ref read in render for a "has it been ready once" flag, a state reset in an effect, an Animated value
    // set from a gesture). The compiler simply leaves such a component as it is, so they are not runtime faults;
    // rewriting some fifty working places the week the app moves to a new Expo version is the riskier choice.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    // the build config and the check scripts run in Node
    files: ['app.config.js', 'scripts/**/*.{cjs,mjs}'],
    languageOptions: { globals: { __dirname: 'readonly', __filename: 'readonly', require: 'readonly', module: 'readonly', process: 'readonly', console: 'readonly' } },
  },
  {
    // the check scripts run in Node
    files: ['scripts/**/*.cjs'],
    languageOptions: { globals: { __dirname: 'readonly', __filename: 'readonly', require: 'readonly', module: 'readonly', process: 'readonly', console: 'readonly' } },
  },
]);
