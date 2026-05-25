import type { Rule } from 'eslint';
import type * as estree from 'estree';

// espree (ESLint's parser) adds `optional` directly to CallExpression / MemberExpression
// for optional chaining, but @types/estree doesn't include it in the base spec types.
interface WithOptional {
  optional?: boolean;
}

// Methods with direct iterator equivalents that act as intermediate transforms
const PIPELINE_METHODS = new Set(['filter', 'map', 'flatMap']);

// Terminal methods: don't return arrays, so no .toArray() needed at the end.
const TERMINAL_METHODS = new Set(['find', 'some', 'every', 'forEach', 'reduce']);

// Subset of TERMINAL_METHODS that can exit before reaching the end of the sequence.
// These are the methods where the iterator pipeline delivers the biggest gain.
const SHORT_CIRCUIT_METHODS = new Set(['find', 'some', 'every']);

type SliceTransformation =
  | { type: 'take'; n: number }
  | { type: 'drop'; n: number }
  | { type: 'drop-take'; drop: number; take: number };

interface ChainSegment {
  name: string;
  node: estree.CallExpression;
}

interface Chain {
  segments: ChainSegment[];
  root: estree.Node;
}

function getMethodName(member: estree.MemberExpression): string | null {
  if (!member.computed && member.property.type === 'Identifier') {
    return (member.property as estree.Identifier).name;
  }
  return null;
}

// Walk the call chain inward, collecting method names and nodes.
// e.g. arr.filter(fn).map(fn).find(fn) → segments=[filter,map,find], root=arr
function buildChain(node: estree.CallExpression): Chain | null {
  const segments: ChainSegment[] = [];
  let current: estree.Node = node;

  while (
    current.type === 'CallExpression' &&
    current.callee.type === 'MemberExpression'
  ) {
    const call = current as estree.CallExpression;

    // Skip optional chains — behaviour under ?.() is different enough to leave alone
    if ((call as WithOptional).optional) break;

    const member = call.callee as estree.MemberExpression;
    if ((member as WithOptional).optional) break;

    const name = getMethodName(member);
    if (name === null) break;

    segments.unshift({ name, node: call });
    current = member.object;
  }

  if (segments.length === 0) return null;

  return { segments, root: current };
}

// Returns true when the chain already opens with .values() — no fix needed.
function isAlreadyIterator(node: estree.Node): boolean {
  if (
    node.type !== 'CallExpression' ||
    node.callee.type !== 'MemberExpression'
  ) {
    return false;
  }
  const call = node as estree.CallExpression;
  const member = call.callee as estree.MemberExpression;
  return getMethodName(member) === 'values' && call.arguments.length === 0;
}

