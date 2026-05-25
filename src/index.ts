import preferIteratorPipeline from './rules/prefer-iterator-pipeline';

const plugin = {
  rules: {
    'prefer-iterator-pipeline': preferIteratorPipeline,
  },
  configs: {
    recommended: {
      plugins: ['iterator-pipelines'],
      rules: {
        'iterator-pipelines/prefer-iterator-pipeline': 'warn',
      },
    },
  },
} as const;

export default plugin;
export { plugin };
