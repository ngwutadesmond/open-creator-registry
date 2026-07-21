import { describe, expect, it } from 'vitest';

import {
  normalizeExternalProfilePlatform,
  normalizeExternalProfileUrl,
  normalizePlatformHandle,
  validateExternalProfileLocator,
} from './external-profiles';

describe('external profile normalization', () => {
  it('stores twitter as x and normalizes handles', () => {
    expect(normalizeExternalProfilePlatform('Twitter')).toBe('x');
    expect(normalizePlatformHandle('  @Creator.Name ')).toBe('creator.name');
  });

  it.each([
    ['youtube', 'https://www.youtube.com/@creator'],
    ['spotify', 'https://open.spotify.com/artist/123'],
    ['tiktok', 'https://www.tiktok.com/@creator'],
    ['instagram', 'https://www.instagram.com/creator/'],
    ['x', 'https://twitter.com/creator'],
    ['facebook', 'https://www.facebook.com/creator'],
    ['official_website', 'https://creator.example/about'],
  ] as const)('accepts an allowlisted %s URL', (platform, url) => {
    expect(normalizeExternalProfileUrl(platform, url)).toMatch(/^https:/u);
  });

  it('rejects mismatched, unsafe and non-HTTPS URLs', () => {
    expect(() => normalizeExternalProfileUrl('instagram', 'https://example.com/creator')).toThrow(
      /selected platform/u,
    );
    expect(() => normalizeExternalProfileUrl('official_website', 'https://127.0.0.1/a')).toThrow(
      /local or private/u,
    );
    expect(() => normalizeExternalProfileUrl('official_website', 'http://creator.example')).toThrow(
      /public HTTPS/u,
    );
  });

  it('requires at least one locator', () => {
    expect(() => validateExternalProfileLocator({})).toThrow(/At least one/u);
  });
});
