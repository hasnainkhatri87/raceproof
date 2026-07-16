import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SystemDefinition } from '@raceproof/core';
import { EXAMPLE_IDS, getExampleMetadata, getExampleSystem } from '@raceproof/examples';
import { explore } from '@raceproof/explorer';

describe('bundled fixed-model property checks', () => {
  it('does not violate any fixed example under a reproducible selection of catalog cases', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...EXAMPLE_IDS), fc.integer(), async (exampleId, seed) => {
        const metadata = getExampleMetadata(exampleId);
        const result = await explore(
          getExampleSystem(exampleId, 'fixed') as unknown as SystemDefinition<unknown>,
          { ...metadata.documentedBounds, algorithm: 'random', randomSeed: seed },
        );
        expect(result.reason).not.toBe('violation');
        expect(result.reason).not.toBe('invalid-system');
      }),
      { numRuns: 30 },
    );
  });
});
