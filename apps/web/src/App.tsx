import type { ChangeEvent, JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { generateVitestRegressionTest, regressionDownloadFilename } from '@raceproof/test-generator';
import { CodeViewer } from './CodeViewer';
import { EXAMPLES, getExampleContent } from './exampleContent';
import { MAX_RUN_RESULT_BYTES, parseRunResultJson, serializeRunResult } from './runResultJson';
import { useExplorer } from './useExplorer';
import type { ExampleId, ExampleVariant, RunOptions, TraceStep } from './types';

const DEFAULT_OPTIONS: RunOptions = {
  algorithm: 'bfs',
  maxDepth: 8,
  maxStates: 500,
  timeoutMs: 2_000,
  randomSeed: 42,
  stopOnFirstViolation: true,
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDuration(value: number): string {
  return value < 1_000 ? `${value.toFixed(value < 10 ? 1 : 0)} ms` : `${(value / 1_000).toFixed(2)} s`;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function completionTitle(reason: string): string {
  switch (reason) {
    case 'exhausted':
      return 'No violation found within selected bounds.';
    case 'max-depth':
      return 'Maximum depth reached before the state space was exhausted.';
    case 'state-limit':
      return 'State limit reached before the state space was exhausted.';
    case 'timeout':
      return 'Timeout reached before the state space was exhausted.';
    default:
      return 'Run completed.';
  }
}

function StatusIcon({ phase }: { phase: string }): JSX.Element {
  if (phase === 'violation' || phase === 'error') return <AlertTriangle aria-hidden="true" />;
  if (phase === 'bounded-success') return <ShieldCheck aria-hidden="true" />;
  if (phase === 'running') return <LoaderCircle className="spin" aria-hidden="true" />;
  if (phase === 'cancelled') return <Square aria-hidden="true" />;
  return <CheckCircle2 aria-hidden="true" />;
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JsonPanel({ title, value, onCopy }: { title: string; value: unknown; onCopy: (value: string) => void }): JSX.Element {
  const json = prettyJson(value);
  return (
    <section className="json-panel" aria-label={title}>
      <header>
        <h4>{title}</h4>
        <button className="icon-button" type="button" onClick={() => onCopy(json)} aria-label={`Copy ${title}`}>
          <Clipboard size={16} aria-hidden="true" />
        </button>
      </header>
      <pre>{json}</pre>
    </section>
  );
}

function DiffList({ step }: { step: TraceStep | null }): JSX.Element {
  if (step === null) return <p className="muted">Choose a timeline event to inspect its changes.</p>;
  if (step.diff.length === 0) return <p className="muted">This event produced no observable state fields changes.</p>;
  return (
    <ul className="diff-list" aria-label="State changes">
      {step.diff.map((entry) => (
        <li key={`${entry.path}-${entry.kind}`}>
          <span className={`diff-kind ${entry.kind}`}>{entry.kind}</span>
          <code>{entry.path || '/'}</code>
          <span className="diff-values">
            {entry.before === undefined ? '' : `${JSON.stringify(entry.before)} -> `}
            {entry.after === undefined ? '' : JSON.stringify(entry.after)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function App(): JSX.Element {
  const [exampleId, setExampleId] = useState<ExampleId>('payment');
  const [variant, setVariant] = useState<ExampleVariant>('buggy');
  const [options, setOptions] = useState<RunOptions>(DEFAULT_OPTIONS);
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const runId = useRef(0);
  const resultFileRef = useRef<HTMLInputElement>(null);
  const explorer = useExplorer();
  const example = getExampleContent(exampleId);
  const counterexample = explorer.result?.counterexample;
  const steps = counterexample?.steps ?? [];
  const currentStep = steps[replayIndex] ?? null;
  const generatedTest = useMemo(
    () =>
      counterexample === undefined
        ? null
        : generateVitestRegressionTest({
            exampleId,
            variant,
            transitionIds: counterexample.transitionIds,
            invariantId: counterexample.invariantId,
            invariantTitle: counterexample.invariantTitle,
            options,
          }),
    [counterexample, exampleId, options, variant],
  );

  useEffect(() => {
    setReplayIndex(0);
    setPlaying(false);
  }, [counterexample]);

  useEffect(() => {
    if (!playing || steps.length === 0) return undefined;
    const timer = window.setInterval(() => {
      setReplayIndex((index) => {
        if (index >= steps.length - 1) {
          setPlaying(false);
          return index;
        }
        return index + 1;
      });
    }, 1_200);
    return () => window.clearInterval(timer);
  }, [playing, steps.length]);

  const previous = useCallback(() => setReplayIndex((index) => Math.max(0, index - 1)), []);
  const next = useCallback(() => setReplayIndex((index) => Math.min(Math.max(0, steps.length - 1), index + 1)), [steps.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === ' ' && steps.length > 0) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, previous, steps.length]);

  const copyText = useCallback(async (value: string, label: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied to your clipboard.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Could not copy ${label.toLowerCase()}.`);
    }
  }, []);

  const downloadTest = useCallback(() => {
    if (generatedTest === null || counterexample === undefined) return;
    try {
      const blob = new Blob([generatedTest], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = regressionDownloadFilename({ exampleId, variant });
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice('Vitest regression test downloaded.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not prepare the download.');
    }
  }, [counterexample, exampleId, generatedTest, variant]);

  const downloadRunResult = useCallback(() => {
    const result = explorer.result;
    if (result === null) {
      setNotice('Run an exploration before exporting its result.');
      return;
    }
    try {
      const blob = new Blob([serializeRunResult(result)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'raceproof-run-result.json';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice('Schema-valid run result downloaded.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not prepare the run-result download.');
    }
  }, [explorer.result]);

  const importRunResult = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file === undefined) return;
    if (file.size > MAX_RUN_RESULT_BYTES) {
      setNotice(`Run-result files must be smaller than ${MAX_RUN_RESULT_BYTES.toLocaleString()} bytes.`);
      return;
    }
    try {
      const imported = parseRunResultJson(await file.text());
      explorer.load(imported);
      setNotice('Schema-valid run result loaded locally.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import this run result.');
    }
  }, [explorer]);
  const chooseExample = (id: ExampleId): void => {
    const selected = getExampleContent(id);
    setExampleId(id);
    setOptions((current) => ({ ...current, ...selected.bounds }));
    explorer.reset();
  };

  const run = (): void => {
    runId.current += 1;
    setNotice(null);
    setPlaying(false);
    explorer.run({ runId: runId.current, exampleId, variant, options });
  };

  const reset = (): void => {
    setOptions((current) => ({ ...current, ...example.bounds }));
    setReplayIndex(0);
    setPlaying(false);
    explorer.reset();
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to exploration workspace</a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">RP</span>
          <div>
            <h1>RaceProof</h1>
            <p>Explore the timelines your tests never run.</p>
          </div>
        </div>
        <a
          className="repository-placeholder"
          href="https://github.com/hasnainkhatri87/raceproof"
          target="_blank"
          rel="noreferrer"
        >
          View source on GitHub
        </a>
      </header>

      <main id="workspace">
        <section className="hero-panel" aria-labelledby="workspace-title">
          <div>
            <p className="eyebrow">Deterministic concurrency testing</p>
            <h2 id="workspace-title">Make one production race reproducible.</h2>
            <p>
              RaceProof explores bounded event orderings for bundled, immutable TypeScript models. It never executes pasted code and makes no network or AI calls.
            </p>
          </div>
          <div className={`run-chip ${explorer.phase}`} role="status" aria-live="polite">
            <StatusIcon phase={explorer.phase} />
            <span>{explorer.phase.replace('-', ' ')}</span>
            <small>{explorer.executionMode === 'worker' ? 'Worker' : 'Local fallback'}</small>
          </div>
        </section>

        <section className="panel selector-panel" aria-labelledby="examples-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Bundled demonstrations</p>
              <h2 id="examples-title">Choose a system</h2>
            </div>
            <div className="variant-toggle" aria-label="Select model variant">
              {(['buggy', 'fixed'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={variant === candidate}
                  className={variant === candidate ? 'selected' : ''}
                  onClick={() => {
                    setVariant(candidate);
                    explorer.reset();
                  }}
                >
                  {candidate === 'buggy' ? 'Buggy' : 'Fixed'}
                </button>
              ))}
            </div>
          </div>
          <div className="example-grid">
            {EXAMPLES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={`example-card ${candidate.id === exampleId ? 'selected' : ''}`}
                aria-pressed={candidate.id === exampleId}
                onClick={() => chooseExample(candidate.id)}
              >
                <span>{candidate.eyebrow}</span>
                <strong>{candidate.title}</strong>
                <small>{candidate.summary}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="workspace-grid">
          <section className="panel controls-panel" aria-labelledby="controls-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Search configuration</p>
                <h2 id="controls-title">Exploration controls</h2>
              </div>
              <span className="bound-note">Every run is finite and bounded.</span>
            </div>
            <div className="field-grid">
              <label>
                Algorithm
                <select
                  value={options.algorithm}
                  onChange={(event) => setOptions((current) => ({ ...current, algorithm: event.currentTarget.value as RunOptions['algorithm'] }))}
                >
                  <option value="bfs">Breadth-first (shortest trace)</option>
                  <option value="dfs">Depth-first</option>
                  <option value="random">Seeded random</option>
                </select>
              </label>
              <label>
                Maximum depth
                <input type="number" min="0" max="1000" value={options.maxDepth} onChange={(event) => setOptions((current) => ({ ...current, maxDepth: Number(event.currentTarget.value) }))} />
              </label>
              <label>
                Maximum states
                <input type="number" min="1" max="100000" value={options.maxStates} onChange={(event) => setOptions((current) => ({ ...current, maxStates: Number(event.currentTarget.value) }))} />
              </label>
              <label>
                Timeout (ms)
                <input type="number" min="1" max="120000" value={options.timeoutMs} onChange={(event) => setOptions((current) => ({ ...current, timeoutMs: Number(event.currentTarget.value) }))} />
              </label>
              <label>
                Random seed
                <input type="number" value={options.randomSeed} onChange={(event) => setOptions((current) => ({ ...current, randomSeed: Number(event.currentTarget.value) }))} />
              </label>
              <label className="check-field">
                <input type="checkbox" checked={options.stopOnFirstViolation} onChange={(event) => setOptions((current) => ({ ...current, stopOnFirstViolation: event.currentTarget.checked }))} />
                Stop after first violation
              </label>
            </div>
            <div className="control-actions">
              <button className="primary-button" type="button" onClick={run} disabled={explorer.phase === 'running'} data-testid="run-exploration">
                <Play size={17} aria-hidden="true" /> Run exploration
              </button>
              <button className="secondary-button" type="button" onClick={explorer.cancel} disabled={explorer.phase !== 'running'}>
                <Square size={16} aria-hidden="true" /> Cancel
              </button>
              <button className="ghost-button" type="button" onClick={reset}>
                <RotateCcw size={16} aria-hidden="true" /> Reset
              </button>
            </div>
            {explorer.error ? <p className="inline-error" role="alert">{explorer.error}</p> : null}
          </section>

          <aside className="panel live-panel" aria-labelledby="live-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Live run status</p>
                <h2 id="live-title">Actual engine metrics</h2>
              </div>
              <span className={`status-dot ${explorer.phase}`} aria-hidden="true" />
            </div>
            <div className="metric-grid">
              <Metric label="Visited states" value={formatNumber(explorer.progress.visitedStates)} />
              <Metric label="Transitions" value={formatNumber(explorer.progress.transitionsEvaluated)} />
              <Metric label="Current depth" value={String(explorer.progress.currentDepth)} />
              <Metric label="Duration" value={formatDuration(explorer.progress.durationMs)} />
            </div>
            <p className="activity-copy">
              {explorer.phase === 'running'
                ? 'Exploring independent event schedules in a Web Worker.'
                : explorer.phase === 'ready'
                  ? 'Ready to explore a finite, deterministic state space.'
                  : explorer.result?.message ?? 'Run status reflects the last completed exploration.'}
            </p>
          </aside>
        </div>

        {explorer.phase === 'violation' && counterexample && explorer.result ? (
          <section className="result-panel violation" aria-labelledby="violation-title" data-testid="result-violation" role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <p className="eyebrow">Invariant violated</p>
              <h2 id="violation-title">{counterexample.invariantTitle}</h2>
              <p>
                RaceProof found a valid counterexample in {counterexample.minimizedLength} events. The original search trace had {counterexample.originalLength} events.
              </p>
            </div>
            <div className="result-stats">
              <span>Visited <strong>{formatNumber(explorer.result.metrics.visitedStates)}</strong></span>
              <span>Skipped duplicates <strong>{formatNumber(explorer.result.metrics.duplicateStatesSkipped)}</strong></span>
              <span>Rate <strong>{explorer.result.metrics.statesPerSecond.toFixed(1)}/s</strong></span>
            </div>
          </section>
        ) : null}

        {explorer.phase === 'bounded-success' && explorer.result ? (
          <section className="result-panel success" aria-labelledby="success-title" data-testid="result-success">
            <ShieldCheck aria-hidden="true" />
            <div>
              <p className="eyebrow">Bounded result</p>
              <h2 id="success-title">{completionTitle(explorer.result.reason)}</h2>
              <p>Checked depth {'<='} {explorer.result.bounds.maxDepth}, up to {formatNumber(explorer.result.bounds.maxStates)} unique states, with a {formatDuration(explorer.result.bounds.timeoutMs)} timeout. This is not an unbounded proof.</p>
            </div>
          </section>
        ) : null}

        {explorer.phase === 'cancelled' ? (
          <section className="result-panel cancelled" role="status">
            <Square aria-hidden="true" />
            <div><p className="eyebrow">Run cancelled</p><h2>Exploration stopped safely.</h2><p>You can adjust bounds and run again; no partial result is presented as a verification outcome.</p></div>
          </section>
        ) : null}

        <section className="panel timeline-panel" aria-labelledby="timeline-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Counterexample replay</p>
              <h2 id="timeline-title">Step through the schedule</h2>
            </div>
            <div className="replay-actions">
              <button className="icon-button" type="button" onClick={previous} disabled={currentStep === null || replayIndex === 0} aria-label="Previous timeline event"><ChevronLeft size={18} aria-hidden="true" /></button>
              <button className="icon-button" type="button" onClick={() => setPlaying((value) => !value)} disabled={currentStep === null} aria-label={playing ? 'Pause timeline replay' : 'Play timeline replay'}>{playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}</button>
              <button className="icon-button" type="button" onClick={next} disabled={currentStep === null || replayIndex >= steps.length - 1} aria-label="Next timeline event" data-testid="timeline-next"><ChevronRight size={18} aria-hidden="true" /></button>
            </div>
          </div>
          {steps.length === 0 ? (
            <div className="empty-timeline"><Play aria-hidden="true" /><p>Run a buggy model to reveal a replayable event order. Use left/right arrows and space after a trace is available.</p></div>
          ) : (
            <div className="timeline" aria-label="Counterexample event timeline">
              {steps.map((step, index) => (
                <button key={`${step.index}-${step.transitionId}`} type="button" className={`timeline-step ${index === replayIndex ? 'current' : ''}`} onClick={() => setReplayIndex(index)} aria-current={index === replayIndex ? 'step' : undefined}>
                  <span className="timeline-number">{index + 1}</span>
                  <span className="timeline-actor">{step.actor}</span>
                  <span className="timeline-label">{step.label}</span>
                  <code>{step.transitionId}</code>
                </button>
              ))}
            </div>
          )}
          {currentStep ? <p className="step-description"><strong>Step {currentStep.index + 1}:</strong> {currentStep.description ?? currentStep.label}</p> : null}
        </section>

        <section className="inspector-grid" aria-label="State inspector">
          <div className="panel inspector-panel">
            <div className="section-heading compact"><div><p className="eyebrow">State inspector</p><h2>Before and after</h2></div></div>
            {currentStep ? (
              <div className="json-grid">
                <JsonPanel title="State before" value={currentStep.before} onCopy={(value) => void copyText(value, 'State JSON')} />
                <JsonPanel title="State after" value={currentStep.after} onCopy={(value) => void copyText(value, 'State JSON')} />
              </div>
            ) : <p className="muted">No event selected yet. The inspector will show the exact immutable state snapshots during replay.</p>}
          </div>
          <div className="panel changes-panel">
            <div className="section-heading compact"><div><p className="eyebrow">Structured diff</p><h2>Changed fields</h2></div></div>
            <DiffList step={currentStep} />
            {currentStep ? <div className="invariant-list" aria-label="Invariant status after event">{currentStep.invariants.map((invariant) => <span key={invariant.id} className={invariant.holds ? 'holds' : 'fails'}>{invariant.holds ? 'Pass' : 'Fail'} - {invariant.title}</span>)}</div> : null}
          </div>
        </section>

        <section className="panel generated-panel" aria-labelledby="generated-title">
          <div className="section-heading">
            <div><p className="eyebrow">Generated test</p><h2 id="generated-title">Turn this schedule into a Vitest regression</h2></div>
            {generatedTest ? <div className="replay-actions"><button className="secondary-button" type="button" onClick={() => void copyText(generatedTest, 'Generated test')}><Clipboard size={16} aria-hidden="true" /> Copy</button><button className="secondary-button" type="button" onClick={downloadTest}><Download size={16} aria-hidden="true" /> Download</button></div> : null}
          </div>
          {generatedTest ? <><p className="generated-note">The exported assertion should fail for this buggy model and pass after the same logical scenario uses the fixed model.</p><CodeViewer source={generatedTest} /></> : <p className="muted">A valid counterexample creates a self-contained Vitest replay test here. It never contains machine-specific paths.</p>}
        </section>


        <section className="panel transfer-panel" aria-labelledby="transfer-title">
          <div className="section-heading">
            <div><p className="eyebrow">Portable result data</p><h2 id="transfer-title">Import or export a run result</h2></div>
            <div className="replay-actions">
              <button className="secondary-button" type="button" onClick={downloadRunResult} disabled={explorer.result === null}><Download size={16} aria-hidden="true" /> Export JSON</button>
              <button className="secondary-button" type="button" onClick={() => resultFileRef.current?.click()}><Clipboard size={16} aria-hidden="true" /> Import JSON</button>
              <input ref={resultFileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importRunResult(event)} />
            </div>
          </div>
          <p className="muted">Only structured RaceProof v1 result data under 1 MB is accepted. Definitions and executable code are never imported.</p>
        </section>
        <section className="education-grid" aria-label="Why this example matters">
          <article><p className="eyebrow">Why ordinary tests miss it</p><h2>{example.title}</h2><p>{example.ordinaryTests}</p></article>
          <article><p className="eyebrow">Failure order</p><h2>One harmful timeline</h2><p>{example.failureOrder}</p></article>
          <article><p className="eyebrow">Why the fixed model holds</p><h2>Guard the shared decision</h2><p>{example.fixedApproach}</p></article>
        </section>
      </main>
      {notice ? <div className="toast" role="status"><CheckCircle2 size={16} aria-hidden="true" /> {notice}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">Close</button></div> : null}
    </div>
  );
}
