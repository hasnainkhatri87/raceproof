# Working in RaceProof

## Repository map

- `packages/core`: JSON domain types, validation, canonicalization, cloning/freezing, diffs
- `packages/explorer`: exploration algorithms, replay, reconstruction, minimization
- `packages/examples`: bundled trusted systems and catalog metadata
- `packages/test-generator`: deterministic Vitest regression source generation
- `packages/cli`: terminal entry point and exit-code contract
- `apps/web`: React application and exploration worker
- `tests/e2e`: Playwright judge journey and accessibility smoke coverage
- `benchmarks`: non-asserting performance measurements
- `docs`: architecture, security, build notes, demo and judging guides

## Engineering conventions

- TypeScript is strict; exported APIs have explicit types and no hidden mutable state.
- States are JSON-compatible values. Transitions return new state and never mutate input.
- Algorithms are deterministic for the same definition, bounds, algorithm, and seed.
- User-facing success language always says "within selected bounds."
- The web app executes only bundled definitions; never add `eval`, `new Function`, or dynamic paths from user input.
- Preserve package direction: lower-level packages may not import applications or the CLI.
- Prefer small pure functions, stable IDs, semantic HTML, visible focus, and CSS custom properties.
- Tests live beside package source when unit-level; cross-package and browser journeys live under `tests`.

## Commands

- `npm run dev`: web development server
- `npm run build`: production package and web build
- `npm run test`: unit, property, and integration tests
- `npm run test:e2e`: Playwright suite (browser install is separate)
- `npm run lint`: ESLint
- `npm run typecheck`: strict TypeScript checks
- `npm run check`: lint, typecheck, tests, production build
- `npm run benchmark`: informational benchmarks
- `npm run raceproof -- <example> [options]`: CLI

## Boundaries

- No AI/model SDK or network dependency at runtime.
- No arbitrary pasted JavaScript, unsanitized HTML, secrets, tracking, persistence service, or paid integration.
- Imported JSON is data-only, schema-validated, and size-limited.
- Do not describe a bounded exploration as a formal proof.
- Avoid unstable performance assertions in CI.

## Definition of done

A change is complete when relevant tests, type checks, lint, and production build pass; error and empty states remain usable; documentation matches behavior; no material TODO/FIXME remains; and the final diff has been reviewed for correctness, accessibility, security, and accidental changes.
