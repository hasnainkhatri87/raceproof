import {
  applyTransitionSafely,
  cloneJson,
  diffStates,
  evaluateInvariantsSafely,
  evaluateTransitionGuard,
  validateSystemDefinition,
} from '@raceproof/core';
import type { InvariantResult, SystemDefinition } from '@raceproof/core';
import type { ReplayFailure, ReplayResult, ReplayViolation, TraceRecord, TraceStep } from './types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure<State>(
  transitionIds: readonly string[],
  state: State | undefined,
  initialState: State | undefined,
  initialInvariants: readonly InvariantResult[],
  finalInvariants: readonly InvariantResult[],
  steps: readonly TraceStep<State>[],
  violations: readonly ReplayViolation[],
  detail: ReplayFailure,
  issues?: ReplayResult<State>['issues'],
): ReplayResult<State> {
  return {
    ok: false,
    transitionIds: [...transitionIds],
    initialState,
    finalState: state,
    initialInvariants,
    finalInvariants,
    steps,
    violations,
    failure: detail,
    ...(issues === undefined ? {} : { issues }),
  };
}

function collectViolations(results: readonly InvariantResult[], stepIndex: number): ReplayViolation[] {
  return results.filter((invariant) => !invariant.passed).map((invariant) => ({ stepIndex, invariant }));
}

/**
 * Replay a trace against a trusted definition. It never executes unknown
 * transition IDs and returns a structured divergence instead of throwing.
 */
export function replayTrace<State>(
  definition: SystemDefinition<State> | unknown,
  transitionIds: readonly string[],
): ReplayResult<State> {
  const validation = validateSystemDefinition(definition);
  if (!validation.valid) {
    return failure<State>(
      transitionIds,
      undefined,
      undefined,
      [],
      [],
      [],
      [],
      {
        kind: 'invalid-system',
        stepIndex: -1,
        message: 'System definition is invalid and cannot be replayed.',
      },
      validation.issues,
    );
  }

  const system = definition as SystemDefinition<State>;
  const transitions = new Map(system.transitions.map((transition) => [transition.id, transition]));
  let state: State;
  let initialState: State;
  let initialInvariants: InvariantResult[];
  let finalInvariants: InvariantResult[];
  const steps: TraceStep<State>[] = [];
  const violations: ReplayViolation[] = [];

  try {
    state = cloneJson(system.initialState);
    initialState = cloneJson(state);
    initialInvariants = evaluateInvariantsSafely(system.invariants, state);
    finalInvariants = initialInvariants;
    violations.push(...collectViolations(initialInvariants, -1));
  } catch (error) {
    return failure<State>(
      transitionIds,
      undefined,
      undefined,
      [],
      [],
      [],
      [],
      { kind: 'execution-error', stepIndex: -1, message: errorMessage(error) },
    );
  }

  for (let index = 0; index < transitionIds.length; index += 1) {
    const transitionId = transitionIds[index];
    // `noUncheckedIndexedAccess` means the guard also makes malformed arrays safe.
    if (transitionId === undefined) {
      return failure<State>(
        transitionIds,
        cloneJson(state),
        initialState,
        initialInvariants,
        finalInvariants,
        steps,
        violations,
        { kind: 'unknown-transition', stepIndex: index, message: `Missing transition ID at step ${index + 1}.` },
      );
    }

    const transition = transitions.get(transitionId);
    if (transition === undefined) {
      return failure<State>(
        transitionIds,
        cloneJson(state),
        initialState,
        initialInvariants,
        finalInvariants,
        steps,
        violations,
        {
          kind: 'unknown-transition',
          stepIndex: index,
          transitionId,
          message: `Trace step ${index + 1} references unknown transition "${transitionId}".`,
        },
      );
    }

    let enabled: boolean;
    try {
      enabled = evaluateTransitionGuard(transition, state);
    } catch (error) {
      return failure<State>(
        transitionIds,
        cloneJson(state),
        initialState,
        initialInvariants,
        finalInvariants,
        steps,
        violations,
        { kind: 'execution-error', stepIndex: index, transitionId, message: errorMessage(error) },
      );
    }
    if (!enabled) {
      return failure<State>(
        transitionIds,
        cloneJson(state),
        initialState,
        initialInvariants,
        finalInvariants,
        steps,
        violations,
        {
          kind: 'disabled-transition',
          stepIndex: index,
          transitionId,
          message: `Trace step ${index + 1} transition "${transitionId}" is not enabled in the replay state.`,
        },
      );
    }

    const before = cloneJson(state);
    try {
      state = applyTransitionSafely(transition, state);
      finalInvariants = evaluateInvariantsSafely(system.invariants, state);
    } catch (error) {
      return failure<State>(
        transitionIds,
        cloneJson(state),
        initialState,
        initialInvariants,
        finalInvariants,
        steps,
        violations,
        { kind: 'execution-error', stepIndex: index, transitionId, message: errorMessage(error) },
      );
    }

    const after = cloneJson(state);
    const invariantResults = finalInvariants.map((result) => ({ ...result }));
    steps.push({
      index,
      transitionId,
      actor: transition.actor,
      label: transition.label,
      ...(transition.description === undefined ? {} : { description: transition.description }),
      before,
      after,
      diff: diffStates(before, after),
      invariants: invariantResults,
    });
    violations.push(...collectViolations(invariantResults, index));
  }

  return {
    ok: true,
    transitionIds: [...transitionIds],
    initialState,
    finalState: cloneJson(state),
    initialInvariants,
    finalInvariants,
    steps,
    violations,
  };
}

export class TraceReconstructionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceReconstructionError';
  }
}

/**
 * Rebuild ordered transition IDs from compact parent records. Arrays are
 * accepted so callers can persist records as JSON without retaining a Map.
 */
export function reconstructTrace<State>(records: readonly TraceRecord<State>[], finalKey: string): string[] {
  const byKey = new Map<string, TraceRecord<State>>();
  for (const record of records) {
    if (byKey.has(record.key)) {
      throw new TraceReconstructionError(`Trace records contain duplicate key "${record.key}".`);
    }
    byKey.set(record.key, record);
  }

  const transitionIds: string[] = [];
  const seen = new Set<string>();
  let key: string | undefined = finalKey;
  while (key !== undefined) {
    if (seen.has(key)) throw new TraceReconstructionError(`Trace records contain a parent cycle at "${key}".`);
    seen.add(key);
    const record = byKey.get(key);
    if (record === undefined) throw new TraceReconstructionError(`Trace record "${key}" is missing.`);

    if (record.parentKey === undefined) {
      if (record.transitionId !== undefined) {
        throw new TraceReconstructionError(`Root trace record "${key}" must not have a transition ID.`);
      }
      break;
    }
    if (record.transitionId === undefined || record.transitionId.length === 0) {
      throw new TraceReconstructionError(`Trace record "${key}" is missing its transition ID.`);
    }
    transitionIds.unshift(record.transitionId);
    key = record.parentKey;
  }
  return transitionIds;
}
