import {
  applyTransitionSafely,
  canonicalStateKey,
  cloneJson,
  evaluateInvariantsSafely,
  evaluateTransitionGuard,
  validateSystemDefinition,
} from '@raceproof/core';
import type { InvariantResult, SystemDefinition, Transition } from '@raceproof/core';
import { minimizeCounterexample } from './minimize';
import { reconstructTrace, replayTrace } from './replay';
import type {
  Counterexample,
  ExplorationControls,
  ExplorationMetrics,
  ExplorationOptions,
  ExplorationProgress,
  ExplorationReason,
  ExplorationResult,
  ResolvedExplorationOptions,
  TraceRecord,
} from './types';

const DEFAULT_OPTIONS: ResolvedExplorationOptions = {
  algorithm: 'bfs',
  maxDepth: 12,
  maxStates: 10_000,
  timeoutMs: 5_000,
  randomSeed: 1,
  stopOnFirstViolation: true,
  collectMultipleViolations: false,
};

export const EXPLORATION_LIMITS = {
  maxDepth: 1_000,
  maxStates: 100_000,
  timeoutMs: 120_000,
} as const;

export class ExplorationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExplorationConfigurationError';
  }
}

function normalizeOptions(options: ExplorationOptions | undefined): ResolvedExplorationOptions {
  const collectMultipleViolations = options?.collectMultipleViolations ?? DEFAULT_OPTIONS.collectMultipleViolations;
  const resolved: ResolvedExplorationOptions = {
    algorithm: options?.algorithm ?? DEFAULT_OPTIONS.algorithm,
    maxDepth: options?.maxDepth ?? DEFAULT_OPTIONS.maxDepth,
    maxStates: options?.maxStates ?? DEFAULT_OPTIONS.maxStates,
    timeoutMs: options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
    randomSeed: options?.randomSeed ?? DEFAULT_OPTIONS.randomSeed,
    stopOnFirstViolation: options?.stopOnFirstViolation ?? !collectMultipleViolations,
    collectMultipleViolations,
  };

  if (!['bfs', 'dfs', 'random'].includes(resolved.algorithm)) {
    throw new ExplorationConfigurationError('algorithm must be one of bfs, dfs, or random.');
  }
  if (!Number.isInteger(resolved.maxDepth) || resolved.maxDepth < 0 || resolved.maxDepth > EXPLORATION_LIMITS.maxDepth) {
    throw new ExplorationConfigurationError(
      `maxDepth must be an integer from 0 to ${EXPLORATION_LIMITS.maxDepth}.`,
    );
  }
  if (!Number.isInteger(resolved.maxStates) || resolved.maxStates < 1 || resolved.maxStates > EXPLORATION_LIMITS.maxStates) {
    throw new ExplorationConfigurationError(
      `maxStates must be an integer from 1 to ${EXPLORATION_LIMITS.maxStates}.`,
    );
  }
  if (!Number.isFinite(resolved.timeoutMs) || resolved.timeoutMs <= 0 || resolved.timeoutMs > EXPLORATION_LIMITS.timeoutMs) {
    throw new ExplorationConfigurationError(
      `timeoutMs must be a finite number greater than 0 and no more than ${EXPLORATION_LIMITS.timeoutMs}.`,
    );
  }
  if (!Number.isInteger(resolved.randomSeed)) {
    throw new ExplorationConfigurationError('randomSeed must be an integer.');
  }
  if (typeof resolved.stopOnFirstViolation !== 'boolean' || typeof resolved.collectMultipleViolations !== 'boolean') {
    throw new ExplorationConfigurationError('Violation collection options must be boolean values.');
  }
  return resolved;
}

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function createPrng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffledTransitions<State>(transitions: readonly Transition<State>[], random: () => number): Transition<State>[] {
  const ordered = [...transitions];
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    const current = ordered[index];
    ordered[index] = ordered[selected] as Transition<State>;
    ordered[selected] = current as Transition<State>;
  }
  return ordered;
}

function emptyMetrics(options: ResolvedExplorationOptions): ExplorationMetrics {
  return {
    visitedStates: 0,
    expandedStates: 0,
    duplicateStatesSkipped: 0,
    transitionsEvaluated: 0,
    invariantChecks: 0,
    currentDepth: 0,
    deepestExploredLevel: 0,
    durationMs: 0,
    statesPerSecond: 0,
    algorithm: options.algorithm,
    randomSeed: options.randomSeed,
  };
}

