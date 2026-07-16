# Judge RaceProof in under five minutes

## 1. Start the application (about one minute)

With Node.js 20+ installed:

```sh
npm install
npm run dev
```

Open the local Vite URL. No account, API key, server, or network service is needed after installation.

## 2. Reproduce duplicate charging (about one minute)

Duplicate Payment and **Buggy** should already be selected. Keep BFS and the default small bounds, then choose **Run exploration**.

Expected: a coral violation summary for “A single order can be charged no more than once,” with a replayable counterexample and actual run metrics.

## 3. Inspect and export (about one minute)

Use Next or the right-arrow key through the event timeline. Confirm that changed state fields are highlighted and the invariant fails only at the violating state. Open the generated-test panel and inspect the guard checks and invariant assertion.

## 4. Check the fix (about 30 seconds)

Select **Fixed**, rerun with the same bounds, and confirm the exact message **“No violation found within selected bounds.”** RaceProof intentionally does not claim an unbounded proof.

## 5. Try the CLI (about one minute)

```sh
npm run raceproof -- payment --variant buggy
npm run raceproof -- inventory --variant fixed --max-depth 10
npm run raceproof -- chat --format json
```

The buggy command exits `1`, bounded-safe commands exit `0`, and invalid input exits `2`.

## Optional technical verification

```sh
npm run check
npm run test:e2e
```

The Playwright command requires locally installed browsers. The normal check covers lint, strict types, unit/property/integration tests, and the production build.
