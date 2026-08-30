import { describe, expect, it } from 'vitest';

import {
  aliasPatchSchema,
  creatorInputSchema,
  creatorPatchSchema,
  externalProfileInputSchema,
  externalProfilePatchSchema,
  handleInputSchema,
  handlePatchSchema,
  sourcePatchSchema,
} from './schemas';

describe('administration create and PATCH schemas', () => {
  it('keeps creator defaults on create and omits them from partial updates', () => {
    expect(
      creatorInputSchema.parse({
        canonical_name: 'Fictional Creator',
        entity_type: 'person',
        protection_tier: 'standard',
        review_status: 'pending',
      }),
    ).toMatchObject({ notoriety_score: 0, allow_common_name_duplicate: false });

    expect(creatorPatchSchema.parse({ review_status: 'approved' })).toEqual({
      review_status: 'approved',
    });
    expect(creatorPatchSchema.parse({ notoriety_score: 0 })).toEqual({ notoriety_score: 0 });
    expect(creatorPatchSchema.parse({ allow_common_name_duplicate: false })).toEqual({
      allow_common_name_duplicate: false,
    });
    expect(creatorPatchSchema.parse({ primary_category: null })).toEqual({
      primary_category: null,
    });
    expect(creatorPatchSchema.parse({ biography_summary: '' })).toEqual({
      biography_summary: '',
    });
    expect(creatorPatchSchema.safeParse({}).success).toBe(false);
    expect(
      creatorPatchSchema.safeParse({ review_status: 'approved', unexpected: true }).success,
    ).toBe(false);
  });

  it('keeps handle status as a create-only default', () => {
    expect(
      handleInputSchema.parse({
        creator_entity_id: '10000000-0000-4000-8000-000000000001',
        display_handle: 'fictional_handle',
        classification: 'monitored',
        confidence_score: 70,
        decision_source: 'review_test',
        reason: 'Fictional handle used for schema regression coverage.',
      }).status,
    ).toBe('active');

    expect(handlePatchSchema.parse({ confidence_score: 71 })).toEqual({ confidence_score: 71 });
    expect(handlePatchSchema.parse({ status: 'active' })).toEqual({ status: 'active' });
    expect(handlePatchSchema.safeParse({}).success).toBe(false);
    expect(handlePatchSchema.safeParse({ reason: 'A long enough reason.', extra: 1 }).success).toBe(
      false,
    );
  });

  it('keeps external-profile primary state as a create-only default', () => {
    expect(
      externalProfileInputSchema.parse({
        platform: 'x',
        platform_account_id: 'fictional-account',
        verification_status: 'source_linked',
        visibility_status: 'public',
        source_name: 'fictional_source',
        confidence_score: 80,
        change_reason: 'Create a fictional profile for schema coverage.',
      }).is_primary,
    ).toBe(false);

    expect(
      externalProfilePatchSchema.parse({
        verification_status: 'cross_source_confirmed',
        change_reason: 'Record additional fictional evidence.',
      }),
    ).toEqual({
      verification_status: 'cross_source_confirmed',
      change_reason: 'Record additional fictional evidence.',
    });
    expect(
      externalProfilePatchSchema.parse({
        is_primary: false,
        change_reason: 'Intentionally unset the fictional primary profile.',
      }),
    ).toEqual({
      is_primary: false,
      change_reason: 'Intentionally unset the fictional primary profile.',
    });
    expect(externalProfilePatchSchema.safeParse({}).success).toBe(false);
    expect(
      externalProfilePatchSchema.safeParse({
        change_reason: 'Reject an unknown profile field.',
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it('preserves explicit nullable alias and source fields without materialising omissions', () => {
    expect(aliasPatchSchema.parse({ language: null })).toEqual({ language: null });
    expect(sourcePatchSchema.parse({ source_url: null })).toEqual({ source_url: null });
    expect(aliasPatchSchema.safeParse({}).success).toBe(false);
    expect(sourcePatchSchema.safeParse({}).success).toBe(false);
    expect(aliasPatchSchema.safeParse({ confidence_score: 80, extra: true }).success).toBe(false);
    expect(
      sourcePatchSchema.safeParse({ verification_status: 'verified', extra: true }).success,
    ).toBe(false);
  });
});
