# Contributing to RaceProof

Thank you for helping make concurrency failures reproducible.

## Development

1. Use Node.js 20+ and npm 10+.
2. Run `npm install` and `npm run dev`.
3. Keep package dependencies pointed inward: core → explorer → examples/tooling → applications.
4. Add focused tests for every behavior change.
5. Run `npm run check` before opening a pull request; run `npm run test:e2e` for interface changes when Playwright browsers are available.

## Definition guidelines

- Keep state JSON-compatible and transitions deterministic and immutable.
- Give transitions, invariants, and systems stable, descriptive IDs.
- Model asynchronous milestones explicitly; do not use timers, randomness, I/O, or hidden globals inside a definition.
- Document the bound at which a fixed example was checked.

## Pull requests

Explain the concurrency behavior being changed, the relevant invariant, and the verification commands you ran. Do not include generated build output, credentials, telemetry, runtime AI dependencies, or arbitrary-code execution surfaces.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
