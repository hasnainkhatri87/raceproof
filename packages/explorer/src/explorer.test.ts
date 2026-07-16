import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SystemDefinition } from '@raceproof/core';
import { explore, minimizeCounterexample, reconstructTrace, replayTrace } from './index';

type PhaseState = { phase: 'start' | 'long' | 'bad'; route: 'none' | 'direct' | 'long' };

const orderingSystem: SystemDefinition<PhaseState> = {
  id: 'ordering',
  title: 'Ordering',
  description: 'A system with a short direct failure and a longer alternative.',
  initialState: { phase: 'start', route: 'none' },
  transitions: [
    {
      id: 'direct-failure',
      label: 'Direct failure',
      actor: 'fast lane',
      isEnabled: (state) => state.phase === 'start',
      apply: () => ({ phase: 'bad', route: 'direct' }),
    },
    {
      id: 'long-step',
      label: 'Long step',
      actor: 'slow lane',
      isEnabled: (state) => state.phase === 'start',
      apply: () => ({ phase: 'long', route: 'long' }),
    },
    {
      id: 'long-failure',
      label: 'Long failure',
      actor: 'slow lane',
      isEnabled: (state) => state.phase === 'long',
      apply: () => ({ phase: 'bad', route: 'long' }),
    },
  ],
  invariants: [
    {
      id: 'not-bad',
      title: 'State is not bad',
      description: 'The final bad state is deliberately unsafe.',
      check: (state) => state.phase !== 'bad',
    },
  ],
};

function counterSystem(limit: number): SystemDefinition<{ value: number }> {
  return {
    id: `counter-${limit}`,
    title: 'Counter',
    description: 'A finite counter.',
    initialState: { value: 0 },
    transitions: [
      {
        id: 'increment',
        label: 'Increment',
        actor: 'counter',
        isEnabled: (state) => state.value < limit,
        apply: (state) => ({ value: state.value + 1 }),
      },
    ],
    invariants: [
      { id: 'nonnegative', title: 'Nonnegative', description: 'Values remain nonnegative.', check: (state) => state.value >= 0 },
    ],
  };
}

describe('bounded exploration', () => {
  it('uses BFS by default and returns a shortest counterexample', async () => {
    const result = await explore(orderingSystem, { maxDepth: 5, maxStates: 100, timeoutMs: 5_000 });
    expect(result.reason).toBe('violation');
    expect(result.counterexample?.transitionIds).toEqual(['direct-failure']);
    expect(result.counterexample?.originalLength).toBe(1);
    expect(result.counterexample?.steps[0]?.diff).toEqual(expect.arrayContaining([{ path: '/phase', kind: 'changed', before: 'start', after: 'bad' }]));
  });

  it('supports DFS as a distinct deterministic traversal', async () => {
    const result = await explore(orderingSystem, { algorithm: 'dfs', maxDepth: 5, maxStates: 100, timeoutMs: 5_000 });
    expect(result.reason).toBe('violation');
    expect(result.counterexample?.transitionIds).toEqual(['long-step', 'long-failure']);
    expect(result.metrics.algorithm).toBe('dfs');
  });

  it('deduplicates states reached by different transitions', async () => {
    const system: SystemDefinition<{ value: number }> = {
      id: 'duplicate', title: 'Duplicate', description: 'Two events produce the same state.', initialState: { value: 0 },
      transitions: [
        { id: 'left', label: 'Left', actor: 'A', isEnabled: (state) => state.value === 0, apply: () => ({ value: 1 }) },
        { id: 'right', label: 'Right', actor: 'B', isEnabled: (state) => state.value === 0, apply: () => ({ value: 1 }) },
      ],
      invariants: [{ id: 'safe', title: 'Safe', description: 'Always safe.', check: () => true }],
    };
    const result = await explore(system, { maxDepth: 3, maxStates: 10, timeoutMs: 5_000 });
    expect(result.reason).toBe('exhausted');
    expect(result.metrics.visitedStates).toBe(2);
    expect(result.metrics.duplicateStatesSkipped).toBe(1);
  });

  it('is reproducible for a seeded randomized traversal', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), async (seed) => {
        const options = { algorithm: 'random' as const, randomSeed: seed, maxDepth: 5, maxStates: 100, timeoutMs: 5_000 };
        const first = await explore(orderingSystem, options);
        const second = await explore(orderingSystem, options);
        expect(first.reason).toBe(second.reason);
        expect(first.counterexample?.transitionIds).toEqual(second.counterexample?.transitionIds);
        expect(first.metrics.duplicateStatesSkipped).toBe(second.metrics.duplicateStatesSkipped);
      }),
    );
  });

  it('enforces depth, state, cancellation, and timeout bounds distinctly', async () => {
    const chain = counterSystem(10);
    await expect(explore(chain, { maxDepth: 2, maxStates: 20, timeoutMs: 5_000 })).resolves.toMatchObject({ reason: 'max-depth' });
    await expect(explore(chain, { maxDepth: 10, maxStates: 1, timeoutMs: 5_000 })).resolves.toMatchObject({ reason: 'state-limit' });

    const controller = new AbortController();
    controller.abort();
    await expect(explore(chain, { maxDepth: 10, maxStates: 20, timeoutMs: 5_000 }, { signal: controller.signal })).resolves.toMatchObject({ reason: 'cancelled' });

    let time = 0;
    await expect(explore(chain, { maxDepth: 10, maxStates: 20, timeoutMs: 1 }, { now: () => time++ })).resolves.toMatchObject({ reason: 'timeout' });
  });

  it('reports malformed bounds and mutation as invalid systems instead of throwing', async () => {
    const invalidBounds = await explore(counterSystem(1), { maxStates: 0, timeoutMs: 5_000 });
    expect(invalidBounds.reason).toBe('invalid-system');
    expect(invalidBounds.message).toContain('Invalid exploration bounds');

    const mutating: SystemDefinition<{ count: number }> = {
      id: 'mutating', title: 'Mutating', description: 'Bad callback.', initialState: { count: 0 },
      transitions: [{ id: 'mutate', label: 'Mutate', actor: 'bad', isEnabled: () => true, apply: (state) => {
        (state as unknown as { count: number }).count += 1;
        return state as { count: number };
      } }],
      invariants: [{ id: 'safe', title: 'Safe', description: 'Always safe.', check: () => true }],
    };
    const result = await explore(mutating, { maxDepth: 2, maxStates: 10, timeoutMs: 5_000 });
    expect(result.reason).toBe('invalid-system');
    expect(result.message).toContain('attempted to mutate');
  });
});

