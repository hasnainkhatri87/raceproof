import type { JSX } from 'react';

type TokenKind = 'plain' | 'comment' | 'keyword' | 'string' | 'number';

const TOKEN_PATTERN = /(\/\/[^\n]*|`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|\b(?:import|from|describe|it|const|expect|true|false|undefined)\b|\b\d+(?:\.\d+)?\b)/g;

function tokenKind(value: string): TokenKind {
  if (value.startsWith('//')) return 'comment';
  if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) return 'string';
  if (/^\d/.test(value)) return 'number';
  if (/^(import|from|describe|it|const|expect|true|false|undefined)$/.test(value)) return 'keyword';
  return 'plain';
}

/** A deliberately small, text-only TypeScript highlighter; it never injects HTML. */
export function CodeViewer({ source }: { source: string }): JSX.Element {
  const tokens: Array<{ value: string; kind: TokenKind }> = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ value: source.slice(last, index), kind: 'plain' });
    const value = match[0];
    if (value !== undefined) tokens.push({ value, kind: tokenKind(value) });
    last = index + (value?.length ?? 0);
  }
  if (last < source.length) tokens.push({ value: source.slice(last), kind: 'plain' });
  return (
    <pre className="code-block" aria-label="Syntax-highlighted generated Vitest test"><code>
      {tokens.map((token, index) => <span key={`${index}-${token.kind}`} className={`token ${token.kind}`}>{token.value}</span>)}
    </code></pre>
  );
}
