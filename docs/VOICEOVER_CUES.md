# RaceProof voiceover cues

Record against [the clean visual master](assets/raceproof-build-week-visual-master.mp4). It is 2 minutes 36 seconds, contains no audio, and has no burned-in captions.

Use a clear, natural pace. The approximate timings below match the edit; a short breath between sections is fine.

| Time | Visual | Voiceover |
| --- | --- | --- |
| 0:04–0:27 | RaceProof opening workbench | Most automated tests commit to one familiar order: request, response, assertion. Production sees retries, delayed events, duplicate delivery, stale reads, and out-of-order completion. RaceProof deterministically explores the other bounded timelines a TypeScript system can reach. |
| 0:27–0:53 | Duplicate Payment violation | Here is Duplicate Payment. A customer starts a payment, sees a timeout, and retries. The original and retry can complete in either order. In the buggy model, both completions charge the same order. RaceProof explores the reachable states and finds the safety invariant failure: a single order can be charged no more than once. |
| 0:53–1:12 | Replay timeline | It returns more than an alert. Every failing schedule is a minimized, valid counterexample. The replay names each actor and transition, then shows immutable states before and after the event, structured field changes, and the invariant result at every step. |
| 1:12–1:30 | Generated Vitest test | One click turns the discovered schedule into a self-contained Vitest regression. It replays the exact transition IDs, verifies every step is enabled, and asserts the intended invariant, so a production race becomes a durable automated test. |
| 1:30–1:49 | Fixed bounded-safe result | Switch to the fixed payment model and run the same bounded search. Idempotency prevents a repeated completion from charging twice, and RaceProof reports no violation found within selected bounds. That is a precise bounded result, never an unbounded formal proof. |
| 1:49–2:10 | Inventory and Chat examples | RaceProof also includes inventory overselling and out-of-order chat edits, each with buggy and fixed variants. Judges can explore these trusted examples locally from the web app or the CLI, with no account, API key, remote service, or arbitrary code execution. |
| 2:10–2:33 | Build Week card | For OpenAI Build Week, GPT-5.6 and Codex were used to shape the architecture, implement the explorer and interface, build the tests, and review performance and security. RaceProof itself contains no AI at runtime. It helps developers explore the timelines their tests never run. |

## Final export

Export the combined video as a public YouTube upload with 1280×720 or higher H.264 video and AAC audio. Add [the supplied captions](assets/raceproof-build-week-demo.srt), then paste the public URL into Devpost.