describe('replay, reconstruction, and minimization', () => {
  it('replays a reported trace to the reported final state', async () => {
    const result = await explore(orderingSystem, { maxDepth: 5, maxStates: 100, timeoutMs: 5_000 });
    const counterexample = result.counterexample;
    expect(counterexample).toBeDefined();
    const replay = replayTrace(orderingSystem, counterexample?.transitionIds ?? []);
    expect(replay.ok).toBe(true);
    expect(replay.finalState).toEqual(counterexample?.finalState);
    expect(replay.violations.some((violation) => violation.invariant.id === counterexample?.invariantId)).toBe(true);
  });

  it('explains unknown and guard-disabled replay divergence', () => {
    expect(replayTrace(orderingSystem, ['unknown']).failure).toMatchObject({ kind: 'unknown-transition', stepIndex: 0 });
    expect(replayTrace(orderingSystem, ['long-failure']).failure).toMatchObject({ kind: 'disabled-transition', stepIndex: 0, transitionId: 'long-failure' });
  });

  it('reconstructs parent-linked traces and rejects cycles', () => {
    expect(reconstructTrace([
      { key: 'root', state: { value: 0 }, depth: 0 },
      { key: 'first', state: { value: 1 }, depth: 1, parentKey: 'root', transitionId: 'one' },
      { key: 'last', state: { value: 2 }, depth: 2, parentKey: 'first', transitionId: 'two' },
    ], 'last')).toEqual(['one', 'two']);
    expect(() => reconstructTrace([
      { key: 'a', state: { value: 0 }, depth: 0, parentKey: 'b', transitionId: 'x' },
      { key: 'b', state: { value: 1 }, depth: 1, parentKey: 'a', transitionId: 'y' },
    ], 'a')).toThrow('parent cycle');
  });

  it('minimizes only valid guard-respecting subsequences with the same failure', () => {
    type SetupState = { setup: boolean; noise: boolean; broken: boolean };
    const system: SystemDefinition<SetupState> = {
      id: 'minimize', title: 'Minimize', description: 'A guard-dependent trace.', initialState: { setup: false, noise: false, broken: false },
      transitions: [
        { id: 'setup', label: 'Setup', actor: 'A', isEnabled: (state) => !state.setup, apply: (state) => ({ ...state, setup: true }) },
        { id: 'noise', label: 'Noise', actor: 'A', isEnabled: (state) => state.setup && !state.noise, apply: (state) => ({ ...state, noise: true }) },
        { id: 'break', label: 'Break', actor: 'B', isEnabled: (state) => state.setup && !state.broken, apply: (state) => ({ ...state, broken: true }) },
      ],
      invariants: [{ id: 'not-broken', title: 'Not broken', description: 'Must remain unbroken.', check: (state) => !state.broken }],
    };
    const minimized = minimizeCounterexample(system, ['setup', 'noise', 'break'], 'not-broken');
    expect(minimized.minimizedTrace).toEqual(['setup', 'break']);
    expect(minimized.replay.ok).toBe(true);
    expect(minimized.replay.violations).toHaveLength(1);
  });
});
