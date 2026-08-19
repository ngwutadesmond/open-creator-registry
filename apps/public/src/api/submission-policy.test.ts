import { describe, expect, it } from 'vitest';

import {
  createSubmissionFingerprint,
  deterministicUuid,
  stableSubmissionFingerprintValue,
} from './submission-policy';

describe('public submission fingerprint policy', () => {
  const substantive = {
    creatorName: 'Registry Fingerprint Creator',
    category: 'music',
    countryCodes: ['NG', 'GH'],
    requestedHandles: ['@registry.one', 'registry_two'],
    publicSources: ['https://example.test/one', 'https://example.org/two'],
  };

  it('is stable across input order, harmless casing, and normalized handle separators', async () => {
    const reordered = {
      creatorName: '  registry fingerprint creator ',
      category: 'music',
      countryCodes: ['gh', 'NG'],
      requestedHandles: ['@REGISTRY-TWO', 'registry_one'],
      publicSources: ['https://EXAMPLE.org/two', 'https://example.test/one'],
    };
    expect(stableSubmissionFingerprintValue(reordered)).toBe(
      stableSubmissionFingerprintValue(substantive),
    );
    expect(await createSubmissionFingerprint(reordered)).toBe(
      await createSubmissionFingerprint(substantive),
    );
  });

  it('changes when substantive submission data changes', async () => {
    expect(await createSubmissionFingerprint({ ...substantive, category: 'technology' })).not.toBe(
      await createSubmissionFingerprint(substantive),
    );
  });

  it('creates deterministic valid UUIDs for idempotent row identifiers', async () => {
    const first = await deterministicUuid('batch:2:fingerprint');
    expect(await deterministicUuid('batch:2:fingerprint')).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });
});
