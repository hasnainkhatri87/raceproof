# Three-minute RaceProof demo

## 0:00–0:20 — Set the problem

“Most tests run the event order we expect. Production runs the orders we did not write down: timeouts, retries, duplicates, and delayed completions. RaceProof explores those timelines deterministically.”

Show the Duplicate Payment card with **Buggy** selected. Point out that everything runs locally and the bounds are explicit.

## 0:20–1:05 — Find the race

Click **Run exploration**. When the violation appears, read the invariant: “A single order can be charged no more than once.”

Call out the real engine metrics, the original/minimized trace lengths, and the event order: begin, timeout, retry, then both payment attempts complete. Emphasize that BFS returned an understandable short reproduction.

## 1:05–1:50 — Replay and keep the bug fixed

Use Next or the right arrow to walk the timeline. Show the actor labels, before/after state, highlighted field changes, and the invariant switching from passing to failing.

Open **Generated test**. Explain: “This is a normal Vitest regression. It replays the exact IDs, verifies every guard, and asserts the safety rule. It fails on the buggy model and protects the fix.”

## 1:50–2:25 — Prove the bounded fix

Switch to **Fixed** and rerun with the same bounds. Show: “No violation found within selected bounds.” Make the limitation explicit: “That is not a universal proof; it is the exact finite search shown here.”

Briefly explain that the idempotency record makes the second completion harmless.

## 2:25–2:50 — Breadth of the tool

Point to Inventory Overselling and Out-of-Order Chat: stale reads versus atomic reserve, and edit-before-create versus buffering/reconciliation. Mention BFS, DFS, seeded random, CLI, cancellation, and the Web Worker.

## 2:50–3:00 — Close

“RaceProof turns a flaky production story into a deterministic timeline, a minimal reproduction, and a regression test—without an account, API key, or runtime AI.”

## Recording checklist

- Record at 1440×900 with browser zoom at 100%.
- Reset to Duplicate Payment / Buggy / BFS before recording.
- Keep the cursor movements deliberate and do one clean uninterrupted take.
- Hide personal tabs, notifications, terminal paths, and browser extensions.
- Verify generated-test copy/download and keyboard replay before the take.
