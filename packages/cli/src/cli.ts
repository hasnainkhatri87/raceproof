import type { SystemDefinition } from '@raceproof/core';
import { getExampleMetadata, getExampleSystem, isExampleId, isExampleVariant, type ExampleId, type ExampleVariant } from '@raceproof/examples';
import { explore, type ExplorationAlgorithm, type ExplorationOptions, type ExplorationResult } from '@raceproof/explorer';

export const CLI_EXIT = {
  bounded: 0,
  violation: 1,
  error: 2,
} as const;

export interface CliIo {
  readonly write: (line: string) => void;
  readonly error: (line: string) => void;
}

export interface ParsedCliArguments {
  readonly help: boolean;
  readonly example?: ExampleId;
  readonly variant: ExampleVariant;
  readonly format: 'pretty' | 'json';
  readonly options: ExplorationOptions;
}

type MutableExplorationOptions = { -readonly [Key in keyof ExplorationOptions]: ExplorationOptions[Key] };

const HELP = `RaceProof - deterministic bounded concurrency exploration

Usage:
  npm run raceproof -- <payment|inventory|chat> [options]

Options:
  --variant <buggy|fixed>       Select model variant (default: buggy)
  --algorithm <bfs|dfs|random>  Traversal strategy (default: bfs)
  --max-depth <number>          Maximum event depth
  --max-states <number>         Maximum unique states
  --timeout <milliseconds>      Execution timeout
  --seed <integer>              Seed for randomized exploration
  --all-violations              Continue collecting reachable violations
  --format <pretty|json>        Output format (default: pretty)
  --help                        Show this help

Exit codes: 0 = no violation within selected bounds, 1 = violation found, 2 = invalid input or execution error.`;

function parseNumber(option: string, raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') throw new Error(`${option} requires a value.`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${option} must be a finite number.`);
  return parsed;
}

function requireValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseCliArguments(args: readonly string[]): ParsedCliArguments {
  let example: ExampleId | undefined;
  let variant: ExampleVariant = 'buggy';
  let format: 'pretty' | 'json' = 'pretty';
  const options: MutableExplorationOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    if (token === '--help' || token === '-h') {
      return { help: true, variant, format, options };
    }
    if (!token.startsWith('--')) {
      if (example !== undefined) throw new Error(`Unexpected argument "${token}".`);
      if (!isExampleId(token)) throw new Error(`Unknown example "${token}". Use payment, inventory, or chat.`);
      example = token;
      continue;
    }

    if (token === '--all-violations') {
      options.collectMultipleViolations = true;
      options.stopOnFirstViolation = false;
      continue;
    }
    const value = requireValue(args, index, token);
    switch (token) {
      case '--variant':
        if (!isExampleVariant(value)) throw new Error('--variant must be buggy or fixed.');
        variant = value;
        index += 1;
        break;
      case '--algorithm':
        if (!['bfs', 'dfs', 'random'].includes(value)) throw new Error('--algorithm must be bfs, dfs, or random.');
        options.algorithm = value as ExplorationAlgorithm;
        index += 1;
        break;
      case '--max-depth':
        options.maxDepth = parseNumber(token, value);
        index += 1;
        break;
      case '--max-states':
        options.maxStates = parseNumber(token, value);
        index += 1;
        break;
      case '--timeout':
        options.timeoutMs = parseNumber(token, value);
        index += 1;
        break;
      case '--seed':
        options.randomSeed = parseNumber(token, value);
        index += 1;
        break;
      case '--format':
        if (value !== 'pretty' && value !== 'json') throw new Error('--format must be pretty or json.');
        format = value;
        index += 1;
        break;
      default:
        throw new Error(`Unknown option "${token}".`);
    }
  }

  if (example === undefined) throw new Error('An example is required. Use payment, inventory, or chat.');
  return { help: false, example, variant, format, options };
}

function prettyResult<State>(example: ExampleId, variant: ExampleVariant, result: ExplorationResult<State>): string[] {
  const metadata = getExampleMetadata(example);
  const lines = [`RaceProof - ${metadata.title} - ${variant}`, ''];
  if (result.reason === 'violation' && result.counterexample) {
    const counterexample = result.counterexample;
    lines.push(`VIOLATION: ${counterexample.invariantTitle}`);
    lines.push(`Invariant ID: ${counterexample.invariantId}`);
    lines.push(`Counterexample: ${counterexample.minimizedLength} events (original ${counterexample.originalLength})`);
    lines.push('');
    lines.push('Trace:');
    if (counterexample.steps.length === 0) {
      lines.push('  The initial state already violates this invariant.');
    } else {
      for (const step of counterexample.steps) {
        lines.push(`  ${step.index + 1}. [${step.actor}] ${step.label} (${step.transitionId})`);
      }
    }
  } else if (result.reason === 'invalid-system') {
    lines.push(`ERROR: ${result.message ?? 'The system or bounds are invalid.'}`);
    for (const issue of result.issues ?? []) lines.push(`  ${issue.path || '<root>'}: ${issue.message}`);
  } else if (result.reason === 'cancelled') {
    lines.push('CANCELLED: exploration stopped before completion.');
  } else {
    lines.push('No violation found within selected bounds.');
    lines.push(`Completion reason: ${result.reason}`);
    lines.push(`Checked: depth <= ${result.options.maxDepth}, states <= ${result.options.maxStates}, timeout ${result.options.timeoutMs}ms.`);
  }
  lines.push('');
  lines.push('Metrics:');
  lines.push(`  visited ${result.metrics.visitedStates} - expanded ${result.metrics.expandedStates} - duplicates ${result.metrics.duplicateStatesSkipped}`);
  lines.push(`  transitions ${result.metrics.transitionsEvaluated} - invariant checks ${result.metrics.invariantChecks}`);
  lines.push(`  deepest level ${result.metrics.deepestExploredLevel} - ${result.metrics.durationMs.toFixed(1)}ms - ${result.metrics.statesPerSecond.toFixed(1)} states/s`);
  lines.push(`  algorithm ${result.metrics.algorithm} - seed ${result.metrics.randomSeed}`);
  return lines;
}

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = { write: (line) => console.log(line), error: (line) => console.error(line) },
): Promise<number> {
  let parsed: ParsedCliArguments;
  try {
    parsed = parseCliArguments(argv);
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    io.error('Run with --help for usage.');
    return CLI_EXIT.error;
  }

  if (parsed.help) {
    io.write(HELP);
    return CLI_EXIT.bounded;
  }
  const example = parsed.example;
  if (example === undefined) return CLI_EXIT.error;

  try {
    // The bundled catalog is trusted. This cast only unifies the three state shapes at the CLI boundary.
    const system = getExampleSystem(example, parsed.variant) as unknown as SystemDefinition<unknown>;
    const result = await explore(system, parsed.options);
    if (parsed.format === 'json') {
      io.write(JSON.stringify({ example, variant: parsed.variant, result }, null, 2));
    } else {
      for (const line of prettyResult(example, parsed.variant, result)) io.write(line);
    }
    return result.reason === 'violation'
      ? CLI_EXIT.violation
      : result.reason === 'invalid-system'
        ? CLI_EXIT.error
        : CLI_EXIT.bounded;
  } catch (error) {
    io.error(`RaceProof execution error: ${error instanceof Error ? error.message : String(error)}`);
    return CLI_EXIT.error;
  }
}

export { HELP as CLI_HELP };
