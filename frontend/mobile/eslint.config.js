// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // the check scripts run in Node
    files: ['scripts/**/*.cjs'],
    languageOptions: { globals: { __dirname: 'readonly', __filename: 'readonly', require: 'readonly', module: 'readonly', process: 'readonly', console: 'readonly' } },
  },
]);
