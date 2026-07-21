import { describe, expect, it } from 'vitest';

import { getRegistrySearchMessage } from './phase-messages';

describe('phased public messages', () => {
  it('requires a non-empty registry search', () => {
    expect(getRegistrySearchMessage('   ')).toBe(
      'Enter a creator name, alias, or handle to search the registry.',
    );
  });

  it('describes the API and explorer boundary for a valid search', () => {
    expect(getRegistrySearchMessage('  Example Creator  ')).toBe(
      '“Example Creator” can be searched here when the public explorer is connected in Phase 4. The API is available now.',
    );
  });
});
