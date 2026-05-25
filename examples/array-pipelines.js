// ── examples/array-pipelines.js ──────────────────────────────────────────────
// Run `npm run lint:examples` to see the warnings.
// Run `npm run lint:examples:fix` to apply the auto-fix and observe the output.
// ─────────────────────────────────────────────────────────────────────────────

const users = getUsersFromDatabase(); // large array in practice

// ✗ find — iterator pipeline recommended (early exit + no intermediate arrays)
const admin = users
  .filter(u => u.isActive)
  .map(u => u.role)
  .find(role => role === 'admin');

// ✗ some — same short-circuit benefit
const hasAdmin = users
  .filter(u => u.isActive)
  .map(u => u.role)
  .some(role => role === 'admin');

// ✗ every — same short-circuit benefit
const allVerified = users
  .filter(u => u.isActive)
  .map(u => u.email)
  .every(email => email.endsWith('@corp.example'));

// ✗ slice(0, n) — iterator only pulls the first n; no need to filter the whole array first
const firstFiveActive = users
  .filter(u => u.isActive)
  .slice(0, 5);

// ✗ slice(start, end) — converts to drop + take
const pageTwo = users
  .filter(u => u.isActive)
  .slice(10, 20);

// ✗ forEach — flagged, but the hover message warns you to profile first:
//   iterator protocol overhead typically makes this *slower* than the array pipeline
users
  .filter(u => u.isActive)
  .map(u => u.email)
  .forEach(email => sendWelcome(email));

// ✓ already an iterator pipeline — not flagged
const adminIterator = users
  .values()
  .filter(u => u.isActive)
  .find(u => u.role === 'admin');

// ✓ no terminating operation — result is intentionally a full array
const activeEmails = users
  .filter(u => u.isActive)
  .map(u => u.email);

// ✓ unknown method in chain — rule doesn't convert because sort() has no iterator equivalent
const sortedAdmins = users
  .filter(u => u.role === 'admin')
  .sort((a, b) => a.name.localeCompare(b.name))
  .find(u => u.isActive);

// ─── stubs so the file is self-contained ─────────────────────────────────────
function getUsersFromDatabase() {
  return [];
}
function sendWelcome(_email) {}
