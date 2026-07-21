import type { ExternalProfilePlatform } from '@open-creator-registry/contracts/sources';

const platformAliases = { twitter: 'x' } as const;

const allowedHosts: Readonly<Partial<Record<ExternalProfilePlatform, readonly string[]>>> = {
  youtube: ['youtube.com', 'www.youtube.com'],
  spotify: ['open.spotify.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  facebook: ['facebook.com', 'www.facebook.com'],
  twitch: ['twitch.tv', 'www.twitch.tv'],
  soundcloud: ['soundcloud.com', 'www.soundcloud.com'],
  apple_music: ['music.apple.com'],
};

const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u;
const unsafeHostname = /^(?:localhost|.*\.localhost|\[?::1\]?|0\.0\.0\.0)$/iu;

export function normalizeExternalProfilePlatform(input: string): ExternalProfilePlatform {
  const normalized = input.trim().toLowerCase().replaceAll('-', '_');
  const alias = normalized === 'twitter' ? platformAliases.twitter : undefined;
  return (alias ?? normalized) as ExternalProfilePlatform;
}

export function normalizePlatformHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input.trim().replace(/^@+/u, '').normalize('NFKC').toLocaleLowerCase('und');
  if (!normalized) return null;
  if (!/^[\p{L}\p{N}._-]{1,100}$/u.test(normalized)) {
    throw new Error('The platform handle contains unsupported characters.');
  }
  return normalized;
}

function isUnsafeOfficialWebsiteHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (unsafeHostname.test(lower) || privateIpv4.test(lower)) return true;
  if (/^\d+(?:\.\d+){3}$/u.test(lower)) return true;
  return lower.endsWith('.local') || lower.endsWith('.internal');
}

export function normalizeExternalProfileUrl(
  platform: ExternalProfilePlatform,
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('The external profile URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('External profile URLs must use public HTTPS without embedded credentials.');
  }
  const hostname = url.hostname.toLowerCase();
  if (platform === 'official_website' || platform === 'other') {
    if (isUnsafeOfficialWebsiteHost(hostname)) {
      throw new Error('Official website URLs cannot target local or private-network hosts.');
    }
  } else if (!allowedHosts[platform]?.includes(hostname)) {
    throw new Error(`The selected platform cannot use the host ${hostname}.`);
  }
  url.hostname = hostname;
  url.hash = '';
  return url.toString();
}

export function validateExternalProfileLocator(input: {
  platformAccountId?: string | null;
  platformHandle?: string | null;
  profileUrl?: string | null;
}): void {
  if (
    !input.platformAccountId?.trim() &&
    !input.platformHandle?.trim() &&
    !input.profileUrl?.trim()
  ) {
    throw new Error('At least one stable account ID, handle, or profile URL is required.');
  }
}

export function externalProfileHosts(platform: ExternalProfilePlatform): readonly string[] {
  return allowedHosts[platform] ?? [];
}
