export type ExampleId = 'payment' | 'inventory' | 'chat';
export type ExampleVariant = 'buggy' | 'fixed';
export type Algorithm = 'bfs' | 'dfs' | 'random';
export type RunPhase =
  | 'ready'
  | 'running'
  | 'violation'
  | 'bounded-success'
  | 'cancelled'
  | 'error';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface RunOptions {
  algorithm: Algorithm;
  maxDepth: number;
  maxStates: number;
  timeoutMs: number;
  randomSeed: number;
  stopOnFirstViolation: boolean;
}

export interface RunProgress {
  visitedStates: number;
  expandedStates: number;
  transitionsEvaluated: number;
  invariantChecks: number;
  currentDepth: number;
  durationMs: number;
}

export interface RunMetrics extends RunProgress {
  duplicateStatesSkipped: number;
  deepestExploredLevel: number;
  statesPerSecond: number;
  algorithm: Algorithm;
  randomSeed: number;
}

export interface StateDiffEntry {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: JsonValue;
  after?: JsonValue;
}

export interface InvariantStatus {
  id: string;
  title: string;
  holds: boolean;
}

export interface TraceStep {
  index: number;
  transitionId: string;
  actor: string;
  label: string;
  description?: string;
  before: JsonValue;
  after: JsonValue;
  diff: StateDiffEntry[];
  invariants: InvariantStatus[];
}

export interface Counterexample {
  invariantId: string;
  invariantTitle: string;
  finalState: JsonValue;
  transitionIds: string[];
  steps: TraceStep[];
  originalLength: number;
  minimizedLength: number;
}

export type CompletionReason =
  | 'violation'
  | 'exhausted'
  | 'cancelled'
  | 'max-depth'
  | 'state-limit'
  | 'timeout'
  | 'invalid-system';

export interface UiRunResult {
  reason: CompletionReason;
  metrics: RunMetrics;
  bounds: RunOptions;
  counterexample?: Counterexample;
  message?: string;
}

export interface RunRequest {
  runId: number;
  exampleId: ExampleId;
  variant: ExampleVariant;
  options: RunOptions;
}

export type WorkerRequest =
  | { type: 'run'; payload: RunRequest }
  | { type: 'cancel'; runId: number };

export type WorkerResponse =
  | { type: 'progress'; runId: number; progress: RunProgress }
  | { type: 'complete'; runId: number; result: UiRunResult }
  | { type: 'cancelled'; runId: number; result?: UiRunResult }
  | { type: 'error'; runId: number; message: string };
