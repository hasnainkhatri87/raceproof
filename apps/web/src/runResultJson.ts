import type { Counterexample, InvariantStatus, JsonValue, RunMetrics, RunOptions, StateDiffEntry, TraceStep, UiRunResult } from './types';

export const MAX_RUN_RESULT_BYTES = 1_000_000;

export class RunResultImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunResultImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function hasFiniteNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

function isRunOptions(value: unknown): value is RunOptions {
  if (!isRecord(value)) return false;
  return (
    (value.algorithm === 'bfs' || value.algorithm === 'dfs' || value.algorithm === 'random') &&
    hasFiniteNumber(value, 'maxDepth') &&
    hasFiniteNumber(value, 'maxStates') &&
    hasFiniteNumber(value, 'timeoutMs') &&
    hasFiniteNumber(value, 'randomSeed') &&
    typeof value.stopOnFirstViolation === 'boolean'
  );
}

function isRunMetrics(value: unknown): value is RunMetrics {
  if (!isRecord(value)) return false;
  return (
    isRunOptions({ ...value, maxDepth: 0, maxStates: 1, timeoutMs: 1, stopOnFirstViolation: true }) &&
    hasFiniteNumber(value, 'visitedStates') &&
    hasFiniteNumber(value, 'expandedStates') &&
    hasFiniteNumber(value, 'duplicateStatesSkipped') &&
    hasFiniteNumber(value, 'transitionsEvaluated') &&
    hasFiniteNumber(value, 'invariantChecks') &&
    hasFiniteNumber(value, 'currentDepth') &&
    hasFiniteNumber(value, 'durationMs') &&
    hasFiniteNumber(value, 'deepestExploredLevel') &&
    hasFiniteNumber(value, 'statesPerSecond')
  );
}

function isDiff(value: unknown): value is StateDiffEntry {
  if (!isRecord(value) || !hasString(value, 'path')) return false;
  if (value.kind !== 'added' && value.kind !== 'removed' && value.kind !== 'changed') return false;
  return (value.before === undefined || isJsonValue(value.before)) && (value.after === undefined || isJsonValue(value.after));
}

function isInvariant(value: unknown): value is InvariantStatus {
  return isRecord(value) && hasString(value, 'id') && hasString(value, 'title') && typeof value.holds === 'boolean';
}

function isTraceStep(value: unknown): value is TraceStep {
  if (!isRecord(value)) return false;
  return (
    hasFiniteNumber(value, 'index') &&
    hasString(value, 'transitionId') &&
    hasString(value, 'actor') &&
    hasString(value, 'label') &&
    (value.description === undefined || typeof value.description === 'string') &&
    isJsonValue(value.before) &&
    isJsonValue(value.after) &&
    Array.isArray(value.diff) && value.diff.every(isDiff) &&
    Array.isArray(value.invariants) && value.invariants.every(isInvariant)
  );
}

function isCounterexample(value: unknown): value is Counterexample {
  if (!isRecord(value)) return false;
  return (
    hasString(value, 'invariantId') &&
    hasString(value, 'invariantTitle') &&
    isJsonValue(value.finalState) &&
    Array.isArray(value.transitionIds) && value.transitionIds.every((transition) => typeof transition === 'string') &&
    Array.isArray(value.steps) && value.steps.every(isTraceStep) &&
    hasFiniteNumber(value, 'originalLength') &&
    hasFiniteNumber(value, 'minimizedLength')
  );
}

function isRunResult(value: unknown): value is UiRunResult {
  if (!isRecord(value)) return false;
  const validReason = ['violation', 'exhausted', 'cancelled', 'max-depth', 'state-limit', 'timeout', 'invalid-system'].includes(String(value.reason));
  return (
    validReason &&
    isRunMetrics(value.metrics) &&
    isRunOptions(value.bounds) &&
    (value.counterexample === undefined || isCounterexample(value.counterexample)) &&
    (value.message === undefined || typeof value.message === 'string')
  );
}

/** Export only structured, JSON-compatible run data; never executable definitions. */
export function serializeRunResult(result: UiRunResult): string {
  return JSON.stringify({ version: 1, result }, null, 2);
}

/** Parse a portable result envelope while rejecting malformed or oversized data. */
export function parseRunResultJson(text: string): UiRunResult {
  if (new TextEncoder().encode(text).byteLength > MAX_RUN_RESULT_BYTES) {
    throw new RunResultImportError(`Run-result JSON exceeds the ${MAX_RUN_RESULT_BYTES.toLocaleString()} byte limit.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RunResultImportError('Run-result JSON is malformed.');
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRunResult(parsed.result)) {
    throw new RunResultImportError('Run-result JSON does not match the RaceProof v1 result schema.');
  }
  return parsed.result;
}
