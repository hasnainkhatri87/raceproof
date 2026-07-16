import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { type SystemDefinition } from '@raceproof/core';
import { getExampleMetadata, getExampleSystem, EXAMPLE_IDS } from '@raceproof/examples';
import { explore } from '@raceproof/explorer';
import { generateVitestRegressionTest, regressionDownloadFilename } from '@raceproof/test-generator';
import { CLI_EXIT, runCli } from '../../packages/cli/src/cli';
import { runBundledExploration } from '../../apps/web/src/explorationAdapter';

describe('bundled examples', () => {
  it('finds each intended buggy violation within its documented bounds', async () => {
    for (const id of EXAMPLE_IDS) {
      const metadata = getExampleMetadata(id);
      const result = await explore(getExampleSystem(id, 'buggy') as unknown as SystemDefinition<unknown>, metadata.documentedBounds);
      expect(result.reason, id).toBe('violation');
      expect(result.counterexample?.invariantTitle, id).toBe(metadata.invariantTitle);
    }
  });

  it('finds no invariant violation for each fixed model within documented bounds', async () => {
    for (const id of EXAMPLE_IDS) {
      const metadata = getExampleMetadata(id);
      const result = await explore(getExampleSystem(id, 'fixed') as unknown as SystemDefinition<unknown>, metadata.documentedBounds);
      expect(result.reason, id).not.toBe('violation');
      expect(result.reason, id).not.toBe('invalid-system');
      expect(result.counterexample, id).toBeUndefined();
    }
  });

  it('keeps the browser adapter in agreement with direct engine results', async () => {
    const request = {
      runId: 1,
      exampleId: 'payment' as const,
      variant: 'buggy' as const,
      options: { algorithm: 'bfs' as const, maxDepth: 8, maxStates: 500, timeoutMs: 2_000, randomSeed: 42, stopOnFirstViolation: true },
    };
    const adapter = await runBundledExploration(request, undefined, () => undefined);
    const direct = await explore(getExampleSystem('payment', 'buggy') as unknown as SystemDefinition<unknown>, request.options);
    expect(adapter.reason).toBe(direct.reason);
    expect(adapter.counterexample?.transitionIds).toEqual(direct.counterexample?.transitionIds);
    expect(adapter.metrics.visitedStates).toBe(direct.metrics.visitedStates);
  });
});

describe('test generation and CLI', () => {
  it('generates portable, syntactically valid Vitest source', () => {
    const source = generateVitestRegressionTest({
      exampleId: 'payment',
      variant: 'buggy',
      transitionIds: ['payment.begin', 'payment.timeout', 'payment.retry', 'payment.complete-original', 'payment.complete-retry'],
      invariantId: 'payment.single-charge',
      invariantTitle: 'A single order can be charged no more than once',
      options: { algorithm: 'bfs', randomSeed: 42, maxDepth: 8, maxStates: 500, timeoutMs: 2_000 },
    });
    expect(source).toContain("import { paymentBuggy as system } from '@raceproof/examples';");
    expect(source).toContain('expect(replay.ok, replay.failure?.message).toBe(true);');
    expect(source).toContain("expect(invariant?.passed).toBe(true);");
    expect(source).not.toMatch(/[A-Za-z]:\\/);
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    });
    expect(transpiled.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)).toEqual([]);
    expect(regressionDownloadFilename({ exampleId: 'inventory', variant: 'fixed' })).toBe('raceproof-inventory-fixed.test.ts');
  });

  it('returns documented CLI exit codes and JSON output', async () => {
    const lines: string[] = [];
    const errors: string[] = [];
    const io = { write: (line: string) => lines.push(line), error: (line: string) => errors.push(line) };
    await expect(runCli(['payment', '--variant', 'buggy'], io)).resolves.toBe(CLI_EXIT.violation);
    expect(lines.join('\n')).toContain('VIOLATION: A single order can be charged no more than once');

    lines.length = 0;
    await expect(runCli(['payment', '--variant', 'fixed', '--format', 'json'], io)).resolves.toBe(CLI_EXIT.bounded);
    expect(JSON.parse(lines.join('\n'))).toMatchObject({ example: 'payment', variant: 'fixed' });

    await expect(runCli(['not-real'], io)).resolves.toBe(CLI_EXIT.error);
    expect(errors.join('\n')).toContain('Unknown example');
  });
});
