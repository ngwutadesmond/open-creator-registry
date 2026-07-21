export const registryClassifications = [
  'hard_reserved',
  'soft_protected',
  'monitored',
  'not_listed',
] as const;

export type RegistryClassification = (typeof registryClassifications)[number];

export const recommendedActions = [
  'deny_and_offer_claim',
  'require_claim_or_review',
  'allow_with_impersonation_monitoring',
  'perform_platform_availability_check',
] as const;

export type RecommendedAction = (typeof recommendedActions)[number];

export const recommendedActionByClassification = {
  hard_reserved: 'deny_and_offer_claim',
  soft_protected: 'require_claim_or_review',
  monitored: 'allow_with_impersonation_monitoring',
  not_listed: 'perform_platform_availability_check',
} as const satisfies Record<RegistryClassification, RecommendedAction>;

export function getRecommendedAction(classification: RegistryClassification): RecommendedAction {
  return recommendedActionByClassification[classification];
}
