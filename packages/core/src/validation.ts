import { assertJsonValue, JsonCompatibilityError } from './json';
import type {
  DefinitionValidationResult,
  SystemDefinition,
  ValidationIssue,
  ValidationIssueCode,
} from './types';

function issue(code: ValidationIssueCode, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Performs structural validation without executing any user callbacks. */
export function validateSystemDefinition<State>(definition: SystemDefinition<State> | unknown): DefinitionValidationResult {
  const issues: ValidationIssue[] = [];
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
    return {
      valid: false,
      issues: [issue('invalid-system', '', 'System definition must be an object.')],
    };
  }

  const candidate = definition as Partial<SystemDefinition<State>>;
  if (!validText(candidate.id)) issues.push(issue('invalid-id', '/id', 'System id must be a non-empty string.'));
  if (!validText(candidate.title)) {
    issues.push(issue('invalid-title', '/title', 'System title must be a non-empty string.'));
  }
  if (!validText(candidate.description)) {
    issues.push(issue('invalid-description', '/description', 'System description must be a non-empty string.'));
  }

  try {
    assertJsonValue(candidate.initialState);
  } catch (error) {
    const detail = error instanceof JsonCompatibilityError ? error.message : 'Initial state is not JSON-compatible.';
    issues.push(issue('non-json-state', '/initialState', detail));
  }

  if (!Array.isArray(candidate.transitions) || candidate.transitions.length === 0) {
    issues.push(issue('invalid-transitions', '/transitions', 'At least one transition is required.'));
  } else {
    const ids = new Set<string>();
    candidate.transitions.forEach((transition, index) => {
      const path = `/transitions/${index}`;
      if (transition === null || typeof transition !== 'object') {
        issues.push(issue('invalid-transition', path, 'Transition must be an object.'));
        return;
      }
      if (!validText(transition.id)) {
        issues.push(issue('invalid-transition', `${path}/id`, 'Transition id must be a non-empty string.'));
      } else if (ids.has(transition.id)) {
        issues.push(
          issue('duplicate-transition-id', `${path}/id`, `Duplicate transition id "${transition.id}".`),
        );
      } else {
        ids.add(transition.id);
      }
      if (!validText(transition.label)) {
        issues.push(issue('invalid-transition', `${path}/label`, 'Transition label must be a non-empty string.'));
      }
      if (!validText(transition.actor)) {
        issues.push(issue('invalid-transition', `${path}/actor`, 'Transition actor must be a non-empty string.'));
      }
      if (typeof transition.isEnabled !== 'function') {
        issues.push(issue('invalid-transition', `${path}/isEnabled`, 'Transition requires an isEnabled function.'));
      }
      if (typeof transition.apply !== 'function') {
        issues.push(issue('invalid-transition', `${path}/apply`, 'Transition requires an apply function.'));
      }
    });
  }

  if (!Array.isArray(candidate.invariants) || candidate.invariants.length === 0) {
    issues.push(issue('invalid-invariants', '/invariants', 'At least one invariant is required.'));
  } else {
    const ids = new Set<string>();
    candidate.invariants.forEach((invariant, index) => {
      const path = `/invariants/${index}`;
      if (invariant === null || typeof invariant !== 'object') {
        issues.push(issue('invalid-invariant', path, 'Invariant must be an object.'));
        return;
      }
      if (!validText(invariant.id)) {
        issues.push(issue('invalid-invariant', `${path}/id`, 'Invariant id must be a non-empty string.'));
      } else if (ids.has(invariant.id)) {
        issues.push(issue('duplicate-invariant-id', `${path}/id`, `Duplicate invariant id "${invariant.id}".`));
      } else {
        ids.add(invariant.id);
      }
      if (!validText(invariant.title)) {
        issues.push(issue('invalid-invariant', `${path}/title`, 'Invariant title must be a non-empty string.'));
      }
      if (!validText(invariant.description)) {
        issues.push(
          issue('invalid-invariant', `${path}/description`, 'Invariant description must be a non-empty string.'),
        );
      }
      if (typeof invariant.check !== 'function') {
        issues.push(issue('invalid-invariant', `${path}/check`, 'Invariant requires a check function.'));
      }
    });
  }

  return issues.length === 0 ? { valid: true, issues: [] } : { valid: false, issues };
}
