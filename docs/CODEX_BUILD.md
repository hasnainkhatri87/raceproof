# Built with GPT-5.6 and Codex

GPT-5.6 and Codex were used as development tools while creating RaceProof for OpenAI Build Week. RaceProof has no AI functionality at runtime: it makes no model or OpenAI API calls, uses no model package, requires no API key, and executes deterministically.

## Components developed with Codex

- TypeScript domain types, canonical serialization, validation, and mutation checks
- BFS, DFS, seeded-random bounded exploration and metrics
- Replay, state diffing, counterexample reconstruction, and delta debugging
- Duplicate payment, inventory overselling, and out-of-order chat models
- Web Worker protocol and React replay workbench
- CLI and Vitest regression-test generator
- Unit, property, integration, browser, and accessibility tests
- CI, benchmark harness, security notes, and submission documentation

## Human architectural decisions

The product direction deliberately models small deterministic systems rather than instrumenting arbitrary application code. Important human choices include the bounded-not-proof language, bundled-only trust boundary, JSON-compatible immutable states, explicit quiescence in the chat example, parent-linked visited graph, and a breadth-first default optimized for understandable counterexamples.

## Codex-assisted testing and review

Codex was used to run and repair lint, strict TypeScript checks, unit/property/integration tests, production builds, CLI journeys, Playwright where supported, and informational benchmarks. It also reviewed state identity, guard-aware minimization, worker parity, accessible interaction, and unsafe execution boundaries. The final handoff records only commands that actually completed.

## Performance work

The design avoids retaining a full trace for every frontier entry, deduplicates by canonical state, checks all configured limits, performs exploration off the browser main thread, and keeps benchmark results informational across different hardware.

## Known limitations

The analysis is bounded, definitions are bundled and trusted, state must be JSON-compatible, and synchronous transition functions cannot be preempted mid-call. This is not an unbounded proof, production tracer, or sandbox for arbitrary code.

## Build Week feedback session

**Main `/feedback` session ID:** `[ADD_REAL_FEEDBACK_SESSION_ID_BEFORE_SUBMISSION]`
