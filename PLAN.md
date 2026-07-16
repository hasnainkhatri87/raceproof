# RaceProof delivery plan

## Phases

1. **Foundation** — establish npm workspaces, strict shared TypeScript settings, linting, Vitest, Playwright, and package boundaries.
2. **Deterministic engine** — implement definition validation, canonical JSON state keys, bounded BFS/DFS/seeded-random exploration, metrics, cancellation, replay, state diffs, and trace minimization.
3. **Demonstrations and tooling** — ship buggy/fixed payment, inventory, and chat systems; add Vitest generation and the CLI.
4. **Judge-facing application** — build the React/Vite interface, Web Worker protocol, live progress, bounded-result messaging, replay timeline, state inspector, and generated-test view.
5. **Hardening** — complete unit/property/integration/E2E coverage, accessibility and responsive QA, benchmark harness, security review, documentation, and CI.

## Dependencies

- Node.js 20+ and npm 10+
- TypeScript, React, Vite, Vitest, fast-check, ESLint, Playwright
- Package order: `core` → `explorer` → `examples` → `test-generator` / `cli` → `web`

## Principal risks

- State deduplication can hide valid traces if canonicalization is unstable.
- Unsafe minimization can retain invalid guard-dependent subsequences.
- "Eventually" invariants require finite terminal/quiescent modeling rather than premature state checks.
- Worker and direct execution can diverge unless both use the same serializable example catalog and engine.
- Broad bounds can consume excessive time or memory; every entry point must enforce hard caps.

## Acceptance criteria

- Each buggy example deterministically violates its named invariant at a small bound; each fixed variant reports no violation within its documented bound.
- BFS returns a shortest counterexample; DFS and seeded random runs are deterministic for identical inputs.
- Replay validates guards, reproduces final state, reports divergence, and powers safe same-invariant minimization.
- The browser explores in a worker with progress, cancellation, accessible replay, responsive layouts, test export, and precise bounded claims.
- CLI exit codes, generated Vitest source, imports, JSON validation, and all root commands behave as documented.
- No runtime AI, remote service, arbitrary-code execution, secrets, analytics, database, or authentication.

## Verification commands

```sh
npm install
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run benchmark
npm run check
npm run raceproof -- payment --variant buggy
npm run raceproof -- payment --variant fixed
npm run raceproof -- inventory --max-depth 10
npm run raceproof -- chat --format json
```
