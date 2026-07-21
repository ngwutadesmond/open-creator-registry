import { describe, expect, it } from 'vitest';

import {
  createConfusableSkeleton,
  createHandleCandidates,
  HandleNormalizationError,
  isPotentialProtectedVariant,
  normalizeCreatorName,
  normalizeHandle,
  validateHandle,
} from './index';

describe('normalizeHandle', () => {
  it.each([
    ['@@Creator', 'creator'],
    ['  Creator  ', 'creator'],
    ['CREATOR', 'creator'],
    ['Ｃｒｅａｔｏｒ', 'creator'],
    ['creator.name', 'creator_name'],
    ['creator-name', 'creator_name'],
    ['creator name', 'creator_name'],
    ['creator...--- name', 'creator_name'],
    ['__creator__', 'creator'],
  ])('normalizes %s deterministically', (input, expected) => {
    expect(normalizeHandle(input)).toBe(expected);
    expect(normalizeHandle(input)).toBe(normalizeHandle(input));
  });

  it('preserves the original input at the validation boundary', () => {
    expect(validateHandle('  @Creator.Name ')).toEqual({
      valid: true,
      original: '  @Creator.Name ',
      normalized: 'creator_name',
    });
  });

  it.each([[''], ['@@@'], ['___'], ['   ']])('rejects empty normalized input %s', (input) => {
    expect(validateHandle(input)).toMatchObject({ valid: false, issues: [{ code: 'empty' }] });
  });

  it('rejects non-string input', () => {
    expect(validateHandle(42)).toMatchObject({ valid: false, issues: [{ code: 'not_string' }] });
  });

  it('rejects unsupported characters', () => {
    expect(validateHandle('creator/official')).toMatchObject({
      valid: false,
      issues: [{ code: 'unsupported_characters' }],
    });
    expect(() => normalizeHandle('creator😀')).toThrow(HandleNormalizationError);
  });

  it('enforces configurable code-point length limits', () => {
    expect(validateHandle('a')).toMatchObject({ valid: false, issues: [{ code: 'too_short' }] });
    expect(validateHandle('abcd', { maximumLength: 3 })).toMatchObject({
      valid: false,
      issues: [{ code: 'too_long' }],
    });
  });
});

describe('creator-name normalization', () => {
  it('normalizes compatibility forms, separators, case, and whitespace', () => {
    expect(normalizeCreatorName('  Demo－Creator.Name  ')).toBe('demo creator name');
  });
});

describe('confusable risk signals', () => {
  it('maps a documented Latin and Cyrillic subset', () => {
    expect(createConfusableSkeleton('creatоr')).toBe(createConfusableSkeleton('creator'));
    expect(createConfusableSkeleton('аur0ra')).toBe(createConfusableSkeleton('aurora'));
  });

  it('creates exact, separatorless, and confusable candidates', () => {
    expect(createHandleCandidates('Creator.Name')).toEqual({
      normalizedHandle: 'creator_name',
      separatorlessHandle: 'creatorname',
      confusableSkeleton: 'creatorname',
    });
  });

  it('distinguishes exact handles from protected variants', () => {
    expect(isPotentialProtectedVariant('aurora', 'aurora')).toBe(false);
    expect(isPotentialProtectedVariant('aurora.vale', 'aurora_vale')).toBe(false);
    expect(isPotentialProtectedVariant('аurora', 'aurora')).toBe(true);
    expect(isPotentialProtectedVariant('real_aurora', 'aurora')).toBe(true);
    expect(isPotentialProtectedVariant('aurora_fans', 'aurora')).toBe(true);
  });

  it('does not infer identity from an unrelated common name', () => {
    expect(isPotentialProtectedVariant('alex_jones', 'alex_lee')).toBe(false);
  });
});
