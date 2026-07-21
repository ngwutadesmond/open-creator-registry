import { describe, expect, it } from 'vitest';

import { apiDocumentationPhaseMessage, getRegistrySearchMessage } from './phase-messages';

describe('phased public messages', () => {
  it('requires a non-empty registry search', () => {
    expect(getRegistrySearchMessage('   ')).toBe(
      'Enter a creator name, alias, or handle to search the registry.',
    );
  });

  it('describes the API and explorer boundary for a valid search', () => {
    expect(getRegistrySearchMessage('  Example Creator  ')).toBe(
      '“Example Creator” can be searched after the public API and explorer are connected in Phases 3 and 4.',
    );
  });

  it('states when API documentation becomes available', () => {
    expect(apiDocumentationPhaseMessage).toContain('Phase 3');
  });
});
