export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * A deterministic, immutable state transition. State is intentionally not
 * constrained to JsonValue at compile time so normal TypeScript interfaces can
 * be used; definitions are checked at runtime before exploration.
 */
export interface Transition<State> {
  readonly id: string;
  readonly label: string;
  readonly actor: string;
  readonly description?: string;
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
  isEnabled(state: Readonly<State>): boolean;
  apply(state: Readonly<State>): State;
}

export interface Invariant<State> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  check(state: Readonly<State>): boolean;
}

export interface SystemDefinition<State> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly initialState: State;
  readonly transitions: readonly Transition<State>[];
  readonly invariants: readonly Invariant<State>[];
}

export interface InvariantResult {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly passed: boolean;
}

export type StateDiffKind = 'added' | 'removed' | 'changed';

export interface StateDiffEntry {
  /** RFC 6901 JSON Pointer. The empty string identifies the root. */
  readonly path: string;
  readonly kind: StateDiffKind;
  readonly before?: JsonValue;
  readonly after?: JsonValue;
}

export type ValidationIssueCode =
  | 'invalid-system'
  | 'invalid-id'
  | 'invalid-title'
  | 'invalid-description'
  | 'invalid-transitions'
  | 'invalid-invariants'
  | 'duplicate-transition-id'
  | 'duplicate-invariant-id'
  | 'invalid-transition'
  | 'invalid-invariant'
  | 'non-json-state';

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type DefinitionValidationResult =
  | { readonly valid: true; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly ValidationIssue[] };
