import { describe, expect, it } from 'vitest';

import { apiDocumentationPhaseMessage, getRegistrySearchMessage } from './phase-messages';

describe('Phase 1 public messages', () => {
  it('requires a non-empty registry search', () => {
    expect(getRegistrySearchMessage('   ')).toBe(
      'Enter a creator name, alias, or handle to search the registry.',
    );
  });

  it('describes the data-layer boundary for a valid search', () => {
    expect(getRegistrySearchMessage('  Example Creator  ')).toBe(
      '“Example Creator” is ready for registry search when the Phase 2 data layer is connected.',
    );
  });

  it('states when API documentation becomes available', () => {
    expect(apiDocumentationPhaseMessage).toContain('Phase 3');
  });
});
