import type { JsonValue, SystemDefinition } from '@raceproof/core';
import { getExampleSystem } from '@raceproof/examples';
import { explore, type ExplorationProgress, type ExplorationResult } from '@raceproof/explorer';
import type {
  Counterexample,
  InvariantStatus,
  RunMetrics,
  RunProgress,
  RunRequest,
  RunOptions,
  StateDiffEntry,
  TraceStep,
  UiRunResult,
} from './types';

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function mapProgress(progress: ExplorationProgress): RunProgress {
  return {
    visitedStates: progress.visitedStates,
    expandedStates: progress.expandedStates,
    transitionsEvaluated: progress.transitionsEvaluated,
    invariantChecks: progress.invariantChecks,
    currentDepth: progress.currentDepth,
    durationMs: progress.durationMs,
  };
}

function mapMetrics(result: ExplorationResult<unknown>): RunMetrics {
  const metrics = result.metrics;
  return {
    ...mapProgress(metrics),
    duplicateStatesSkipped: metrics.duplicateStatesSkipped,
    deepestExploredLevel: metrics.deepestExploredLevel,
    statesPerSecond: metrics.statesPerSecond,
    algorithm: metrics.algorithm,
    randomSeed: metrics.randomSeed,
  };
}

function mapInvariants(
  invariants: readonly { readonly id: string; readonly title: string; readonly passed: boolean }[],
): InvariantStatus[] {
  return invariants.map((invariant) => ({ id: invariant.id, title: invariant.title, holds: invariant.passed }));
}

function mapStep(step: {
  readonly index: number;
  readonly transitionId: string;
  readonly actor: string;
  readonly label: string;
  readonly description?: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly diff: readonly StateDiffEntry[];
  readonly invariants: readonly { readonly id: string; readonly title: string; readonly passed: boolean }[];
}): TraceStep {
  return {
    index: step.index,
    transitionId: step.transitionId,
    actor: step.actor,
    label: step.label,
    ...(step.description === undefined ? {} : { description: step.description }),
    before: asJson(step.before),
    after: asJson(step.after),
    diff: step.diff.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      ...(entry.before === undefined ? {} : { before: asJson(entry.before) }),
      ...(entry.after === undefined ? {} : { after: asJson(entry.after) }),
    })),
    invariants: mapInvariants(step.invariants),
  };
}

function mapCounterexample(counterexample: ExplorationResult<unknown>['counterexample']): Counterexample | undefined {
  if (counterexample === undefined) return undefined;
  return {
    invariantId: counterexample.invariantId,
    invariantTitle: counterexample.invariantTitle,
    finalState: asJson(counterexample.finalState),
    transitionIds: [...counterexample.transitionIds],
    steps: counterexample.steps.map(mapStep),
    originalLength: counterexample.originalLength,
    minimizedLength: counterexample.minimizedLength,
  };
}

function mapOptions(options: ExplorationResult<unknown>['options']): RunOptions {
  return {
    algorithm: options.algorithm,
    maxDepth: options.maxDepth,
    maxStates: options.maxStates,
    timeoutMs: options.timeoutMs,
    randomSeed: options.randomSeed,
    stopOnFirstViolation: options.stopOnFirstViolation,
  };
}

function mapResult(result: ExplorationResult<unknown>): UiRunResult {
  return {
    reason: result.reason,
    metrics: mapMetrics(result),
    bounds: mapOptions(result.options),
    ...(mapCounterexample(result.counterexample) === undefined
      ? {}
      : { counterexample: mapCounterexample(result.counterexample) }),
    ...(result.message === undefined ? {} : { message: result.message }),
  };
}

/** Shared direct/Worker adapter. It only resolves statically bundled trusted examples. */
export async function runBundledExploration(
  request: RunRequest,
  signal: AbortSignal | undefined,
  onProgress: (progress: RunProgress) => void,
): Promise<UiRunResult> {
  const system = getExampleSystem(request.exampleId, request.variant) as unknown as SystemDefinition<unknown>;
  const result = await explore(system, request.options, {
    signal,
    onProgress: (progress) => onProgress(mapProgress(progress)),
  });
  return mapResult(result);
}
