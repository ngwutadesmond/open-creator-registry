import { describe, expect, it } from 'vitest';

import {
  aliasTypes,
  candidateStatuses,
  creatorProtectionTiers,
  creatorReviewStatuses,
  ingestionStatuses,
  handleMatchTypes,
  registryReleaseStatuses,
  reservationStatuses,
  sourceVerificationStatuses,
  submissionStatuses,
} from './domain';

describe('domain enumerations', () => {
  it('centralizes the supported persistence values', () => {
    expect(creatorProtectionTiers).toEqual(['critical', 'notable', 'watchlist', 'standard']);
    expect(creatorReviewStatuses).toContain('disputed');
    expect(reservationStatuses).toContain('released');
    expect(aliasTypes).toContain('protected_variant');
    expect(sourceVerificationStatuses).toContain('stale');
    expect(candidateStatuses).toContain('merged');
    expect(submissionStatuses).toContain('under_review');
    expect(registryReleaseStatuses).toContain('superseded');
    expect(ingestionStatuses).toContain('completed_with_errors');
    expect(handleMatchTypes).toEqual([
      'exact_handle',
      'official_handle_alias',
      'protected_variant',
      'alias',
      'confusable_skeleton',
      'monitored_variant',
      'none',
    ]);
  });
});
