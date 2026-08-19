import { normalizePublicSourceUrl } from '@open-creator-registry/contracts/submissions';
import { normalizeCreatorName, normalizeHandle } from '@open-creator-registry/normalization';

export type SubmissionFingerprintInput = {
  creatorName: string;
  category?: string | null;
  countryCodes?: string[] | null;
  requestedHandles: string[];
  publicSources: string[];
};

export type NormalizedSubmissionInput = {
  creatorName: string;
  normalizedCreatorName: string;
  category: string | null;
  countryCodes: string[];
  requestedHandles: string[];
  normalizedHandles: string[];
  publicSources: string[];
  submissionFingerprint: string;
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function stableSubmissionFingerprintValue(input: SubmissionFingerprintInput): string {
  return JSON.stringify({
    category: input.category ?? null,
    country_codes: uniqueSorted((input.countryCodes ?? []).map((code) => code.toUpperCase())),
    creator_name: normalizeCreatorName(input.creatorName),
    public_sources: uniqueSorted(
      input.publicSources.map((source) => normalizePublicSourceUrl(source) ?? source.trim()),
    ),
    requested_handles: uniqueSorted(
      input.requestedHandles.map((handle) => normalizeHandle(handle)),
    ),
    version: 1,
  });
}

export async function createSubmissionFingerprint(
  input: SubmissionFingerprintInput,
): Promise<string> {
  return sha256Hex(stableSubmissionFingerprintValue(input));
}

export async function normalizeSubmissionInput(
  input: SubmissionFingerprintInput,
): Promise<NormalizedSubmissionInput> {
  const creatorName = input.creatorName.trim();
  const countryCodes = (input.countryCodes ?? []).map((code) => code.trim().toUpperCase());
  const requestedHandles = input.requestedHandles.map((handle) => handle.trim());
  const publicSources = input.publicSources.map(
    (source) => normalizePublicSourceUrl(source) ?? source.trim(),
  );
  return {
    creatorName,
    normalizedCreatorName: normalizeCreatorName(creatorName),
    category: input.category ?? null,
    countryCodes,
    requestedHandles,
    normalizedHandles: requestedHandles.map((handle) => normalizeHandle(handle)),
    publicSources,
    submissionFingerprint: await createSubmissionFingerprint({
      creatorName,
      category: input.category,
      countryCodes,
      requestedHandles,
      publicSources,
    }),
  };
}

export async function createPreviewChecksum(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(value));
}

export async function deterministicUuid(value: string): Promise<string> {
  const hex = await sha256Hex(value);
  const bytes = hex.slice(0, 32).split('');
  bytes[12] = '4';
  const variant = Number.parseInt(bytes[16] ?? '0', 16);
  bytes[16] = ((variant & 0x3) | 0x8).toString(16);
  const compact = bytes.join('');
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}
