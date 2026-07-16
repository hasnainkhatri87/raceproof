import type { SystemDefinition } from '@raceproof/core';
import { canonicalSerialize } from '@raceproof/core';
import { explore, minimizeCounterexample, reconstructTrace } from '@raceproof/explorer';
import { paymentBuggy } from '@raceproof/examples';

type CounterState = { node: number; limit: number };

function counterSystem(limit: number): SystemDefinition<CounterState> {
  return {
    id: `benchmark-tree-${limit}`,
    title: 'Benchmark tree',
    description: 'A shallow deterministic ten-way state tree used only for informational measurement.',
    initialState: { node: 0, limit },
    transitions: Array.from({ length: 10 }, (_unused, digit) => ({
      id: `branch-${digit + 1}`,
      label: `Branch ${digit + 1}`,
      actor: 'Benchmark',
      isEnabled: (state: Readonly<CounterState>) => state.node * 10 + digit + 1 <= state.limit,
      apply: (state: Readonly<CounterState>) => ({ ...state, node: state.node * 10 + digit + 1 }),
    })),
    invariants: [
      {
        id: 'non-negative',
        title: 'Node stays non-negative',
        description: 'The benchmark state has no intentionally failing invariant.',
        check: (state) => state.node >= 0,
      },
    ],
  };
}

function elapsed<T>(label: string, action: () => T): T {
  const started = performance.now();
  const value = action();
  const durationMs = performance.now() - started;
  console.log(`${label.padEnd(32)} ${durationMs.toFixed(2)} ms`);
  return value;
}

async function elapsedAsync<T>(label: string, action: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const value = await action();
  const durationMs = performance.now() - started;
  console.log(`${label.padEnd(32)} ${durationMs.toFixed(2)} ms`);
  return value;
}

async function main(): Promise<void> {
  console.log('RaceProof benchmark (informational; no performance assertions)');

  await elapsedAsync('Explore 1,000 states', () =>
    explore(counterSystem(999), {
      algorithm: 'bfs',
      maxDepth: 3,
      maxStates: 1_010,
      timeoutMs: 30_000,
    }),
  );

  await elapsedAsync('Explore 10,000 states', () =>
    explore(counterSystem(9_999), {
      algorithm: 'bfs',
      maxDepth: 4,
      maxStates: 10_010,
      timeoutMs: 30_000,
    }),
  );

  const representativeState = {
    order: { id: 'order-1042', status: 'pending', attempts: [1, 2, 3] },
    ledger: { charges: 1, currency: 'USD' },
    metadata: { source: 'benchmark', enabled: true },
  };
  elapsed('State serialization (10,000)', () => {
    for (let index = 0; index < 10_000; index += 1) canonicalSerialize(representativeState);
  });

  const records = Array.from({ length: 5_001 }, (_, index) => ({
    key: `node-${index}`,
    state: { index },
    depth: index,
    ...(index > 0 ? { parentKey: `node-${index - 1}`, transitionId: 'advance' } : {}),
  }));
  elapsed('Trace reconstruction (5,000)', () => reconstructTrace(records, 'node-5000'));

  const result = await explore(paymentBuggy, {
    algorithm: 'bfs',
    maxDepth: 8,
    maxStates: 500,
    timeoutMs: 5_000,
    stopOnFirstViolation: true,
  });
  const counterexample = result.counterexample;
  if (!counterexample) {
    throw new Error('The bundled payment bug must produce a benchmark counterexample.');
  }
  elapsed('Counterexample minimization', () =>
    minimizeCounterexample(paymentBuggy, counterexample.transitionIds, counterexample.invariantId),
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