// Determine the iterator equivalent of a .slice(start, end) call.
// Only handles non-negative literal arguments — anything dynamic or negative is left alone.
function analyzeSliceArgs(
  args: Array<estree.Expression | estree.SpreadElement>,
): SliceTransformation | null {
  if (args.length === 0) return null;

  const first = args[0];
  if (first.type !== 'Literal' || typeof first.value !== 'number') return null;

  const start = first.value;
  if (start < 0) return null; // negative indices read from the end — can't convert

  if (args.length === 1) {
    // slice(n) → drop(n)
    return { type: 'drop', n: start };
  }

  const second = args[1];
  if (second.type !== 'Literal' || typeof second.value !== 'number') return null;

  const end = second.value;
  if (end < 0 || end <= start) return null;

  if (start === 0) {
    // slice(0, n) → take(n)
    return { type: 'take', n: end };
  }

  // slice(start, end) → drop(start).take(end - start)
  return { type: 'drop-take', drop: start, take: end - start };
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer iterator pipeline over array pipeline when using a terminating operation — avoids intermediate array allocation and enables early exit',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferIteratorPipelineShortCircuit:
        '"{{method}}" can exit before reaching the end of the sequence. An iterator pipeline avoids building intermediate arrays AND stops processing at the first match. ' +
        'Apply when the array has ≥ ~1 000 elements and matches tend to appear early. ' +
        'On smaller arrays, or when the match is near the tail, the array pipeline is faster.',

      preferIteratorPipelineFullTraversal:
        '"{{method}}" processes every element — there is no early exit — so the iterator pipeline saves intermediate array allocation but gains no short-circuit benefit. ' +
        'Benchmarks show this is typically slower than the array pipeline due to iterator protocol overhead. ' +
        'Only apply if you have profiled this specific call site.',

      preferIteratorPipelineSlice:
        'Replacing .slice() with .{{replacement}}() on an iterator pipeline only processes the elements it collects, skipping the rest. ' +
        'Strongly recommended at ≥ ~1 000 elements (up to 928× faster in benchmarks). ' +
        'On arrays under ~500 elements, the array pipeline can be faster.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        // Only process the outermost call in a chain.
        // If this node is the receiver of another method call it's an intermediate
        // step — the outer terminal call will handle the whole chain instead.
        const parent = (node as estree.Node & { parent: estree.Node }).parent;
        if (parent.type === 'MemberExpression') return;

        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.computed ||
          node.callee.property.type !== 'Identifier'
        ) {
          return;
        }

        const methodName = (node.callee.property as estree.Identifier).name;

        if (!TERMINAL_METHODS.has(methodName) && methodName !== 'slice') {
          return;
        }

        const chain = buildChain(node);
        if (!chain) return;

        const { segments, root } = chain;

        // Require at least one intermediate pipeline method before the terminal
        const pipelineSegments = segments.slice(0, -1);
        if (pipelineSegments.length === 0) return;

        // Every intermediate method must have an iterator equivalent
        if (pipelineSegments.some((s) => !PIPELINE_METHODS.has(s.name))) {
          return;
        }

        // If the root is already a .values() call the pipeline is already iterating
        if (isAlreadyIterator(root)) return;

        if (methodName === 'slice') {
          handleSlice(node, root, context);
        } else {
          handleTerminal(node, root, methodName, context);
        }
      },
    };
  },
};

function handleTerminal(
  node: estree.CallExpression,
  root: estree.Node,
  methodName: string,
  context: Rule.RuleContext,
): void {
  const messageId = SHORT_CIRCUIT_METHODS.has(methodName)
    ? 'preferIteratorPipelineShortCircuit'
    : 'preferIteratorPipelineFullTraversal';

  context.report({
    node,
    messageId,
    data: { method: methodName },
    fix(fixer) {
      // Inserting .values() immediately after the root turns it into an iterator;
      // the rest of the chain methods exist on Iterator.prototype unchanged.
      return fixer.insertTextAfter(root, '.values()');
    },
  });
}

function handleSlice(
  node: estree.CallExpression,
  root: estree.Node,
  context: Rule.RuleContext,
): void {
  const transformation = analyzeSliceArgs(node.arguments);
  if (!transformation) return;

  const member = node.callee as estree.MemberExpression;

  const replacementLabel =
    transformation.type === 'drop-take' ? 'drop/take' : transformation.type;

  context.report({
    node,
    messageId: 'preferIteratorPipelineSlice',
    data: { replacement: replacementLabel },
    fix(fixer): Rule.Fix[] {
      const fixes: Rule.Fix[] = [];

      // Open the iterator pipeline at the root
      fixes.push(fixer.insertTextAfter(root, '.values()'));

      if (transformation.type === 'take') {
        // .slice(0, n) → .take(n).toArray()
        fixes.push(fixer.replaceText(member.property, 'take'));
        // Remove the leading "0, " argument so only n remains
        const arg0 = node.arguments[0] as estree.Literal;
        const arg1 = node.arguments[1] as estree.Literal;
        fixes.push(fixer.removeRange([arg0.range![0], arg1.range![0]]));
        fixes.push(fixer.insertTextAfter(node, '.toArray()'));
      } else if (transformation.type === 'drop') {
        // .slice(n) → .drop(n).toArray()
        fixes.push(fixer.replaceText(member.property, 'drop'));
        fixes.push(fixer.insertTextAfter(node, '.toArray()'));
      } else {
        // .slice(start, end) → .drop(start).take(end - start).toArray()
        // Replace from the '.' before 'slice' through the closing ')' in one shot
        const dotPos = member.property.range![0] - 1;
        fixes.push(
          fixer.replaceTextRange(
            [dotPos, node.range![1]],
            `.drop(${transformation.drop}).take(${transformation.take}).toArray()`,
          ),
        );
      }

      return fixes;
    },
  });
}

export default rule;
