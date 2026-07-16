export {
  explore,
  EXPLORATION_LIMITS,
  ExplorationConfigurationError,
} from './engine';
export { minimizeCounterexample } from './minimize';
export { reconstructTrace, replayTrace, TraceReconstructionError } from './replay';
export type {
  Counterexample,
  CounterexampleMinimization,
  ExplorationAlgorithm,
  ExplorationControls,
  ExplorationMetrics,
  ExplorationOptions,
  ExplorationProgress,
  ExplorationReason,
  ExplorationResult,
  ReplayFailure,
  ReplayFailureKind,
  ReplayResult,
  ReplayViolation,
  ResolvedExplorationOptions,
  TraceRecord,
  TraceStep,
} from './types';
