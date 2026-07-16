# Security and trust model

## Trust boundary

RaceProof 0.1 runs only the six definitions compiled into `@raceproof/examples`. Definitions are executable TypeScript and are therefore trusted application code. The web application never evaluates user-provided JavaScript, accepts dynamic module paths, injects HTML, or loads remote scripts, fonts, analytics, or models.

All exploration happens locally. The static application has no database, account system, secrets, telemetry, backend API, or OpenAI dependency.

## Data handling

- States are restricted to JSON-compatible values: null, booleans, finite numbers, strings, arrays, and plain objects.
- Definition identifiers are validated and transition inputs are cloned/frozen to expose mutation.
- Rendered state and generated code use normal text nodes, never unsanitized HTML.
- Generated downloads use fixed MIME types and sanitized, bounded filenames.
- Clipboard failures and download failures are surfaced without losing the run result.
- Any run-result import surface must reject files over 1 MiB and validate the complete schema before state is accepted. Data import never creates executable behavior.

## Resource limits

Depth, unique states, and execution time are required bounds. Entry points reject non-finite, negative, or excessive values. The explorer checks cancellation and timeout between state expansions and retains parent references instead of a full trace for every frontier node.

Reasonable hard caps protect the demonstration from accidental browser exhaustion. They are operational controls, not a defense against a malicious modified bundle.

## Failure handling

- Invalid definitions produce an `invalid-system` result with actionable validation messages.
- Unknown or disabled transitions produce explicit replay divergence rather than partial success.
- Worker crashes and malformed worker messages become visible UI errors.
- Cancellation and timeout have distinct completion reasons and preserve metrics.
- Browsers without Worker support use a clearly signaled direct local fallback.
- Bounds and downloaded filenames are validated before use.

## Known limitations

RaceProof is not a sandbox for untrusted transition code. A developer who modifies the source and adds a transition is running that code with the same privileges as the application. A single expensive synchronous transition cannot be interrupted mid-call. Static hosting security headers depend on the chosen host and are outside this repository's portable static bundle.

Report suspected vulnerabilities privately through the security contact the repository owner adds before public launch. **Maintainer action required:** add that contact to the eventual repository security policy.
