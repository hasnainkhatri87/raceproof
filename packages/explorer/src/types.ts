import type { InvariantResult, StateDiffEntry, ValidationIssue } from '@raceproof/core';

/** Supported traversal strategies for bounded state-space exploration. */
export type ExplorationAlgorithm = 'bfs' | 'dfs' | 'random';

/**
 * User-provided exploration settings. Omitted values are normalized by
 * {@link explore} so results always contain a complete, serializable config.
 */
export interface ExplorationOptions {
  readonly algorithm?: ExplorationAlgorithm;
  readonly maxDepth?: number;
  readonly maxStates?: number;
  readonly timeoutMs?: number;
  readonly randomSeed?: number;
  readonly stopOnFirstViolation?: boolean;
  readonly collectMultipleViolations?: boolean;
}

export interface ResolvedExplorationOptions {
  readonly algorithm: ExplorationAlgorithm;
  readonly maxDepth: number;
  readonly maxStates: number;
  readonly timeoutMs: number;
  readonly randomSeed: number;
  readonly stopOnFirstViolation: boolean;
  readonly collectMultipleViolations: boolean;
}

export interface ExplorationProgress {
  readonly visitedStates: number;
  readonly expandedStates: number;
  readonly duplicateStatesSkipped: number;
  readonly transitionsEvaluated: number;
  readonly invariantChecks: number;
  readonly currentDepth: number;
  readonly deepestExploredLevel: number;
  readonly durationMs: number;
}

export interface ExplorationMetrics extends ExplorationProgress {
  readonly statesPerSecond: number;
  readonly algorithm: ExplorationAlgorithm;
  readonly randomSeed: number;
}

/** Optional runtime controls; they are intentionally separate from serializable options. */
export interface ExplorationControls {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExplorationProgress) => void;
  /** Injectable monotonic-ish clock, mainly useful for deterministic tests. */
  readonly now?: () => number;
  /** Number of expanded states between cooperative host yields. */
  readonly yieldEvery?: number;
}

export interface TraceStep<State> {
  readonly index: number;
  readonly transitionId: string;
  readonly actor: string;
  readonly label: string;
  readonly description?: string;
  readonly before: State;
  readonly after: State;
  readonly diff: readonly StateDiffEntry[];
  readonly invariants: readonly InvariantResult[];
}

export interface ReplayViolation {
  /** -1 means the initial state violated the invariant. */
  readonly stepIndex: number;
  readonly invariant: InvariantResult;
}

export type ReplayFailureKind =
  | 'invalid-system'
  | 'unknown-transition'
  | 'disabled-transition'
  | 'execution-error';

export interface ReplayFailure {
  readonly kind: ReplayFailureKind;
  /** The failing transition position, or -1 for an invalid definition. */
  readonly stepIndex: number;
  readonly transitionId?: string;
  readonly message: string;
}

/** A full deterministic replay, including every state transition that succeeded. */
export interface ReplayResult<State> {
  readonly ok: boolean;
  readonly transitionIds: readonly string[];
  readonly initialState?: State;
  readonly finalState?: State;
  readonly initialInvariants: readonly InvariantResult[];
  readonly finalInvariants: readonly InvariantResult[];
  readonly steps: readonly TraceStep<State>[];
  readonly violations: readonly ReplayViolation[];
  readonly failure?: ReplayFailure;
  readonly issues?: readonly ValidationIssue[];
}

/** A compact, JSON-serializable parent record used to reconstruct a trace. */
export interface TraceRecord<State> {
  readonly key: string;
  readonly state: State;
  readonly depth: number;
  readonly parentKey?: string;
  readonly transitionId?: string;
}

export interface Counterexample<State> {
  readonly invariantId: string;
  readonly invariantTitle: string;
  readonly invariantDescription: string;
  readonly finalState: State;
  readonly transitionIds: readonly string[];
  readonly steps: readonly TraceStep<State>[];
  readonly originalLength: number;
  readonly minimizedLength: number;
  readonly metrics: ExplorationMetrics;
}

export interface CounterexampleMinimization<State> {
  readonly originalTrace: readonly string[];
  readonly minimizedTrace: readonly string[];
  readonly originalLength: number;
  readonly minimizedLength: number;
  readonly replay: ReplayResult<State>;
}

export type ExplorationReason =
  | 'violation'
  | 'exhausted'
  | 'cancelled'
  | 'max-depth'
  | 'state-limit'
  | 'timeout'
  | 'invalid-system';

export interface ExplorationResult<State> {
  readonly reason: ExplorationReason;
  readonly options: ResolvedExplorationOptions;
  readonly metrics: ExplorationMetrics;
  readonly counterexample?: Counterexample<State>;
  readonly violations: readonly Counterexample<State>[];
  /** Structural definition errors, if validation failed before execution. */
  readonly issues?: readonly ValidationIssue[];
  /** A concise execution, configuration, or cancellation detail for the UI/CLI. */
  readonly message?: string;
}