function invalidResult<State>(
  options: ResolvedExplorationOptions,
  message: string,
  issues?: ExplorationResult<State>['issues'],
): ExplorationResult<State> {
  return {
    reason: 'invalid-system',
    options,
    metrics: emptyMetrics(options),
    violations: [],
    ...(issues === undefined ? {} : { issues }),
    message,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldStop(
  controls: ExplorationControls | undefined,
  now: () => number,
  startedAt: number,
  timeoutMs: number,
): ExplorationReason | undefined {
  if (controls?.signal?.aborted) return 'cancelled';
  if (now() - startedAt >= timeoutMs) return 'timeout';
  return undefined;
}

function matchingInvariant(results: readonly InvariantResult[]): InvariantResult | undefined {
  return results.find((result) => !result.passed);
}

function invokeProgress(callback: ExplorationControls['onProgress'], progress: ExplorationProgress): void {
  try {
    callback?.(progress);
  } catch {
    // A host display callback must not turn an otherwise deterministic run into an engine failure.
  }
}

function needsYield(expanded: number, yieldEvery: number | undefined): boolean {
  const interval = yieldEvery ?? 128;
  return Number.isFinite(interval) && interval > 0 && expanded > 0 && expanded % Math.floor(interval) === 0;
}

function cooperativeYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buildCounterexample<State>(
  definition: SystemDefinition<State>,
  records: readonly TraceRecord<State>[],
  finalKey: string,
  failingInvariant: InvariantResult,
  fallbackState: State,
  metrics: ExplorationMetrics,
): Counterexample<State> {
  const originalTrace = reconstructTrace(records, finalKey);
  const minimized = minimizeCounterexample(definition, originalTrace, failingInvariant.id);
  const replay = minimized.replay.ok ? minimized.replay : replayTrace<State>(definition, originalTrace);
  const finalState = replay.finalState === undefined ? cloneJson(fallbackState) : cloneJson(replay.finalState);

  return {
    invariantId: failingInvariant.id,
    invariantTitle: failingInvariant.title,
    invariantDescription: failingInvariant.description,
    finalState,
    transitionIds: [...minimized.minimizedTrace],
    steps: replay.steps.map((step) => ({ ...step, diff: [...step.diff], invariants: [...step.invariants] })),
    originalLength: originalTrace.length,
    minimizedLength: minimized.minimizedLength,
    metrics,
  };
}

/**
 * Explore reachable states using a deterministic bounded traversal. Definitions
 * stay pure; browser worker, CLI, and tests all call this same function.
 */
export async function explore<State>(
  definition: SystemDefinition<State> | unknown,
  options?: ExplorationOptions,
  controls?: ExplorationControls,
): Promise<ExplorationResult<State>> {
  let resolved: ResolvedExplorationOptions;
  try {
    resolved = normalizeOptions(options);
  } catch (error) {
    const fallback = { ...DEFAULT_OPTIONS, ...(options ?? {}) } as ResolvedExplorationOptions;
    return invalidResult(fallback, `Invalid exploration bounds: ${errorMessage(error)}`);
  }

  const validation = validateSystemDefinition(definition);
  if (!validation.valid) {
    return invalidResult(resolved, 'System definition is invalid.', validation.issues);
  }

  const system = definition as SystemDefinition<State>;
  const now = controls?.now ?? defaultNow;
  const startedAt = now();
  const random = createPrng(resolved.randomSeed);
  const records: TraceRecord<State>[] = [];
  const byKey = new Map<string, TraceRecord<State>>();
  const frontier: string[] = [];
  const pendingViolations: Counterexample<State>[] = [];
  let frontierIndex = 0;
  let maxDepthReached = false;
  const counts = {
    visitedStates: 0,
    expandedStates: 0,
    duplicateStatesSkipped: 0,
    transitionsEvaluated: 0,
    invariantChecks: 0,
    currentDepth: 0,
    deepestExploredLevel: 0,
  };

  const snapshotMetrics = (): ExplorationMetrics => {
    const durationMs = Math.max(0, now() - startedAt);
    return {
      ...counts,
      durationMs,
      statesPerSecond: durationMs === 0 ? 0 : (counts.visitedStates * 1_000) / durationMs,
      algorithm: resolved.algorithm,
      randomSeed: resolved.randomSeed,
    };
  };

  const emitProgress = (): void => invokeProgress(controls?.onProgress, snapshotMetrics());

  const finish = (reason: ExplorationReason, message?: string): ExplorationResult<State> => {
    const metrics = snapshotMetrics();
    const violations = pendingViolations.map((counterexample) => ({ ...counterexample, metrics }));
    emitProgress();
    return {
      reason,
      options: resolved,
      metrics,
      ...(violations[0] === undefined ? {} : { counterexample: violations[0] }),
      violations,
      ...(message === undefined ? {} : { message }),
    };
  };

  const registerViolation = (record: TraceRecord<State>, invariant: InvariantResult): Counterexample<State> => {
    const counterexample = buildCounterexample(system, records, record.key, invariant, record.state, snapshotMetrics());
    pendingViolations.push(counterexample);
    return counterexample;
  };

  try {
    const earlyStop = shouldStop(controls, now, startedAt, resolved.timeoutMs);
    if (earlyStop !== undefined) return finish(earlyStop);

    const initialState = cloneJson(system.initialState);
    const initialKey = canonicalStateKey(initialState);
    const initial: TraceRecord<State> = { key: initialKey, state: initialState, depth: 0 };
    records.push(initial);
    byKey.set(initialKey, initial);
    frontier.push(initialKey);
    counts.visitedStates = 1;

    emitProgress();

    while (resolved.algorithm === 'bfs' ? frontierIndex < frontier.length : frontier.length > 0) {
      const stop = shouldStop(controls, now, startedAt, resolved.timeoutMs);
      if (stop !== undefined) return finish(stop);

      let key: string | undefined;
      if (resolved.algorithm === 'bfs') {
        key = frontier[frontierIndex];
        frontierIndex += 1;
      } else if (resolved.algorithm === 'dfs') {
        key = frontier.pop();
        frontierIndex = frontier.length;
      } else {
        const index = Math.floor(random() * frontier.length);
        key = frontier.splice(index, 1)[0];
        frontierIndex = 0;
      }
      if (key === undefined) continue;
      const record = byKey.get(key);
      if (record === undefined) continue;

      counts.expandedStates += 1;
      counts.currentDepth = record.depth;
      counts.deepestExploredLevel = Math.max(counts.deepestExploredLevel, record.depth);

      const invariantResults = evaluateInvariantsSafely(system.invariants, record.state);
      counts.invariantChecks += invariantResults.length;
      const failure = matchingInvariant(invariantResults);
      if (failure !== undefined) {
        registerViolation(record, failure);
        if (resolved.stopOnFirstViolation) return finish('violation');
      }

      const orderedTransitions =
        resolved.algorithm === 'random' ? shuffledTransitions(system.transitions, random) : [...system.transitions];

      if (record.depth >= resolved.maxDepth) {
        for (const transition of orderedTransitions) {
          const boundStop = shouldStop(controls, now, startedAt, resolved.timeoutMs);
          if (boundStop !== undefined) return finish(boundStop);
          counts.transitionsEvaluated += 1;
          if (evaluateTransitionGuard(transition, record.state)) maxDepthReached = true;
        }
        emitProgress();
        if (needsYield(counts.expandedStates, controls?.yieldEvery)) await cooperativeYield();
        continue;
      }

      for (const transition of orderedTransitions) {
        const transitionStop = shouldStop(controls, now, startedAt, resolved.timeoutMs);
        if (transitionStop !== undefined) return finish(transitionStop);
        counts.transitionsEvaluated += 1;
        if (!evaluateTransitionGuard(transition, record.state)) continue;

        if (counts.visitedStates >= resolved.maxStates) {
          return finish('state-limit', `Stopped after reaching the selected state limit (${resolved.maxStates}).`);
        }

        const nextState = applyTransitionSafely(transition, record.state);
        const nextKey = canonicalStateKey(nextState);
        if (byKey.has(nextKey)) {
          counts.duplicateStatesSkipped += 1;
          continue;
        }

        const nextRecord: TraceRecord<State> = {
          key: nextKey,
          state: cloneJson(nextState),
          depth: record.depth + 1,
          parentKey: record.key,
          transitionId: transition.id,
        };
        records.push(nextRecord);
        byKey.set(nextKey, nextRecord);
        counts.visitedStates += 1;
        counts.deepestExploredLevel = Math.max(counts.deepestExploredLevel, nextRecord.depth);

        frontier.push(nextKey);
      }

      emitProgress();
      if (needsYield(counts.expandedStates, controls?.yieldEvery)) await cooperativeYield();
    }

    if (pendingViolations.length > 0) return finish('violation');
    return finish(maxDepthReached ? 'max-depth' : 'exhausted');
  } catch (error) {
    return finish('invalid-system', `Exploration could not execute this system: ${errorMessage(error)}`);
  }
}
