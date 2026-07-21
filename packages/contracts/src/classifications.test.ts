import { describe, expect, it } from 'vitest';

import {
  getRecommendedAction,
  registryClassifications,
  recommendedActionByClassification,
} from './classifications';

describe('registry classifications', () => {
  it('keeps every classification mapped to its required action', () => {
    expect(Object.keys(recommendedActionByClassification)).toEqual(registryClassifications);
    expect(getRecommendedAction('hard_reserved')).toBe('deny_and_offer_claim');
    expect(getRecommendedAction('soft_protected')).toBe('require_claim_or_review');
    expect(getRecommendedAction('monitored')).toBe('allow_with_impersonation_monitoring');
    expect(getRecommendedAction('not_listed')).toBe('perform_platform_availability_check');
  });
});
