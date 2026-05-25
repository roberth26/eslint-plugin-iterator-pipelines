// Flat config that loads the plugin from the local build.
// Run `npm run build` first, then `npm run lint:examples`.
const plugin = require('./dist/index.js');

module.exports = [
  {
    files: ['examples/**/*.js'],
    plugins: {
      'iterator-pipelines': plugin.default ?? plugin,
    },
    rules: {
      'iterator-pipelines/prefer-iterator-pipeline': 'warn',
    },
  },
];
