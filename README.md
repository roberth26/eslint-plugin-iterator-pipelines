# eslint-plugin-iterator-pipelines

[![npm version](https://img.shields.io/npm/v/eslint-plugin-iterator-pipelines)](https://www.npmjs.com/package/eslint-plugin-iterator-pipelines)
[![npm downloads](https://img.shields.io/npm/dm/eslint-plugin-iterator-pipelines)](https://www.npmjs.com/package/eslint-plugin-iterator-pipelines)
[![GitHub](https://img.shields.io/github/license/roberth26/eslint-plugin-iterator-pipelines)](https://github.com/roberth26/eslint-plugin-iterator-pipelines)

ESLint plugin that detects array method pipelines which benefit from the [TC39 Iterator Helpers](https://github.com/tc39/proposal-iterator-helpers) API, and auto-fixes them in place.

## Hard requirement: Node ≥ 22

Iterator Helpers shipped in V8 12.4, which means **Node 22+** (Chrome 117+, Firefox 131+, Safari 18+). Applying the auto-fix on a project that runs on Node 18 or 20 LTS will produce runtime errors. Check your minimum target before enabling this plugin.

## When this actually helps

The plugin is worth using in the **`find` / `some` / `every`** case when the source array is large (≥ ~1 000 elements). The iterator pipeline avoids building intermediate arrays and stops processing at the first match — you don't need to know where the match falls to benefit.

`slice(0, n)` / `take(n)` is an even stronger case — the iterator only pulls the elements it needs regardless of where they are, so the gain scales directly with how much of the array is discarded.

Benchmarks (Node 23, Apple M-series, `npm run bench`):

### `find()` — match at ~10% through the array

| Array size | Array pipeline | Iterator pipeline | Winner |
|---|---|---|---|
| 100 elements | **1.26× faster** | — | array |
| 1 000 elements | — | **1.22× faster** | iterator |
| 10 000 elements | — | **1.39× faster** | iterator |
| 100 000 elements | — | **6.32× faster** | iterator |

Break-even is around **~500–1 000 elements**.

### `slice(0, n)` / `take(n)` — collecting first 10 elements

| Array size | Array pipeline | Iterator pipeline | Winner |
|---|---|---|---|
| 100 elements | **2.1× faster** | — | array |
| 10 000 elements | — | **44.7× faster** | iterator |
| 100 000 elements | — | **928× faster** | iterator |

## When this does not help

**`forEach` and `reduce` on large arrays are slower with an iterator pipeline**, not faster. These methods process every element — there is no early exit — so the iterator protocol adds overhead without any payback:

| | Array pipeline | Iterator pipeline |
|---|---|---|
| `.filter().map().forEach()` on 100k elements | **1.49× faster** | — |

The rule still flags `forEach` and `reduce` because the conversion is semantically correct and avoids intermediate array allocation. But if you are reaching for this plugin specifically for `forEach` or `reduce` performance, the benchmarks say it will make things slower. Use `// eslint-disable-next-line` or narrow the rule configuration to the methods that actually benefit.

## Installation

```sh
npm install --save-dev eslint-plugin-iterator-pipelines
```

## Usage

### Flat config (`eslint.config.js`)

```js
import iteratorPipelines from 'eslint-plugin-iterator-pipelines';

export default [
  {
    plugins: { 'iterator-pipelines': iteratorPipelines },
    rules: {
      'iterator-pipelines/prefer-iterator-pipeline': 'warn',
    },
  },
];
```

### Legacy config (`.eslintrc`)

```json
{
  "plugins": ["iterator-pipelines"],
  "rules": {
    "iterator-pipelines/prefer-iterator-pipeline": "warn"
  }
}
```

## Rules

### `prefer-iterator-pipeline`

Detects chains of `filter` / `map` / `flatMap` that end in a terminating operation and suggests converting them to iterator pipelines via `.values()`.

| Category | Methods |
|---|---|
| Intermediate (have iterator equivalents) | `filter`, `map`, `flatMap` |
| Terminal — no `.toArray()` needed | `find`, `some`, `every`, `forEach`, `reduce` |
| Terminal — `.toArray()` injected | `slice(0,n)` → `.take(n)`, `slice(n)` → `.drop(n)`, `slice(s,e)` → `.drop(s).take(e-s)` |

#### Auto-fix examples

```js
// ✗ flagged
arr.filter(isActive).map(toId).find(isTarget);
arr.filter(isActive).map(toId).some(isTarget);
arr.filter(isActive).slice(0, 5);
arr.filter(isActive).slice(2, 7);

// ✓ fixed (auto-fixable with --fix)
arr.values().filter(isActive).map(toId).find(isTarget);
arr.values().filter(isActive).map(toId).some(isTarget);
arr.values().filter(isActive).take(5).toArray();
arr.values().filter(isActive).drop(2).take(5).toArray();
```

#### Not flagged

- Pipelines with no terminating operation — the result is a full array and array methods are appropriate.
- Chains that include methods without iterator equivalents (`.sort()`, `.reverse()`, `.flat()`, …).
- Chains that already open with `.values()`.
- Optional chains (`?.`).
- `slice` with negative, dynamic, or computed arguments.
- `slice` in an intermediate position (before further pipeline steps).

#### Limitations

- The rule uses structural AST analysis only — no TypeScript type information. A chain of `.filter().map().find()` on a non-array (jQuery object, custom collection) is also flagged. Use `// eslint-disable-next-line` in those cases.
- `findIndex` has no direct Iterator Helpers equivalent and is not converted.

## Development

```sh
npm install
npm test          # ESLint rule tests (RuleTester)
npm run bench     # performance benchmarks — requires Node ≥ 22
npm run typecheck # type-check without emitting
npm run build     # compile to dist/
```
