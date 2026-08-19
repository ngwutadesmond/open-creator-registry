import { describe, expect, it } from 'vitest';

import {
  countryCodes,
  countryOptionsByName,
  formatCountryCode,
  formatSubmissionCategory,
  getCountryAliases,
  getCountryOption,
  isCountryCode,
  normalizePublicSourceUrl,
  submissionCategories,
} from './submissions';

describe('public submission options', () => {
  it('centralizes controlled category values and preserves unknown legacy labels', () => {
    expect(submissionCategories).toHaveLength(15);
    expect(formatSubmissionCategory('film_tv')).toBe('Film & Television');
    expect(formatSubmissionCategory('legacy free-text category')).toBe('legacy free-text category');
    expect(formatSubmissionCategory(null)).toBeNull();
    expect(new Set(submissionCategories.map(({ value }) => value)).size).toBe(
      submissionCategories.length,
    );
  });

  it('provides the complete unique uppercase ISO alpha-2 list and friendly display labels', () => {
    expect(countryCodes).toHaveLength(249);
    expect(new Set(countryCodes).size).toBe(countryCodes.length);
    expect(countryCodes.every((code) => /^[A-Z]{2}$/u.test(code))).toBe(true);
    expect(formatCountryCode('NG')).toBe('Nigeria (NG)');
    expect(formatCountryCode('GH')).toBe('Ghana (GH)');
    expect(formatCountryCode('US')).toBe('United States (US)');
    expect(formatCountryCode('GB')).toBe('United Kingdom (GB)');
    expect(formatCountryCode('legacy')).toBe('legacy');
    expect(getCountryOption('ng')?.name).toBe('Nigeria');
    expect(isCountryCode('NG')).toBe(true);
    expect(isCountryCode('ZZ')).toBe(false);
    expect(getCountryAliases('GB')).toContain('UK');
    expect(countryOptionsByName[0]?.name).toBe('Afghanistan');
  });

  it('normalizes only valid public http and https URLs for duplicate comparison', () => {
    expect(normalizePublicSourceUrl(' HTTPS://EXAMPLE.COM/profile ')).toBe(
      'https://example.com/profile',
    );
    expect(normalizePublicSourceUrl('http://example.com:80/profile')).toBe(
      'http://example.com/profile',
    );
    expect(normalizePublicSourceUrl('ftp://example.com/profile')).toBeNull();
    expect(normalizePublicSourceUrl('not-a-url')).toBeNull();
  });
});
