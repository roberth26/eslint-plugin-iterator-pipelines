import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from '../../src/rules/prefer-iterator-pipeline';

// Wire RuleTester into vitest so each case shows up as an individual test
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  parserOptions: { ecmaVersion: 2020 },
});

tester.run('prefer-iterator-pipeline', rule, {
  // ─── Valid: should NOT trigger ──────────────────────────────────────────────
  valid: [
    // Single terminal with no preceding pipeline — nothing to optimize
    { code: 'arr.find(x => x > 0)' },
    { code: 'arr.some(x => x > 0)' },

    // Pipeline without a terminating operation — result is a full array (intentional)
    { code: 'const b = arr.filter(fn).map(fn)' },

    // Already using an iterator — no fix needed
    { code: 'arr.values().filter(fn).find(fn)' },
    { code: 'arr.values().filter(fn).map(fn).some(fn)' },

    // Unknown method in the intermediate chain — we can't safely convert
    { code: 'arr.filter(fn).sort().find(fn)' },
    { code: 'arr.map(fn).reverse().some(fn)' },
    { code: 'arr.filter(fn).slice(0, 5).map(fn).find(fn)' },

    // Only one method in the chain with no pipeline preceding it
    { code: 'arr.slice(0, 5)' },

    // Slice with dynamic / negative arguments — can't safely convert
    { code: 'arr.filter(fn).slice(n)' },
    { code: 'arr.filter(fn).slice(-3)' },
    { code: 'arr.filter(fn).slice(0, -1)' },
    { code: 'arr.filter(fn).slice(a, b)' },

    // Optional chaining — leave alone
    { code: 'arr?.filter(fn)?.find(fn)' },
    { code: 'arr.filter(fn)?.find(fn)' },
  ],

  // ─── Invalid: should trigger with auto-fix ──────────────────────────────────
  invalid: [
    // ── find ──
    {
      code: 'arr.filter(fn1).find(fn2)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'find' } }],
      output: 'arr.values().filter(fn1).find(fn2)',
    },
    {
      code: 'arr.filter(fn1).map(fn2).find(fn3)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'find' } }],
      output: 'arr.values().filter(fn1).map(fn2).find(fn3)',
    },
    {
      code: 'arr.map(fn1).filter(fn2).find(fn3)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'find' } }],
      output: 'arr.values().map(fn1).filter(fn2).find(fn3)',
    },
    {
      code: 'arr.flatMap(fn1).filter(fn2).find(fn3)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'find' } }],
      output: 'arr.values().flatMap(fn1).filter(fn2).find(fn3)',
    },

    // ── some ──
    {
      code: 'arr.filter(fn1).map(fn2).some(fn3)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'some' } }],
      output: 'arr.values().filter(fn1).map(fn2).some(fn3)',
    },

    // ── every ──
    {
      code: 'arr.filter(fn1).map(fn2).every(fn3)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'every' } }],
      output: 'arr.values().filter(fn1).map(fn2).every(fn3)',
    },

    // ── forEach ──
    {
      code: 'arr.filter(fn1).map(fn2).forEach(fn3)',
      errors: [{ messageId: 'preferIteratorPipelineFullTraversal', data: { method: 'forEach' } }],
      output: 'arr.values().filter(fn1).map(fn2).forEach(fn3)',
    },

    // ── reduce ──
    {
      code: 'arr.filter(fn1).map(fn2).reduce(fn3, 0)',
      errors: [{ messageId: 'preferIteratorPipelineFullTraversal', data: { method: 'reduce' } }],
      output: 'arr.values().filter(fn1).map(fn2).reduce(fn3, 0)',
    },

    // ── Non-identifier root (function call, array literal) ──
    {
      code: 'getData().filter(fn1).find(fn2)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'find' } }],
      output: 'getData().values().filter(fn1).find(fn2)',
    },
    {
      code: '[1, 2, 3].filter(fn1).find(fn2)',
      errors: [{ messageId: 'preferIteratorPipelineShortCircuit', data: { method: 'find' } }],
      output: '[1, 2, 3].values().filter(fn1).find(fn2)',
    },

    // ── slice → take (slice(0, n)) ──
    {
      code: 'arr.filter(fn1).slice(0, 5)',
      errors: [{ messageId: 'preferIteratorPipelineSlice', data: { replacement: 'take' } }],
      output: 'arr.values().filter(fn1).take(5).toArray()',
    },
    {
      code: 'arr.filter(fn1).map(fn2).slice(0, 10)',
      errors: [{ messageId: 'preferIteratorPipelineSlice', data: { replacement: 'take' } }],
      output: 'arr.values().filter(fn1).map(fn2).take(10).toArray()',
    },

    // ── slice → drop (slice(n)) ──
    {
      code: 'arr.filter(fn1).slice(3)',
      errors: [{ messageId: 'preferIteratorPipelineSlice', data: { replacement: 'drop' } }],
      output: 'arr.values().filter(fn1).drop(3).toArray()',
    },

    // ── slice → drop + take (slice(start, end)) ──
    {
      code: 'arr.filter(fn1).slice(2, 7)',
      errors: [{ messageId: 'preferIteratorPipelineSlice', data: { replacement: 'drop/take' } }],
      output: 'arr.values().filter(fn1).drop(2).take(5).toArray()',
    },
    {
      code: 'arr.filter(fn1).map(fn2).slice(1, 4)',
      errors: [{ messageId: 'preferIteratorPipelineSlice', data: { replacement: 'drop/take' } }],
      output: 'arr.values().filter(fn1).map(fn2).drop(1).take(3).toArray()',
    },
  ],
});
