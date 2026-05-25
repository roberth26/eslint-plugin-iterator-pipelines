/**
 * Benchmarks to establish where iterator pipelines outperform array pipelines.
 *
 * Run with:  npm run bench
 *
 * The break-even point depends on array size AND where the match falls.
 * These benches cover the two axes independently so you can read off the
 * crossover from the output.
 *
 * Requires Node ≥ 22 for Iterator Helpers.
 */

import { bench, describe } from 'vitest';

// ── type shim (Iterator Helpers not in ES2020 lib) ────────────────────────────
type IterHelper<T> = {
  filter(pred: (x: T) => boolean): IterHelper<T>;
  map<U>(fn: (x: T) => U): IterHelper<U>;
  find(pred: (x: T) => boolean): T | undefined;
  take(n: number): IterHelper<T>;
  toArray(): T[];
};
const iter = <T>(arr: T[]) =>
  (arr as unknown as { values(): IterHelper<T> }).values();

// ── fixtures ──────────────────────────────────────────────────────────────────
const make = (n: number) => Array.from({ length: n }, (_, i) => i);

const XS   = make(100);
const SM   = make(1_000);
const MD   = make(10_000);
const LG   = make(100_000);

// ── find(): vary array size, match at ~10% ────────────────────────────────────
// This is the strongest case for the iterator: early match means the array
// pipeline does ~10× more filter work than the iterator pipeline.

describe('find — match at ~10% through the array', () => {
  for (const [label, arr] of [
    ['100   elements', XS],
    ['1 000 elements', SM],
    ['10 000 elements', MD],
    ['100 000 elements', LG],
  ] as const) {
    const target = Math.floor(arr.length * 0.1);
    describe(label, () => {
      bench('array    .filter().map().find()', () => {
        arr.filter(x => x % 2 === 0).map(x => x * 2).find(x => x === target * 2);
      });
      bench('iterator .values().filter().map().find()', () => {
        iter(arr).filter(x => x % 2 === 0).map(x => x * 2).find(x => x === target * 2);
      });
    });
  }
});

// ── find(): vary match position, fixed large array ────────────────────────────
// Shows how the iterator's advantage scales with how early the match appears.

describe('find — 100 000 element array, match position varies', () => {
  for (const [label, pct] of [
    ['match at  1%', 0.01],
    ['match at 10%', 0.10],
    ['match at 50%', 0.50],
    ['match at 99%', 0.99],
  ]) {
    const target = Math.floor(LG.length * pct);
    // Ensure target is even so the filter passes it
    const evenTarget = target % 2 === 0 ? target : target - 1;
    describe(label, () => {
      bench('array    .filter().map().find()', () => {
        LG.filter(x => x % 2 === 0).map(x => x * 2).find(x => x === evenTarget * 2);
      });
      bench('iterator .values().filter().map().find()', () => {
        iter(LG).filter(x => x % 2 === 0).map(x => x * 2).find(x => x === evenTarget * 2);
      });
    });
  }
});

// ── slice → take: intermediate-array cost only (no short-circuit) ─────────────
// The iterator avoids building the full filtered array, but there is no
// early-exit bonus beyond the take limit itself.

describe('slice(0,10) / take(10) — no short-circuit, just intermediate-array cost', () => {
  for (const [label, arr] of [
    ['100   elements', XS],
    ['10 000 elements', MD],
    ['100 000 elements', LG],
  ] as const) {
    describe(label, () => {
      bench('array    .filter().slice(0, 10)', () => {
        arr.filter(x => x % 2 === 0).slice(0, 10);
      });
      bench('iterator .values().filter().take(10).toArray()', () => {
        iter(arr).filter(x => x % 2 === 0).take(10).toArray();
      });
    });
  }
});

// ── forEach / reduce: no short-circuit, no early exit ────────────────────────
// The only gain here is skipping intermediate array allocation.
// V8 may optimise these away — the bench will tell you whether it bothers.

describe('forEach — full traversal, no short-circuit (100 000 elements)', () => {
  let sink = 0;
  bench('array    .filter().map().forEach()', () => {
    LG.filter(x => x % 2 === 0).map(x => x * 2).forEach(x => { sink = x; });
  });
  bench('iterator .values().filter().map().forEach()', () => {
    iter(LG).filter(x => x % 2 === 0).map(x => x * 2).forEach(x => { sink = x; });
  });
});
